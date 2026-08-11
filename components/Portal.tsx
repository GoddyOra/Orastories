import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BookCatalogItem, loadBookById } from '../constants';
import { BookmarkedBook, listBookmarksWithBooks } from '../lib/bookmarks';
import { listMyReviews, MyReviewWithBook } from '../lib/reviews';
import { PurchasedBook, listMyPurchasesWithBooks } from '../lib/purchases';
import { isUsernameAvailable, claimUsername, USERNAME_PATTERN } from '../lib/username';
import { updateBio } from '../lib/auth';
import { getMyApplication, submitCreatorApplication } from '../lib/creatorApplications';
import { CreatorApplication, ThemeMode } from '../types';

// Lazy-loaded: pulls in mammoth (DOCX parsing) which meaningfully bloats
// the bundle. Code-split so only creators who open "My Books" download it.
const CreatorStudio = React.lazy(() => import('./CreatorStudio'));
// Same reasoning - only loaded when a reader actually opens "My Articles".
const ArticleStudio = React.lazy(() => import('./ArticleStudio'));

interface PortalProps {
  theme: ThemeMode;
  reason?: string | null;
  onSelectBook: (book: BookCatalogItem) => void;
  onSelectCreator: (username: string) => void;
  onSelectArticle: (slug: string) => void;
  onClose: () => void;
}

// Context-specific copy for why sign-in is being requested - falls back to
// the generic message when no reason is given (e.g. the plain nav "Sign In"
// link).
const SIGN_IN_REASONS: Record<string, { signIn: string; signUp: string }> = {
  tip: {
    signIn: 'Sign in to tip the author and support their work directly.',
    signUp: 'Create a free account to tip the author and support their work directly.'
  }
};

