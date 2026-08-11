import React, { useState, useEffect, useRef } from 'react';
import { Book, Chapter, ThemeMode, ReadingSettings } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getBookmark, saveBookmark } from '../lib/bookmarks';
import { getMyReview, upsertReview } from '../lib/reviews';
import { logRead } from '../lib/reads';
import { createTipCheckout, getBookTipEligibility } from '../lib/creatorPayments';
import { claimFreeBook, createPurchaseCheckout } from '../lib/purchases';
import { loadBookById } from '../lib/books';
import CommentSection from './CommentSection';

interface ReaderProps {
  book: Book;
  onClose: () => void;
  externalTheme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onRequireSignIn: (reason?: string) => void;
  onBookUpdate: (book: Book) => void;
}

const getDeviceWidth = () => (typeof window === 'undefined' ? 1280 : window.innerWidth);

const getDefaultTypography = (width: number) => {
  if (width < 640) return { fontSize: 16, lineHeight: 1.75 };
  if (width < 1024) return { fontSize: 18, lineHeight: 1.8 };
  return { fontSize: 20, lineHeight: 1.85 };
};

const getFontRange = (width: number) => {
  if (width < 640) return { min: 14, max: 22 };
  if (width < 1024) return { min: 15, max: 28 };
  return { min: 16, max: 32 };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// "Effective" reading time - only accumulates while the tab is actually
// visible, so a book left open in a background tab doesn't silently rack up
// minutes.
const TIP_PROMPT_THRESHOLD_SECONDS = 60 * 60;

const Reader: React.FC<ReaderProps> = ({ book, onClose, externalTheme, onThemeChange, onRequireSignIn, onBookUpdate }) => {
  const { user, loading: authLoading } = useAuth();
  const [viewportWidth, setViewportWidth] = useState(getDeviceWidth);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [readingProgress, setReadingProgress] = useState(0);
  const [settings, setSettings] = useState<ReadingSettings>(() => {
    const defaults = getDefaultTypography(getDeviceWidth());
    return {
      theme: externalTheme,
      fontSize: defaults.fontSize,
      lineHeight: defaults.lineHeight
    };
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewBody, setReviewBody] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [tipEligible, setTipEligible] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [tipAmountCents, setTipAmountCents] = useState(500);
  const [tipCustom, setTipCustom] = useState('');
  const [tipSubmitting, setTipSubmitting] = useState(false);
  const [tipError, setTipError] = useState<string | null>(null);
  const [showContinueGate, setShowContinueGate] = useState(false);
  const [continueSubmitting, setContinueSubmitting] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);
  const [showTipPrompt, setShowTipPrompt] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const atLoadedEdge = currentChapterIndex === book.chapters.length - 1;
  const moreExists = book.totalChapterCount > book.chapters.length;

  const chapter = book.chapters[currentChapterIndex];
  const fontRange = getFontRange(viewportWidth);

  // Sync settings theme with external theme
  useEffect(() => {
    setSettings(s => ({ ...s, theme: externalTheme }));
  }, [externalTheme]);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const updatedRange = getFontRange(viewportWidth);
    setSettings(prev => ({
      ...prev,
      fontSize: clamp(prev.fontSize, updatedRange.min, updatedRange.max)
    }));
  }, [viewportWidth]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight > 0) {
        const progress = (window.scrollY / scrollHeight) * 100;
        setReadingProgress(progress);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Resume at the reader's last-read chapter for this book, if any. Gated
  // behind resumeReady so signed-in readers don't see a flash of chapter 1
  // before the async bookmark lookup lands.
  const [resumeReady, setResumeReady] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setResumeReady(true);
      return;
    }

    let cancelled = false;

    getBookmark(book.id, user.id)
      .then((bookmark) => {
        if (cancelled) return;
        if (bookmark?.chapterId) {
          const idx = book.chapters.findIndex((c) => c.id === bookmark.chapterId);
          if (idx !== -1) setCurrentChapterIndex(idx);
        }
        setResumeReady(true);
      })
      .catch((error) => {
        console.error('Bookmark lookup failed:', error);
        if (!cancelled) setResumeReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, book.id]);

  // Prefill the review modal with the reader's existing review for this book, if any.
  useEffect(() => {
    if (!showReview || !user) return;
    let cancelled = false;

    getMyReview(book.id, user.id)
      .then((review) => {
        if (cancelled || !review) return;
        setReviewRating(review.rating);
        setReviewBody(review.body ?? '');
      })
      .catch((error) => console.error('Review lookup failed:', error));

    return () => {
      cancelled = true;
    };
  }, [showReview, user, book.id]);

  // Log a read for whichever chapter is actually being shown, once resume
  // correction has landed - fires on both the initial view and every
  // subsequent chapter change (currentChapterIndex is in the deps).
  useEffect(() => {
    if (!resumeReady || !user) return;
    const currentChapter = book.chapters[currentChapterIndex];
    if (!currentChapter) return;
    logRead(currentChapter.id, user.id).catch((error) => console.error('Read log failed:', error));
  }, [resumeReady, user, book.id, currentChapterIndex]);

  // Whether this book's creator has finished Stripe onboarding - determines
  // if the tip button is shown at all. Public data (no auth needed).
  useEffect(() => {
    let cancelled = false;
    getBookTipEligibility(book.id)
      .then((eligible) => {
        if (!cancelled) setTipEligible(eligible);
      })
      .catch((error) => console.error('Tip eligibility check failed:', error));
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  // Fires at most once per book-reading session (this component's own
  // lifetime for the current book), and only once tipping is actually
  // possible for this book.
  const secondsReadRef = useRef(0);
  const hasShownTipPromptRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      secondsReadRef.current += 1;
      if (!hasShownTipPromptRef.current && tipEligible && secondsReadRef.current >= TIP_PROMPT_THRESHOLD_SECONDS) {
        hasShownTipPromptRef.current = true;
        setShowTipPrompt(true);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [tipEligible]);

  const handleSubmitTip = async () => {
    const customCents = tipCustom ? Math.round(parseFloat(tipCustom) * 100) : null;
    const amountCents = customCents ?? tipAmountCents;

    if (!Number.isInteger(amountCents) || amountCents < 50) {
      setTipError('Please enter an amount of at least $0.50.');
      return;
    }

    setTipError(null);
    setTipSubmitting(true);
    try {
      const url = await createTipCheckout(book.id, amountCents);
      window.location.href = url;
    } catch (error) {
      setTipError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
      setTipSubmitting(false);
    }
  };

  const goToChapter = (index: number) => {
    setCurrentChapterIndex(index);
    window.scrollTo(0, 0);
    if (user) {
      const nextChapter = book.chapters[index];
      if (nextChapter) {
        saveBookmark(book.id, user.id, nextChapter.id).catch((error) =>
          console.error('Bookmark save failed:', error)
        );
      }
    }
  };

  const handleNext = () => {
    if (atLoadedEdge && moreExists) {
      if (!user) {
        onRequireSignIn();
        return;
      }
      setContinueError(null);
      setShowContinueGate(true);
      return;
    }
    goToChapter(currentChapterIndex + 1);
  };

  // Swipe left/right to turn the page - reuses handleNext/goToChapter
  // directly so the chapter-3 wall and edge-of-book disabling are already
  // respected, exactly like the Turn Page/Turn Back buttons.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_MIN_DISTANCE = 60;

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    // Require a clearly horizontal gesture so normal vertical scrolling
    // through a chapter is never hijacked as a page turn.
    if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    if (deltaX < 0) {
      handleNext();
    } else if (currentChapterIndex > 0) {
      goToChapter(currentChapterIndex - 1);
    }
  };

  const handleClaimFree = async () => {
    if (!user) return;
    setContinueError(null);
    setContinueSubmitting(true);
    try {
      await claimFreeBook(book.id);
      const freshBook = await loadBookById(book.id);
      // Read off freshBook directly, not the stale `book` prop - it still
      // has the old 3-chapter array in this render pass, so indexing into
      // it here (e.g. via goToChapter) would be one chapter short.
      const nextChapter = freshBook.chapters[currentChapterIndex + 1];
      if (nextChapter) {
        saveBookmark(freshBook.id, user.id, nextChapter.id).catch((error) =>
          console.error('Bookmark save failed:', error)
        );
      }
      onBookUpdate(freshBook);
      setCurrentChapterIndex((i) => i + 1);
      window.scrollTo(0, 0);
      setShowContinueGate(false);
    } catch (error) {
      setContinueError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      setContinueSubmitting(false);
    }
  };

  const handleBuyToContinue = async () => {
    setContinueError(null);
    setContinueSubmitting(true);
    try {
      const url = await createPurchaseCheckout(book.id);
      window.location.href = url;
    } catch (error) {
      setContinueError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
      setContinueSubmitting(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!user || reviewRating === 0) return;
    setReviewSaving(true);
    try {
      await upsertReview(book.id, user.id, reviewRating, reviewBody);
      setReviewSaved(true);
    } catch (error) {
      console.error('Review save failed:', error);
    } finally {
      setReviewSaving(false);
    }
  };

  useEffect(() => {
    const preventCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      alert("The ink is protected by the archive's seal.");
    };

    const preventContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const preventKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'u' || e.key === 'p' || e.key === 's')) {
        e.preventDefault();
        alert("The Archives of Goddy Ora are for reading, not for copying.");
      }
    };

    document.addEventListener('copy', preventCopy);
    document.addEventListener('contextmenu', preventContextMenu);
    document.addEventListener('keydown', preventKeys);

    return () => {
      document.removeEventListener('copy', preventCopy);
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('keydown', preventKeys);
    };
  }, []);

  const getThemeClasses = () => {
    switch (settings.theme) {
      case 'sepia': return 'bg-[#f4ecd8] text-[#5b4636]';
      case 'light': return 'bg-[#f8f9fa] text-[#1a1a1a]';
      default: return 'bg-[#0a0a0a] text-[#e0e0e0]';
    }
  };

  const getPageClasses = () => {
    switch (settings.theme) {
      case 'sepia': return 'bg-[#fcf8ed] border-[#e9dec1] shadow-[0_10px_50px_rgba(91,70,54,0.15)]';
      case 'light': return 'bg-white border-black/5 shadow-[0_10px_50px_rgba(0,0,0,0.05)]';
      default: return 'bg-[#121212] border-white/5 shadow-[0_10px_50px_rgba(0,0,0,0.6)]';
    }
  };

  const getTitleColor = () => {
    switch (settings.theme) {
      case 'sepia': return 'text-[#8b4513]';
      case 'light': return 'text-[#1a1a1a]';
      default: return 'text-[#d4af37]';
    }
  };

  const handleAuraChange = (t: ThemeMode) => {
    setSettings(prev => ({ ...prev, theme: t }));
    if (t === 'light' || t === 'dark') {
      onThemeChange(t);
    }
  };

  const isSceneSubtitle = (paragraph: string) => {
    const text = paragraph.trim();
    if (!text) return false;
    if (/[.!?]$/.test(text)) return false;
    if (!/[;,]/.test(text)) return false;
    if (/^[•❖-]/.test(text)) return false;
    const wordCount = text.split(/\s+/).length;
    return wordCount >= 2 && wordCount <= 12;
  };

  const isWhenLoveSectionHeading = (paragraph: string) => {
    if (book.id !== 'when-love-starts-to-hurt') return false;
    const text = paragraph.trim();
    if (!text) return false;
    if (/^[•❖-]/.test(text)) return false;
    if (/[.!?]$/.test(text)) return false;
    const wordCount = text.split(/\s+/).length;
    if (wordCount < 2 || wordCount > 14) return false;
    return /^[A-Z0-9][A-Za-z0-9“”"'(),:&/ -]+:?$/.test(text);
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-700 ease-in-out pb-20 md:pb-32 ${getThemeClasses()}`}
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress Bar */}
      <div className="fixed top-0 left-0 w-full h-1 z-50 bg-gray-800/30">
        <div 
          className="h-full bg-[#d4af37] transition-all duration-300 shadow-[0_0_10px_#d4af37]"
          style={{ width: `${readingProgress}%` }}
        />
      </div>

      {/* Reader Controls */}
      <div className="fixed top-3 left-3 right-3 z-[90] flex items-center justify-between pointer-events-none">
        <button
          onClick={onClose}
          className={`pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold tracking-[0.12em] uppercase backdrop-blur-md transition-colors shadow-sm ${
            settings.theme === 'dark'
              ? 'bg-[#141414]/95 border-white/15 text-white hover:text-[#d4af37] hover:border-[#d4af37]/50'
              : settings.theme === 'sepia'
                ? 'bg-[#fcf8ed]/95 border-[#d9c8a3] text-[#5b4636] hover:text-[#8b4513] hover:border-[#8b4513]/40'
                : 'bg-white/95 border-black/10 text-[#1a1a1a] hover:text-[#8b4513] hover:border-[#8b4513]/40'
          }`}
        >
          <span className="text-base leading-none">←</span>
          Return
        </button>

        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 hidden md:block max-w-[42vw] truncate rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.38em] font-bold backdrop-blur-md text-[#d4af37] border-[#d4af37]/30 bg-black/35">
          {book.author} Presents
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => handleAuraChange(settings.theme === 'light' ? 'dark' : 'light')}
            className={`p-2.5 rounded-full border backdrop-blur-md transition-colors shadow-sm ${
              settings.theme === 'dark'
                ? 'bg-[#141414]/95 border-white/15 text-white hover:text-[#d4af37] hover:border-[#d4af37]/50'
                : settings.theme === 'sepia'
                  ? 'bg-[#fcf8ed]/95 border-[#d9c8a3] text-[#5b4636] hover:text-[#8b4513] hover:border-[#8b4513]/40'
                  : 'bg-white/95 border-black/10 text-[#1a1a1a] hover:text-[#8b4513] hover:border-[#8b4513]/40'
            }`}
            title="Toggle Light/Dark Mode"
          >
            {settings.theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2.5 rounded-full border backdrop-blur-md transition-colors shadow-sm ${
              settings.theme === 'dark'
                ? 'bg-[#141414]/95 border-white/15 text-white hover:text-[#d4af37] hover:border-[#d4af37]/50'
                : settings.theme === 'sepia'
                  ? 'bg-[#fcf8ed]/95 border-[#d9c8a3] text-[#5b4636] hover:text-[#8b4513] hover:border-[#8b4513]/40'
                  : 'bg-white/95 border-black/10 text-[#1a1a1a] hover:text-[#8b4513] hover:border-[#8b4513]/40'
            }`}
            title="Reader Settings"
          >
            <SettingsIcon />
          </button>
          <button
            onClick={() => {
              if (!user) {
                onRequireSignIn();
                return;
              }
              setReviewSaved(false);
              setShowReview(true);
            }}
            className={`p-2.5 rounded-full border backdrop-blur-md transition-colors shadow-sm ${
              settings.theme === 'dark'
                ? 'bg-[#141414]/95 border-white/15 text-white hover:text-[#d4af37] hover:border-[#d4af37]/50'
                : settings.theme === 'sepia'
                  ? 'bg-[#fcf8ed]/95 border-[#d9c8a3] text-[#5b4636] hover:text-[#8b4513] hover:border-[#8b4513]/40'
                  : 'bg-white/95 border-black/10 text-[#1a1a1a] hover:text-[#8b4513] hover:border-[#8b4513]/40'
            }`}
            title="Rate & Review"
          >
            <StarIcon />
          </button>
          {tipEligible && (
            <button
              onClick={() => {
                if (!user) {
                  onRequireSignIn('tip');
                  return;
                }
                setTipError(null);
                setShowTip(true);
              }}
              className={`p-2.5 rounded-full border backdrop-blur-md transition-colors shadow-sm ${
                settings.theme === 'dark'
                  ? 'bg-[#141414]/95 border-white/15 text-white hover:text-[#d4af37] hover:border-[#d4af37]/50'
                  : settings.theme === 'sepia'
                    ? 'bg-[#fcf8ed]/95 border-[#d9c8a3] text-[#5b4636] hover:text-[#8b4513] hover:border-[#8b4513]/40'
                    : 'bg-white/95 border-black/10 text-[#1a1a1a] hover:text-[#8b4513] hover:border-[#8b4513]/40'
              }`}
              title="Tip the Author"
            >
              <TipIcon />
            </button>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setShowSettings(false)}>
          <div 
            className="bg-[#161616] text-white p-6 sm:p-8 md:p-10 rounded-sm shadow-2xl w-full max-w-sm border border-[#d4af37]/20"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl sm:text-2xl font-['Playfair_Display'] mb-6 sm:mb-8 text-[#d4af37] italic">Archive Settings</h3>
            
            <div className="space-y-6 sm:space-y-8">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-4">Aura</label>
                <div className="flex gap-6">
                  {(['dark', 'light', 'sepia'] as ThemeMode[]).map(t => (
                    <button
                      key={t}
                      onClick={() => handleAuraChange(t)}
                      className={`w-12 h-12 rounded-full border-2 transition-all ${t === 'dark' ? 'bg-[#0f0f0f]' : t === 'light' ? 'bg-white' : 'bg-[#f4ecd8]'} ${settings.theme === t ? 'border-[#d4af37] scale-110' : 'border-white/10'}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-4">Text Scale</label>
                <input 
                  type="range" min={fontRange.min} max={fontRange.max} value={settings.fontSize}
                  onChange={e => setSettings({ ...settings, fontSize: parseInt(e.target.value) })}
                  className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#d4af37]"
                />
              </div>

              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-4 border border-[#d4af37]/40 text-[#d4af37] text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-[#d4af37] hover:text-black transition-all"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReview && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setShowReview(false)}>
          <div
            className="bg-[#161616] text-white p-6 sm:p-8 md:p-10 rounded-sm shadow-2xl w-full max-w-sm border border-[#d4af37]/20"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl sm:text-2xl font-['Playfair_Display'] mb-6 sm:mb-8 text-[#d4af37] italic">Rate & Review</h3>

            {reviewSaved ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-300 mb-6">Thank you for your review.</p>
                <button
                  onClick={() => setShowReview(false)}
                  className="w-full py-4 border border-[#d4af37]/40 text-[#d4af37] text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-[#d4af37] hover:text-black transition-all"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-6 sm:space-y-8">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-4">Your Rating</label>
                  <div className="flex gap-2 text-2xl">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setReviewRating(star)}
                        className={star <= reviewRating ? 'text-[#d4af37]' : 'text-white/20'}
                        aria-label={`${star} star${star > 1 ? 's' : ''}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-4">Review (optional)</label>
                  <textarea
                    value={reviewBody}
                    onChange={(e) => setReviewBody(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 rounded-sm border border-white/15 bg-[#0f0f0f] text-white text-sm focus:outline-none focus:border-[#d4af37]"
                  />
                </div>

                <button
                  onClick={handleSubmitReview}
                  disabled={reviewRating === 0 || reviewSaving}
                  className="w-full py-4 border border-[#d4af37]/40 text-[#d4af37] text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-[#d4af37] hover:text-black transition-all disabled:opacity-40"
                >
                  {reviewSaving ? 'Saving...' : 'Submit Review'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 60-Minute Tip Prompt - a small dismissible nudge, not a blocking
          modal, that opens the real Tip Modal on accept rather than
          duplicating its amount-selection UI. */}
      {showTipPrompt && (
        <div className="fixed bottom-5 right-5 z-[105] max-w-xs rounded-sm border border-[#d4af37]/30 bg-[#141414]/98 backdrop-blur-md text-white p-5 shadow-2xl animate-fadeIn">
          <p className="text-sm mb-4">Enjoying the story? Consider tipping {book.author} for their work.</p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setShowTipPrompt(false);
                if (!user) {
                  onRequireSignIn('tip');
                  return;
                }
                setTipError(null);
                setShowTip(true);
              }}
              className="text-xs uppercase tracking-[0.2em] font-bold text-[#d4af37] hover:text-white transition-colors"
            >
              Tip the Author
            </button>
            <button
              onClick={() => setShowTipPrompt(false)}
              className="text-xs uppercase tracking-[0.2em] text-gray-400 hover:text-gray-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Tip Modal */}
      {showTip && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setShowTip(false)}>
          <div
            className="bg-[#161616] text-white p-6 sm:p-8 md:p-10 rounded-sm shadow-2xl w-full max-w-sm border border-[#d4af37]/20"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl sm:text-2xl font-['Playfair_Display'] mb-2 text-[#d4af37] italic">Tip the Author</h3>
            <p className="text-sm text-gray-400 mb-6 sm:mb-8">
              Support {book.author} directly. Orastories keeps a 10% platform fee; the rest goes straight to them.
            </p>

            <div className="space-y-6 sm:space-y-8">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-4">Amount</label>
                <div className="flex gap-2">
                  {[300, 500, 1000, 2000].map((cents) => (
                    <button
                      key={cents}
                      onClick={() => {
                        setTipAmountCents(cents);
                        setTipCustom('');
                      }}
                      className={`flex-1 py-3 rounded-sm border text-sm transition-all ${
                        !tipCustom && tipAmountCents === cents
                          ? 'border-[#d4af37] text-[#d4af37]'
                          : 'border-white/15 text-gray-300 hover:border-white/30'
                      }`}
                    >
                      ${(cents / 100).toFixed(0)}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="0.50"
                  step="0.01"
                  value={tipCustom}
                  onChange={(e) => setTipCustom(e.target.value)}
                  placeholder="Custom amount"
                  className="mt-3 w-full px-4 py-3 rounded-sm border border-white/15 bg-[#0f0f0f] text-white text-sm focus:outline-none focus:border-[#d4af37]"
                />
              </div>

              {tipError && <p className="text-sm text-red-500">{tipError}</p>}

              <button
                onClick={handleSubmitTip}
                disabled={tipSubmitting}
                className="w-full py-4 border border-[#d4af37]/40 text-[#d4af37] text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-[#d4af37] hover:text-black transition-all disabled:opacity-40"
              >
                {tipSubmitting ? 'Redirecting...' : 'Continue to Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Continue Reading Gate */}
      {showContinueGate && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setShowContinueGate(false)}>
          <div
            className="bg-[#161616] text-white p-6 sm:p-8 md:p-10 rounded-sm shadow-2xl w-full max-w-sm border border-[#d4af37]/20"
            onClick={e => e.stopPropagation()}
          >
            {book.priceCents === 0 ? (
              <>
                <h3 className="text-xl sm:text-2xl font-['Playfair_Display'] mb-2 text-[#d4af37] italic">Continue Reading</h3>
                <p className="text-sm text-gray-400 mb-6 sm:mb-8">
                  You've reached the end of the free preview. Claim your free copy of this book to keep reading — $0.00, no payment required.
                </p>
                {continueError && <p className="text-sm text-red-500 mb-4">{continueError}</p>}
                <button
                  onClick={handleClaimFree}
                  disabled={continueSubmitting}
                  className="w-full py-4 border border-[#d4af37]/40 text-[#d4af37] text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-[#d4af37] hover:text-black transition-all disabled:opacity-40"
                >
                  {continueSubmitting ? 'Claiming...' : 'Claim Free Copy — $0.00'}
                </button>
              </>
            ) : book.priceCents && book.priceCents >= 50 ? (
              <>
                <h3 className="text-xl sm:text-2xl font-['Playfair_Display'] mb-2 text-[#d4af37] italic">Continue Reading</h3>
                <p className="text-sm text-gray-400 mb-6 sm:mb-8">
                  You've reached the end of the free preview. Buy the full PDF edition to keep reading.
                </p>
                {continueError && <p className="text-sm text-red-500 mb-4">{continueError}</p>}
                <button
                  onClick={handleBuyToContinue}
                  disabled={continueSubmitting}
                  className="w-full py-4 border border-[#d4af37]/40 text-[#d4af37] text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-[#d4af37] hover:text-black transition-all disabled:opacity-40"
                >
                  {continueSubmitting ? 'Redirecting...' : `Buy to Continue — $${(book.priceCents / 100).toFixed(2)}`}
                </button>
              </>
            ) : (
              <>
                <h3 className="text-xl sm:text-2xl font-['Playfair_Display'] mb-2 text-[#d4af37] italic">Continue Reading</h3>
                <p className="text-sm text-gray-400">More chapters coming soon.</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area - Styled like a professional Folio Page */}
      <main className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 pt-28 sm:pt-36 md:pt-44 lg:pt-48 protected-text">
        {!resumeReady ? (
          <div className="flex items-center justify-center py-32 text-sm uppercase tracking-[0.3em] opacity-50">
            Opening book...
          </div>
        ) : (
        <div className={`relative p-6 sm:p-8 md:p-14 lg:p-24 rounded-sm border transition-colors duration-700 ${getPageClasses()}`}>
          <header className="mb-14 sm:mb-16 md:mb-24 text-center">
            <h1 className={`text-3xl sm:text-5xl md:text-7xl lg:text-8xl font-['Playfair_Display'] leading-tight mb-6 sm:mb-8 ${getTitleColor()}`}>
              {chapter.title}
            </h1>
            <div className="w-24 h-px bg-current mx-auto opacity-10"></div>
          </header>

          <article 
            className="font-['EB_Garamond'] text-left md:text-justify selection:bg-[#d4af37]/30 whitespace-pre-wrap"
            style={{ 
              fontSize: `${settings.fontSize}px`, 
              lineHeight: settings.lineHeight 
            }}
          >
            {chapter.content.split('\n\n').map((para, i) => {
              const paragraph = para.trim();
              const sectionHeading = isWhenLoveSectionHeading(paragraph);
              const sceneSubtitle = !sectionHeading && isSceneSubtitle(paragraph);

              return (
                <p
                  key={i}
                  className={
                    sectionHeading
                      ? "mb-5 md:mb-7 font-['Playfair_Display'] font-bold text-xl md:text-2xl leading-snug"
                      : sceneSubtitle
                        ? 'mb-6 md:mb-8 italic text-center font-semibold opacity-85 tracking-[0.02em]'
                        : 'mb-7 md:mb-10 indent-0 md:indent-12 animate-fadeIn opacity-0 [animation-fill-mode:forwards]'
                  }
                  style={sectionHeading || sceneSubtitle ? undefined : { animationDelay: `${i * 0.02}s` }}
                >
                  {paragraph}
                </p>
              );
            })}
          </article>

          {/* Footer Navigation within the Folio */}
          <div className="mt-20 md:mt-32 lg:mt-48 border-t border-current pt-10 md:pt-16 lg:pt-20 flex justify-between items-center gap-6">
            <button
              disabled={currentChapterIndex === 0}
              onClick={() => goToChapter(currentChapterIndex - 1)}
              className={`flex flex-col items-start gap-2 transition-all ${currentChapterIndex === 0 ? 'opacity-5 pointer-events-none' : 'hover:translate-x-[-8px]'}`}
            >
              <span className="text-[10px] uppercase tracking-[0.4em] opacity-40">Previous</span>
              <span className="text-lg sm:text-xl md:text-2xl font-['Playfair_Display'] italic">Turn Back</span>
            </button>

            <button
              disabled={atLoadedEdge && !moreExists}
              onClick={handleNext}
              className={`flex flex-col items-end gap-2 text-right transition-all ${atLoadedEdge && !moreExists ? 'opacity-5 pointer-events-none' : 'hover:translate-x-[8px]'}`}
            >
              <span className="text-[10px] uppercase tracking-[0.4em] opacity-40">Next</span>
              <span className="text-lg sm:text-xl md:text-2xl font-['Playfair_Display'] italic">Turn Page</span>
            </button>
          </div>

          <CommentSection contentType="book" contentId={book.id} theme={settings.theme} onRequireSignIn={onRequireSignIn} />
        </div>
        )}
      </main>

    </div>
  );
};

const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60 hover:opacity-100 transition-opacity">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const StarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60 hover:opacity-100 transition-opacity">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const TipIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60 hover:opacity-100 transition-opacity">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 7v10M9.5 9.5c0-1.4 1.1-2.5 2.5-2.5s2.5.9 2.5 2.1c0 2.9-5 1.4-5 4.3 0 1.2 1.1 2.1 2.5 2.1s2.5-1.1 2.5-2.5"/>
  </svg>
);

export default Reader;
