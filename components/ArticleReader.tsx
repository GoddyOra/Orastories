import React, { useEffect, useState } from 'react';
import { ThemeMode } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  Article,
  getArticleBySlug,
  getAnonViewerId,
  recordArticleView,
  getMyArticleRating,
  rateArticle,
  flagArticle
} from '../lib/articles';
import ArticleContent from './ArticleContent';
import CommentSection from './CommentSection';

interface ArticleReaderProps {
  slug: string;
  theme: ThemeMode;
  onBack: () => void;
  onRequireSignIn: () => void;
  onSelectCreator: (username: string) => void;
}

const ArticleReader: React.FC<ArticleReaderProps> = ({ slug, theme, onBack, onRequireSignIn, onSelectCreator }) => {
  const isLight = theme !== 'dark';
  const { user } = useAuth();

  const [article, setArticle] = useState<Article | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [myRating, setMyRating] = useState<number | null>(null);
  const [ratingSaving, setRatingSaving] = useState(false);

  const [flagged, setFlagged] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [showFlagConfirm, setShowFlagConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setNotFound(false);

    getArticleBySlug(slug)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setNotFound(true);
          return;
        }
        setArticle(result);
        const viewerKey = user ? user.id : getAnonViewerId();
        recordArticleView(result.id, viewerKey).catch((error) => console.error('Failed to record view:', error));
        if (user) {
          getMyArticleRating(result.id, user.id)
            .then((rating) => {
              if (!cancelled) setMyRating(rating);
            })
            .catch((error) => console.error('Failed to load your rating:', error));
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load article:', error);
        setNotFound(true);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const handleRate = async (rating: number) => {
    if (!user || !article) {
      onRequireSignIn();
      return;
    }
    setRatingSaving(true);
    try {
      await rateArticle(article.id, user.id, rating);
      setMyRating(rating);
    } catch (error) {
      console.error('Failed to save rating:', error);
    } finally {
      setRatingSaving(false);
    }
  };

  const handleFlag = async () => {
    if (!user || !article) {
      onRequireSignIn();
      return;
    }
    setFlagSubmitting(true);
    setFlagError(null);
    try {
      await flagArticle(article.id, user.id);
      setFlagged(true);
      setShowFlagConfirm(false);
    } catch (error) {
      setFlagError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setFlagSubmitting(false);
    }
  };

  const textMuted = isLight ? 'text-gray-500' : 'text-gray-400';

  return (
    <div className={`min-h-screen transition-colors duration-500 py-16 sm:py-20 md:py-24 px-4 sm:px-6 md:px-12 ${isLight ? 'bg-[#fcfaf7]' : 'bg-[#0f0f0f]'}`}>
      <div className="max-w-3xl mx-auto mb-10">
        <button
          onClick={onBack}
          className={`inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] font-semibold transition-colors ${
            isLight ? 'text-gray-500 hover:text-amber-700' : 'text-gray-400 hover:text-amber-400'
          }`}
        >
          <span className="text-base leading-none">←</span> Back to Blog
        </button>
      </div>

      {isLoading ? (
        <p className={`text-center text-sm uppercase tracking-[0.3em] ${textMuted}`}>Loading...</p>
      ) : notFound || !article ? (
        <div className="max-w-2xl mx-auto text-center">
          <h1 className={`text-3xl font-['Playfair_Display'] mb-4 ${isLight ? 'text-gray-900' : 'text-white'}`}>Article not found</h1>
          <p className={textMuted}>This article doesn't exist or is no longer available.</p>
        </div>
      ) : (
        <article className="max-w-3xl mx-auto">
          <header className="mb-8 text-center">
            <h1 className={`text-3xl sm:text-4xl md:text-5xl font-['Playfair_Display'] font-bold leading-tight mb-4 ${isLight ? 'text-gray-900' : 'text-white'}`}>
              {article.title}
            </h1>
            <p className={`text-sm ${textMuted}`}>
              By{' '}
              {article.author.isCreator ? (
                <button onClick={() => onSelectCreator(article.author.username)} className={isLight ? 'hover:text-amber-700' : 'hover:text-amber-400'}>
                  {article.author.displayName || article.author.username}
                </button>
              ) : (
                article.author.displayName || article.author.username
              )}
              {' — '}
              {new Date(article.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            {article.keywords.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {article.keywords.map((kw) => (
                  <span
                    key={kw}
                    className={`text-[10px] uppercase tracking-[0.15em] px-3 py-1 rounded-full border ${
                      isLight ? 'border-black/15 text-gray-600' : 'border-white/15 text-gray-400'
                    }`}
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </header>

          {article.coverImageUrl && (
            <img
              src={article.coverImageUrl}
              alt={article.coverImageAlt || article.title}
              className="w-full rounded-xl border border-black/10 dark:border-white/10 mb-10"
              loading="eager"
            />
          )}

          <ArticleContent body={article.body} theme={theme} />

          <div className={`mt-14 pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-6 ${isLight ? 'border-black/10' : 'border-white/10'}`}>
            <div>
              <p className={`text-xs uppercase tracking-[0.2em] mb-2 ${textMuted}`}>
                {article.averageRating ? `${article.averageRating.toFixed(1)} average (${article.ratingCount} rating${article.ratingCount === 1 ? '' : 's'})` : 'Rate this article'}
              </p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    disabled={ratingSaving}
                    onClick={() => handleRate(star)}
                    className={`text-2xl leading-none transition-colors ${
                      myRating && star <= myRating ? 'text-amber-600' : isLight ? 'text-gray-300 hover:text-amber-400' : 'text-gray-700 hover:text-amber-400'
                    }`}
                    aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="text-center sm:text-right">
              {flagged ? (
                <p className={`text-xs ${textMuted}`}>Thanks — this article has been flagged for review.</p>
              ) : showFlagConfirm ? (
                <div className="space-y-2">
                  <p className={`text-xs ${textMuted}`}>Flag this article for negative content?</p>
                  {flagError && <p className="text-xs text-red-500">{flagError}</p>}
                  <div className="flex gap-3 justify-center sm:justify-end">
                    <button
                      onClick={handleFlag}
                      disabled={flagSubmitting}
                      className="text-xs uppercase tracking-[0.15em] font-semibold text-red-500 hover:text-red-600 disabled:opacity-50"
                    >
                      {flagSubmitting ? 'Submitting...' : 'Confirm Flag'}
                    </button>
                    <button onClick={() => setShowFlagConfirm(false)} className={`text-xs uppercase tracking-[0.15em] ${textMuted}`}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => (user ? setShowFlagConfirm(true) : onRequireSignIn())}
                  className={`text-xs uppercase tracking-[0.15em] font-semibold transition-colors ${textMuted} hover:text-red-500`}
                >
                  Flag this article
                </button>
              )}
            </div>
          </div>

          <CommentSection contentType="article" contentId={article.id} theme={theme} onRequireSignIn={onRequireSignIn} />
        </article>
      )}
    </div>
  );
};

export default ArticleReader;
