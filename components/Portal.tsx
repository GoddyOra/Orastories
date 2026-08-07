import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BookCatalogItem, loadBookById } from '../constants';
import { BookmarkedBook, listBookmarksWithBooks } from '../lib/bookmarks';
import { listMyReviews, MyReviewWithBook } from '../lib/reviews';
import { ThemeMode } from '../types';

interface PortalProps {
  theme: ThemeMode;
  onSelectBook: (book: BookCatalogItem) => void;
  onClose: () => void;
}

const Portal: React.FC<PortalProps> = ({ theme, onSelectBook, onClose }) => {
  const isLight = theme !== 'dark';
  const { user, profile, loading, signIn, signUp, signOut } = useAuth();

  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const [bookmarks, setBookmarks] = useState<BookmarkedBook[]>([]);
  const [reviews, setReviews] = useState<MyReviewWithBook[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setDashboardLoading(true);

    Promise.all([listBookmarksWithBooks(user.id), listMyReviews(user.id)])
      .then(([bookmarkRows, reviewRows]) => {
        if (cancelled) return;
        setBookmarks(bookmarkRows);
        setReviews(reviewRows);
      })
      .catch((error) => console.error('Portal dashboard load failed:', error))
      .finally(() => {
        if (!cancelled) setDashboardLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    try {
      if (mode === 'signUp') {
        const { data, error } = await signUp(email, password);
        if (error) throw error;
        if (!data.session) {
          setCheckEmail(true);
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleResume = async (bookId: string) => {
    onSelectBook({
      id: bookId,
      title: '',
      author: '',
      cover: '',
      genre: '',
      synopsis: '',
      publishedDate: '',
      loadBook: () => loadBookById(bookId)
    });
  };

  const cardBg = isLight ? 'bg-white border-black/10' : 'bg-[#161616] border-white/10';
  const textMuted = isLight ? 'text-gray-500' : 'text-gray-400';

  return (
    <div className={`min-h-screen transition-colors duration-500 py-16 sm:py-20 md:py-24 px-4 sm:px-6 md:px-12 ${isLight ? 'bg-[#fcfaf7]' : 'bg-[#0f0f0f]'}`}>
      <div className="max-w-3xl mx-auto">
        <button
          onClick={onClose}
          className={`mb-10 inline-flex items-center gap-2 text-xs sm:text-sm font-semibold tracking-[0.12em] uppercase transition-colors ${
            isLight ? 'text-gray-600 hover:text-amber-700' : 'text-gray-400 hover:text-amber-400'
          }`}
        >
          <span className="text-base leading-none">←</span> Return
        </button>

        {loading ? (
          <p className={`text-center text-sm uppercase tracking-[0.3em] ${textMuted}`}>Loading...</p>
        ) : !user ? (
          <div className={`max-w-md mx-auto rounded-sm border p-8 sm:p-10 ${cardBg}`}>
            <h1 className={`text-3xl sm:text-4xl font-['Playfair_Display'] mb-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>
              {mode === 'signIn' ? 'Welcome Back' : 'Join Orastories'}
            </h1>
            <p className={`text-sm mb-8 ${textMuted}`}>
              {mode === 'signIn' ? 'Sign in to bookmark books and leave reviews.' : 'Create an account to save your place and rate what you read.'}
            </p>

            {checkEmail ? (
              <p className={`text-sm ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                Check <strong>{email}</strong> for a confirmation link, then come back and sign in.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full px-4 py-3 rounded-sm border text-sm focus:outline-none focus:border-amber-700 ${
                      isLight ? 'bg-white border-black/15 text-gray-900' : 'bg-[#0f0f0f] border-white/15 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full px-4 py-3 rounded-sm border text-sm focus:outline-none focus:border-amber-700 ${
                      isLight ? 'bg-white border-black/15 text-gray-900' : 'bg-[#0f0f0f] border-white/15 text-white'
                    }`}
                  />
                </div>

                {formError && <p className="text-sm text-red-500">{formError}</p>}

                <button
                  type="submit"
                  disabled={formLoading}
                  className="w-full py-3.5 border border-amber-700 text-amber-700 text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-amber-700 hover:text-white transition-all disabled:opacity-50"
                >
                  {formLoading ? 'Please wait...' : mode === 'signIn' ? 'Sign In' : 'Sign Up'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'signIn' ? 'signUp' : 'signIn');
                    setFormError(null);
                  }}
                  className={`w-full text-xs text-center ${textMuted} hover:text-amber-700`}
                >
                  {mode === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                </button>
              </form>
            )}
          </div>
        ) : (
          <div>
            <h1 className={`text-3xl sm:text-4xl font-['Playfair_Display'] mb-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>
              {profile?.displayName || user.email}
            </h1>
            <button
              onClick={() => signOut().catch((error) => console.error('Sign out failed:', error))}
              className={`text-xs uppercase tracking-[0.2em] ${textMuted} hover:text-amber-700 mb-12`}
            >
              Sign Out
            </button>

            {dashboardLoading ? (
              <p className={`text-sm ${textMuted}`}>Loading your library...</p>
            ) : (
              <>
                <section className="mb-14">
                  <h2 className={`text-xs uppercase tracking-[0.3em] mb-5 ${textMuted}`}>Continue Reading</h2>
                  {bookmarks.length === 0 ? (
                    <p className={`text-sm ${textMuted}`}>No books in progress yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                      {bookmarks.map((b) => (
                        <button
                          key={b.bookId}
                          onClick={() => handleResume(b.bookId)}
                          className="text-left group"
                        >
                          <div className="aspect-[2/3] overflow-hidden rounded-sm mb-2">
                            <img src={b.cover} alt={b.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          </div>
                          <p className={`text-sm font-medium ${isLight ? 'text-gray-900' : 'text-white'}`}>{b.title}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h2 className={`text-xs uppercase tracking-[0.3em] mb-5 ${textMuted}`}>My Reviews</h2>
                  {reviews.length === 0 ? (
                    <p className={`text-sm ${textMuted}`}>You haven't reviewed any books yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {reviews.map((r) => (
                        <div key={r.bookId} className={`rounded-sm border p-5 ${cardBg}`}>
                          <div className="flex items-center justify-between mb-2">
                            <p className={`text-sm font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>{r.title}</p>
                            <span className="text-amber-600">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                          </div>
                          {r.body && <p className={`text-sm ${textMuted}`}>{r.body}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Portal;
