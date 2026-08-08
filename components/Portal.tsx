import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BookCatalogItem, loadBookById } from '../constants';
import { BookmarkedBook, listBookmarksWithBooks } from '../lib/bookmarks';
import { listMyReviews, MyReviewWithBook } from '../lib/reviews';
import { isUsernameAvailable, claimUsername, USERNAME_PATTERN } from '../lib/username';
import { getMyApplication, submitCreatorApplication } from '../lib/creatorApplications';
import { CreatorApplication, ThemeMode } from '../types';

// Lazy-loaded: pulls in mammoth (DOCX parsing) which meaningfully bloats
// the bundle. Code-split so only creators who open "My Books" download it.
const CreatorStudio = React.lazy(() => import('./CreatorStudio'));

interface PortalProps {
  theme: ThemeMode;
  onSelectBook: (book: BookCatalogItem) => void;
  onClose: () => void;
}

const Portal: React.FC<PortalProps> = ({ theme, onSelectBook, onClose }) => {
  const isLight = theme !== 'dark';
  const { user, profile, loading, signIn, signUp, signOut, refreshProfile } = useAuth();

  const [activeTab, setActiveTab] = useState<'reading' | 'studio'>('reading');

  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const [gateUsername, setGateUsername] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateLoading, setGateLoading] = useState(false);

  const [bookmarks, setBookmarks] = useState<BookmarkedBook[]>([]);
  const [reviews, setReviews] = useState<MyReviewWithBook[]>([]);
  const [application, setApplication] = useState<CreatorApplication | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [applyMessage, setApplyMessage] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setDashboardLoading(true);

    Promise.all([listBookmarksWithBooks(user.id), listMyReviews(user.id), getMyApplication(user.id)])
      .then(([bookmarkRows, reviewRows, applicationRow]) => {
        if (cancelled) return;
        setBookmarks(bookmarkRows);
        setReviews(reviewRows);
        setApplication(applicationRow);
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
        if (!USERNAME_PATTERN.test(signupUsername)) {
          setFormError('Username must be 3-20 characters: lowercase letters, numbers, and underscores only.');
          return;
        }
        if (!(await isUsernameAvailable(signupUsername))) {
          setFormError('That username is already taken.');
          return;
        }
        const { data, error } = await signUp(email, password, signupUsername);
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

  const handleClaimUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateError(null);

    const candidate = gateUsername.toLowerCase();
    if (!USERNAME_PATTERN.test(candidate)) {
      setGateError('Username must be 3-20 characters: lowercase letters, numbers, and underscores only.');
      return;
    }

    setGateLoading(true);
    try {
      if (!(await isUsernameAvailable(candidate))) {
        setGateError('That username is already taken.');
        return;
      }
      await claimUsername(user!.id, candidate);
      await refreshProfile();
    } catch (error) {
      setGateError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      setGateLoading(false);
    }
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setApplyError(null);
    setApplyLoading(true);
    try {
      await submitCreatorApplication(user!.id, applyMessage);
      setApplication(await getMyApplication(user!.id));
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      setApplyLoading(false);
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
                {mode === 'signUp' && (
                  <div>
                    <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Username</label>
                    <input
                      type="text"
                      required
                      value={signupUsername}
                      onChange={(e) => setSignupUsername(e.target.value.toLowerCase())}
                      placeholder="lowercase letters, numbers, underscores"
                      className={`w-full px-4 py-3 rounded-sm border text-sm focus:outline-none focus:border-amber-700 ${
                        isLight ? 'bg-white border-black/15 text-gray-900' : 'bg-[#0f0f0f] border-white/15 text-white'
                      }`}
                    />
                  </div>
                )}
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
        ) : profile && !profile.username ? (
          <div className={`max-w-md mx-auto rounded-sm border p-8 sm:p-10 ${cardBg}`}>
            <h1 className={`text-3xl sm:text-4xl font-['Playfair_Display'] mb-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>
              Choose a Username
            </h1>
            <p className={`text-sm mb-8 ${textMuted}`}>
              This is how other readers will see you instead of your email.
            </p>
            <form onSubmit={handleClaimUsername} className="space-y-4">
              <input
                type="text"
                required
                value={gateUsername}
                onChange={(e) => setGateUsername(e.target.value.toLowerCase())}
                placeholder="lowercase letters, numbers, underscores"
                className={`w-full px-4 py-3 rounded-sm border text-sm focus:outline-none focus:border-amber-700 ${
                  isLight ? 'bg-white border-black/15 text-gray-900' : 'bg-[#0f0f0f] border-white/15 text-white'
                }`}
              />
              {gateError && <p className="text-sm text-red-500">{gateError}</p>}
              <button
                type="submit"
                disabled={gateLoading}
                className="w-full py-3.5 border border-amber-700 text-amber-700 text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-amber-700 hover:text-white transition-all disabled:opacity-50"
              >
                {gateLoading ? 'Please wait...' : 'Save Username'}
              </button>
            </form>
          </div>
        ) : (
          <div>
            <h1 className={`text-3xl sm:text-4xl font-['Playfair_Display'] mb-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>
              {profile?.username || user.email}
            </h1>
            <button
              onClick={() => signOut().catch((error) => console.error('Sign out failed:', error))}
              className={`text-xs uppercase tracking-[0.2em] ${textMuted} hover:text-amber-700 mb-8`}
            >
              Sign Out
            </button>

            {profile?.role === 'creator' && (
              <div className="flex gap-6 mb-10 border-b border-current/10">
                <button
                  onClick={() => setActiveTab('reading')}
                  className={`pb-3 text-xs uppercase tracking-[0.2em] font-semibold border-b-2 transition-colors ${
                    activeTab === 'reading' ? 'border-amber-700 text-amber-700' : `border-transparent ${textMuted} hover:text-amber-700`
                  }`}
                >
                  My Reading
                </button>
                <button
                  onClick={() => setActiveTab('studio')}
                  className={`pb-3 text-xs uppercase tracking-[0.2em] font-semibold border-b-2 transition-colors ${
                    activeTab === 'studio' ? 'border-amber-700 text-amber-700' : `border-transparent ${textMuted} hover:text-amber-700`
                  }`}
                >
                  My Books
                </button>
              </div>
            )}

            {activeTab === 'studio' && profile?.role === 'creator' ? (
              <React.Suspense fallback={<p className={`text-sm ${textMuted}`}>Loading Creator Studio...</p>}>
                <CreatorStudio theme={theme} creatorId={user.id} />
              </React.Suspense>
            ) : dashboardLoading ? (
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

                {profile?.role !== 'creator' && (
                  <section className="mt-14">
                    <h2 className={`text-xs uppercase tracking-[0.3em] mb-5 ${textMuted}`}>Become a Creator</h2>
                    {application?.status === 'pending' ? (
                      <p className={`text-sm ${textMuted}`}>Your application is under review.</p>
                    ) : application?.status === 'rejected' ? (
                      <p className={`text-sm ${textMuted}`}>Your application was not approved.</p>
                    ) : (
                      <form onSubmit={handleSubmitApplication} className="space-y-4">
                        <p className={`text-sm ${textMuted}`}>
                          Interested in publishing your own stories on Orastories? Tell us a bit about what you'd like to write.
                        </p>
                        <textarea
                          rows={4}
                          value={applyMessage}
                          onChange={(e) => setApplyMessage(e.target.value)}
                          placeholder="A short pitch or a bit about yourself"
                          className={`w-full px-4 py-3 rounded-sm border text-sm focus:outline-none focus:border-amber-700 ${
                            isLight ? 'bg-white border-black/15 text-gray-900' : 'bg-[#0f0f0f] border-white/15 text-white'
                          }`}
                        />
                        {applyError && <p className="text-sm text-red-500">{applyError}</p>}
                        <button
                          type="submit"
                          disabled={applyLoading}
                          className="px-6 py-3 border border-amber-700 text-amber-700 text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-amber-700 hover:text-white transition-all disabled:opacity-50"
                        >
                          {applyLoading ? 'Submitting...' : 'Apply to Become a Creator'}
                        </button>
                      </form>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Portal;
