import React, { useState, useEffect, useRef, Suspense } from 'react';
import Library from './components/Library';
import NavAccountControl from './components/NavAccountControl';
import Footer from './components/Footer';
import { Book, ThemeMode } from './types';
import { BookCatalogItem, loadBookById } from './constants';

// A first-time visitor lands on Library and needs none of these until they
// actually click something - eagerly bundling all four into the main chunk
// meant everyone downloaded Reader/Portal/payment code before ever using it.
const Reader = React.lazy(() => import('./components/Reader'));
const Portal = React.lazy(() => import('./components/Portal'));
const CreatorProfile = React.lazy(() => import('./components/CreatorProfile'));
const ArticleReader = React.lazy(() => import('./components/ArticleReader'));

const RouteLoadingFallback: React.FC<{ theme: ThemeMode }> = ({ theme }) => (
  <div className={`min-h-screen flex items-center justify-center ${theme === 'light' ? 'bg-[#fcfaf7]' : 'bg-[#0f0f0f]'}`}>
    <div
      className={`rounded border px-5 py-3 text-sm font-semibold ${
        theme === 'light' ? 'border-black/10 bg-white/95 text-[#1a1a1a]' : 'border-white/10 bg-[#161616]/95 text-[#e0e0e0]'
      }`}
    >
      Loading...
    </div>
  </div>
);