const Portal: React.FC<PortalProps> = ({ theme, reason, onSelectBook, onSelectCreator, onSelectArticle, onClose }) => {
  const isLight = theme !== 'dark';
  const { user, profile, loading, signIn, signUp, signOut, refreshProfile } = useAuth();

  const [activeTab, setActiveTab] = useState<'reading' | 'articles' | 'studio'>(() =>
    new URLSearchParams(window.location.search).get('stripe_return') === '1' ? 'studio' : 'reading'
  );

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

  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const BIO_MAX = 1000;

  const [bookmarks, setBookmarks] = useState<BookmarkedBook[]>([]);
  const [reviews, setReviews] = useState<MyReviewWithBook[]>([]);
  const [purchases, setPurchases] = useState<PurchasedBook[]>([]);
  const [application, setApplication] = useState<CreatorApplication | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [applyMessage, setApplyMessage] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setDashboardLoading(true);

    Promise.all([
      listBookmarksWithBooks(user.id),
      listMyReviews(user.id),
      listMyPurchasesWithBooks(user.id),
      getMyApplication(user.id)
    ])
      .then(([bookmarkRows, reviewRows, purchaseRows, applicationRow]) => {
        if (cancelled) return;
        setBookmarks(bookmarkRows);
        setReviews(reviewRows);
        setPurchases(purchaseRows);
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

  const handleSaveBio = async () => {
    setSavingBio(true);
    try {
      await updateBio(user!.id, bioDraft);
      await refreshProfile();
      setEditingBio(false);
    } catch (error) {
      console.error('Bio save failed:', error);
    } finally {
      setSavingBio(false);
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
              {reason && SIGN_IN_REASONS[reason]
                ? mode === 'signIn'
                  ? SIGN_IN_REASONS[reason].signIn
                  : SIGN_IN_REASONS[reason].signUp
                : mode === 'signIn'
                  ? 'Sign in to bookmark books and leave reviews.'
                  : 'Create an account to save your place and rate what you read.'}
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
              className={`text-xs uppercase tracking-[0.2em] ${textMuted} hover:text-amber-700 mb-4`}
            >
              Sign Out
            </button>

            <div className="mb-8">
              {editingBio ? (
                <div className="space-y-2">
                  <textarea
                    value={bioDraft}
                    onChange={(e) => setBioDraft(e.target.value.slice(0, BIO_MAX))}
                    maxLength={BIO_MAX}
                    rows={3}
                    placeholder="A short bio other readers will see on your profile..."
                    className={`w-full px-4 py-3 rounded-sm border text-sm focus:outline-none focus:border-amber-700 ${
                      isLight ? 'bg-white border-black/15 text-gray-900' : 'bg-[#0f0f0f] border-white/15 text-white'
                    }`}
                  />
                  <div className="flex items-center justify-between gap-4">
                    <span className={`text-xs ${textMuted}`}>{bioDraft.length}/{BIO_MAX}</span>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setEditingBio(false)}
                        className={`text-xs uppercase tracking-[0.2em] ${textMuted} hover:text-amber-700`}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveBio}
                        disabled={savingBio}
                        className="text-xs uppercase tracking-[0.2em] font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-50"
                      >
                        {savingBio ? 'Saving...' : 'Save Bio'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <p className={`text-sm ${textMuted} max-w-xl`}>
                    {profile?.bio || 'No bio yet.'}
                  </p>
                  <button
                    onClick={() => {
                      setBioDraft(profile?.bio || '');
                      setEditingBio(true);
                    }}
                    className="flex-shrink-0 text-xs uppercase tracking-[0.2em] font-semibold text-amber-700 hover:text-amber-800"
                  >
                    {profile?.bio ? 'Edit Bio' : 'Add Bio'}
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-6 mb-10 border-b border-current overflow-x-auto">
              <button
                onClick={() => setActiveTab('reading')}
                className={`pb-3 text-xs uppercase tracking-[0.2em] font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'reading' ? 'border-amber-700 text-amber-700' : `border-transparent ${textMuted} hover:text-amber-700`
                }`}
              >
                My Reading
              </button>
              <button
                onClick={() => setActiveTab('articles')}
                className={`pb-3 text-xs uppercase tracking-[0.2em] font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'articles' ? 'border-amber-700 text-amber-700' : `border-transparent ${textMuted} hover:text-amber-700`
                }`}
              >
                My Articles
              </button>
              {profile?.role === 'creator' && (
                <button
                  onClick={() => setActiveTab('studio')}
                  className={`pb-3 text-xs uppercase tracking-[0.2em] font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'studio' ? 'border-amber-700 text-amber-700' : `border-transparent ${textMuted} hover:text-amber-700`
                  }`}
                >
                  My Books
                </button>
              )}
            </div>

            {activeTab === 'studio' && profile?.role === 'creator' ? (
              <React.Suspense fallback={<p className={`text-sm ${textMuted}`}>Loading Creator Studio...</p>}>
                <CreatorStudio theme={theme} creatorId={user.id} onSelectCreator={onSelectCreator} />
              </React.Suspense>
            ) : activeTab === 'articles' ? (
              <React.Suspense fallback={<p className={`text-sm ${textMuted}`}>Loading Article Studio...</p>}>
                <ArticleStudio theme={theme} authorId={user.id} onSelectArticle={onSelectArticle} />
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

                <section className="mb-14">
                  <h2 className={`text-xs uppercase tracking-[0.3em] mb-5 ${textMuted}`}>My Purchases</h2>
                  {purchases.length === 0 ? (
                    <p className={`text-sm ${textMuted}`}>No purchased books yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {purchases.map((p) => (
                        <div key={p.bookId} className={`flex items-center justify-between gap-4 rounded-sm border p-4 ${cardBg}`}>
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-10 h-14 flex-shrink-0 overflow-hidden rounded-sm">
                              <img src={p.cover} alt={p.title} className="w-full h-full object-cover" />
                            </div>
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold truncate ${isLight ? 'text-gray-900' : 'text-white'}`}>{p.title}</p>
                              <p className={`text-xs ${textMuted}`}>{p.author}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleResume(p.bookId)}
                            className="flex-shrink-0 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] border border-amber-700 text-amber-700 hover:bg-amber-700 hover:text-white transition-all"
                          >
                            Read Full Book
                          </button>
                        </div>
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