const App: React.FC = () => {
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isLoadingBook, setIsLoadingBook] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPortal, setShowPortal] = useState(false);
  const [signInReason, setSignInReason] = useState<string | null>(null);
  const [selectedCreatorUsername, setSelectedCreatorUsername] = useState<string | null>(null);
  const [selectedArticleSlug, setSelectedArticleSlug] = useState<string | null>(null);
  const [tipNotice, setTipNotice] = useState<string | null>(null);
  const loadRequestId = useRef(0);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light';
    return localStorage.getItem('darkMode') === 'true' ? 'dark' : 'light';
  });

  // Smooth scroll behavior
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
  }, []);

  // Stripe Connect onboarding also redirects back here as a full page
  // navigation (see the tip-notice effect below for why). The sync check
  // that reads the actual verification status lives inside Creator Studio,
  // so returning here has to reopen Portal on the right tab, not just land
  // back on the library with the query param sitting unused in the URL.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('stripe_return') === '1') {
      setShowPortal(true);
    }
  }, []);

  // The static marketing pages (about.html, books.html, etc.) have no
  // sign-in form of their own - their nav's "Sign In" / "My Account" links
  // send readers here with this param so they land directly in Portal
  // instead of just the plain library view.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('openPortal') !== '1') return;
    setShowPortal(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('openPortal');
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Static pages (reviews.html) can only link into the React app via a full
  // URL, same reasoning as openPortal above - a creator's username in the
  // query string opens their public profile directly. Once opened, the URL
  // is replaced with the clean /{username} path (rather than stripped back
  // to bare "/") so it stays meaningful and shareable from here on.
  useEffect(() => {
    const username = new URLSearchParams(window.location.search).get('creator');
    if (!username) return;
    setSelectedCreatorUsername(username);
    window.history.replaceState({ view: 'creator', username }, '', `/${username}`);
  }, []);

  // blog.html can only link into the React app via a full URL, same
  // reasoning as openPortal/creator above.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('article');
    if (!slug) return;
    setSelectedArticleSlug(slug);
    window.history.replaceState({ view: 'article', slug }, '', `/${slug}`);
  }, []);

  // The static per-book SEO pages (book-<id>.html) link back here with the
  // book id so "Continue Reading" opens the real interactive Reader, same
  // reasoning as openPortal/creator/article above.
  useEffect(() => {
    const bookId = new URLSearchParams(window.location.search).get('book');
    if (!bookId) return;
    handleSelectBook(
      {
        id: bookId,
        title: '',
        author: '',
        cover: '',
        genre: '',
        synopsis: '',
        publishedDate: '',
        creatorUsername: null,
        loadBook: () => loadBookById(bookId)
      },
      false
    );
    window.history.replaceState({ view: 'book', bookId }, '', `/${bookId}`);
  }, []);

  // Browser Back/Forward after in-app navigation (see handleSelectBook/
  // handleSelectCreator/handleSelectArticle below, which each push a state
  // object tagging the view alongside the URL change) - restores the right
  // view without re-pushing a new history entry.
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as { view?: string; bookId?: string; username?: string; slug?: string } | null;
      if (!state || state.view === 'library') {
        setSelectedBook(null);
        setSelectedCreatorUsername(null);
        setSelectedArticleSlug(null);
        return;
      }
      if (state.view === 'book' && state.bookId) {
        const bookId = state.bookId;
        handleSelectBook(
          {
            id: bookId,
            title: '',
            author: '',
            cover: '',
            genre: '',
            synopsis: '',
            publishedDate: '',
            creatorUsername: null,
            loadBook: () => loadBookById(bookId)
          },
          false
        );
      } else if (state.view === 'creator' && state.username) {
        handleSelectCreator(state.username, false);
      } else if (state.view === 'article' && state.slug) {
        handleSelectArticle(state.slug, false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Stripe Checkout redirects back here as a full page navigation (React
  // state doesn't survive the trip to checkout.stripe.com and back), so this
  // is just a one-time acknowledgment on the library view, not a return to
  // the specific book the reader was tipping from.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tip = params.get('tip');
    if (tip === 'success') {
      setTipNotice('Thank you for your tip!');
    } else if (tip === 'cancelled') {
      setTipNotice('Tip cancelled.');
    } else {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('tip');
    window.history.replaceState({}, '', url.toString());
    const timeout = setTimeout(() => setTipNotice(null), 5000);
    return () => clearTimeout(timeout);
  }, []);

  // create-coin-checkout redirects back here the same way Stripe Checkout
  // does for tips/purchases above - same one-time-acknowledgment reasoning.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const coins = params.get('coins');
    if (coins === 'success') {
      setTipNotice('OraCoins added to your wallet!');
    } else if (coins === 'cancelled') {
      setTipNotice('Coin purchase cancelled.');
    } else {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('coins');
    window.history.replaceState({}, '', url.toString());
    const timeout = setTimeout(() => setTipNotice(null), 5000);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    localStorage.setItem('darkMode', theme === 'dark' ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('orastories-theme-change', { detail: { theme } }));
  }, [theme]);

  useEffect(() => {
    const handleExternalThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: ThemeMode }>;
      const nextTheme = customEvent.detail?.theme;
      if (!nextTheme) return;
      if (nextTheme !== 'light' && nextTheme !== 'dark') return;
      setTheme(prev => (prev === nextTheme ? prev : nextTheme));
    };

    window.addEventListener('orastories-theme-change', handleExternalThemeChange as EventListener);
    return () => window.removeEventListener('orastories-theme-change', handleExternalThemeChange as EventListener);
  }, []);

  // index.html disables gtag's automatic pageview (send_page_view: false)
  // specifically because this app never does a full reload between views -
  // this effect fires the real pageview instead, every time, from whatever
  // path is actually settled after the various pushState/replaceState calls
  // above have already run.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof (window as any).gtag !== 'function') return;
    (window as any).gtag('event', 'page_view', {
      page_path: window.location.pathname,
      page_title: document.title,
      page_location: window.location.href
    });
  }, [selectedBook, showPortal, selectedCreatorUsername, selectedArticleSlug]);

  useEffect(() => {
    const siteNav = document.getElementById('siteNavBar') || document.querySelector('body > nav');
    const contentWrapper = document.getElementById('contentWrapper');
    const navElement = siteNav instanceof HTMLElement ? siteNav : null;
    const wrapperElement = contentWrapper instanceof HTMLElement ? contentWrapper : null;

    if (!navElement) return;

    if (selectedBook || showPortal) {
      navElement.style.display = 'none';
      navElement.setAttribute('aria-hidden', 'true');
      if (wrapperElement) wrapperElement.style.paddingTop = '0px';
      return;
    }

    navElement.style.display = '';
    navElement.removeAttribute('aria-hidden');
    if (wrapperElement) wrapperElement.style.paddingTop = '';
    window.dispatchEvent(new Event('resize'));
  }, [selectedBook, showPortal]);

  const handleSelectBook = async (book: BookCatalogItem, pushUrl: boolean = true) => {
    const requestId = ++loadRequestId.current;
    setLoadError(null);
    setIsLoadingBook(true);
    setShowPortal(false);
    if (pushUrl) window.history.pushState({ view: 'book', bookId: book.id }, '', `/${book.id}`);

    try {
      const loadedBook = await book.loadBook();
      if (loadRequestId.current !== requestId) return;
      setSelectedBook(loadedBook);
    } catch (error) {
      if (loadRequestId.current !== requestId) return;
      setLoadError('Unable to open this book right now. Please try again.');
      console.error('Book load failed:', error);
    } finally {
      if (loadRequestId.current === requestId) {
        setIsLoadingBook(false);
      }
    }
  };

  const handleOpenPortal = (reason?: string) => {
    setSelectedBook(null);
    setShowPortal(true);
    setSignInReason(reason ?? null);
  };

  const handleSelectCreator = (username: string, pushUrl: boolean = true) => {
    setSelectedBook(null);
    setShowPortal(false);
    setSelectedArticleSlug(null);
    setSelectedCreatorUsername(username);
    if (pushUrl) window.history.pushState({ view: 'creator', username }, '', `/${username}`);
  };

  const handleSelectArticle = (slug: string, pushUrl: boolean = true) => {
    setSelectedBook(null);
    setShowPortal(false);
    setSelectedCreatorUsername(null);
    setSelectedArticleSlug(slug);
    if (pushUrl) window.history.pushState({ view: 'article', slug }, '', `/${slug}`);
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 ${theme === 'light' ? 'bg-[#fcfaf7] text-[#1a1a1a]' : 'bg-[#0f0f0f] text-[#e0e0e0]'}`}>
      <NavAccountControl theme={theme} onOpenPortal={handleOpenPortal} />

      {tipNotice && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[96] rounded border border-amber-700/30 bg-amber-50/95 text-amber-900 px-4 py-2 text-sm shadow-sm">
          {tipNotice}
        </div>
      )}

      <main>
        {selectedBook ? (
          <div className="animate-readerFadeIn">
            <Suspense fallback={<RouteLoadingFallback theme={theme} />}>
              <Reader
                book={selectedBook}
                onClose={() => {
                  setSelectedBook(null);
                  window.history.pushState({ view: 'library' }, '', '/');
                }}
                externalTheme={theme}
                onThemeChange={setTheme}
                onRequireSignIn={handleOpenPortal}
                onBookUpdate={setSelectedBook}
                onOpenWallet={() => handleOpenPortal()}
              />
            </Suspense>
          </div>
        ) : showPortal ? (
          <Suspense fallback={<RouteLoadingFallback theme={theme} />}>
            <Portal
              theme={theme}
              reason={signInReason}
              onSelectBook={handleSelectBook}
              onSelectCreator={handleSelectCreator}
              onSelectArticle={handleSelectArticle}
              onClose={() => setShowPortal(false)}
            />
          </Suspense>
        ) : selectedCreatorUsername ? (
          <Suspense fallback={<RouteLoadingFallback theme={theme} />}>
            <CreatorProfile
              username={selectedCreatorUsername}
              theme={theme}
              onSelectBook={handleSelectBook}
              onBack={() => {
                setSelectedCreatorUsername(null);
                window.history.pushState({ view: 'library' }, '', '/');
              }}
            />
          </Suspense>
        ) : selectedArticleSlug ? (
          <Suspense fallback={<RouteLoadingFallback theme={theme} />}>
            <ArticleReader
              slug={selectedArticleSlug}
              theme={theme}
              onBack={() => {
                setSelectedArticleSlug(null);
                window.history.pushState({ view: 'library' }, '', '/');
              }}
              onRequireSignIn={handleOpenPortal}
              onSelectCreator={handleSelectCreator}
            />
          </Suspense>
        ) : (
          <>
            {loadError && (
              <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[96] rounded border border-red-500/30 bg-red-100/90 text-red-900 px-4 py-2 text-sm">
                {loadError}
              </div>
            )}
            {isLoadingBook && (
              <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
                <div className="rounded border border-black/10 bg-white/95 px-5 py-3 text-sm font-semibold text-[#1a1a1a]">
                  Opening book...
                </div>
              </div>
            )}
            <Library onSelectBook={handleSelectBook} onSelectCreator={handleSelectCreator} theme={theme} />
          </>
        )}
      </main>

      {/* Reader.tsx runs its own independent theme system (dark/light/sepia)
          and full-bleed layout - an app-level footer directly beneath it
          would visually clash, so it's the one view that skips this. */}
      {!selectedBook && <Footer theme={theme} />}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.8s ease-out forwards;
        }
        .animate-slideUp {
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes readerFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-readerFadeIn {
          animation: readerFadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default App;
