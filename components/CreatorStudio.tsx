import React, { useEffect, useState } from 'react';
import { ThemeMode } from '../types';
import { CreatorBook, createBook, listMyBooks } from '../lib/creatorBooks';
import { startStripeOnboarding, syncStripeOnboardingStatus } from '../lib/creatorPayments';
import { useAuth } from '../contexts/AuthContext';
import BookEditor from './BookEditor';

interface CreatorStudioProps {
  theme: ThemeMode;
  creatorId: string;
}

const emptyFields = { title: '', author: '', genre: '', synopsis: '', cover: '', publishedDate: '' };

const CreatorStudio: React.FC<CreatorStudioProps> = ({ theme, creatorId }) => {
  const isLight = theme !== 'dark';
  const textMuted = isLight ? 'text-gray-500' : 'text-gray-400';
  const cardCls = isLight ? 'bg-white border-black/10' : 'bg-[#161616] border-white/10';
  const inputCls = `w-full px-4 py-3 rounded-sm border text-sm focus:outline-none focus:border-amber-700 ${
    isLight ? 'bg-white border-black/15 text-gray-900' : 'bg-[#0f0f0f] border-white/15 text-white'
  }`;

  const { profile, refreshProfile } = useAuth();

  const [books, setBooks] = useState<CreatorBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBookId, setSelectedBookId] = useState<string | 'new' | null>(null);
  const [newFields, setNewFields] = useState(emptyFields);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [syncingStripe, setSyncingStripe] = useState(false);

  const loadBooks = () => {
    setLoading(true);
    listMyBooks(creatorId)
      .then(setBooks)
      .catch((error) => console.error('Failed to load your books:', error))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBooks();
  }, [creatorId]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('stripe_return') !== '1') return;

    setSyncingStripe(true);
    syncStripeOnboardingStatus()
      .then(() => refreshProfile())
      .catch((error) => console.error('Stripe status sync failed:', error))
      .finally(() => setSyncingStripe(false));

    const url = new URL(window.location.href);
    url.searchParams.delete('stripe_return');
    window.history.replaceState({}, '', url.toString());
  }, []);

  const handleConnectStripe = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const url = await startStripeOnboarding();
      window.location.href = url;
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : 'Something went wrong.');
      setConnecting(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const { id } = await createBook(creatorId, newFields);
      setNewFields(emptyFields);
      loadBooks();
      setSelectedBookId(id);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  if (selectedBookId && selectedBookId !== 'new') {
    const book = books.find((b) => b.id === selectedBookId);
    if (book) {
      return (
        <BookEditor
          theme={theme}
          book={book}
          onBack={() => setSelectedBookId(null)}
          onChange={loadBooks}
        />
      );
    }
  }

  if (selectedBookId === 'new') {
    return (
      <div>
        <button
          onClick={() => setSelectedBookId(null)}
          className={`mb-8 inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] font-semibold ${textMuted} hover:text-amber-700`}
        >
          <span className="text-base leading-none">←</span> My Books
        </button>
        <h2 className={`text-2xl font-['Playfair_Display'] mb-8 ${isLight ? 'text-gray-900' : 'text-white'}`}>New Book</h2>
        <form onSubmit={handleCreate} className={`rounded-sm border p-6 sm:p-8 space-y-4 ${cardCls}`}>
          <div>
            <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Title</label>
            <input required className={inputCls} value={newFields.title} onChange={(e) => setNewFields({ ...newFields, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Author</label>
              <input required className={inputCls} value={newFields.author} onChange={(e) => setNewFields({ ...newFields, author: e.target.value })} />
            </div>
            <div>
              <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Genre</label>
              <input className={inputCls} value={newFields.genre} onChange={(e) => setNewFields({ ...newFields, genre: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Cover Image URL</label>
            <input className={inputCls} value={newFields.cover} onChange={(e) => setNewFields({ ...newFields, cover: e.target.value })} />
          </div>
          <div>
            <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Published Year</label>
            <input className={inputCls} value={newFields.publishedDate} onChange={(e) => setNewFields({ ...newFields, publishedDate: e.target.value })} />
          </div>
          <div>
            <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Synopsis</label>
            <textarea rows={3} className={inputCls} value={newFields.synopsis} onChange={(e) => setNewFields({ ...newFields, synopsis: e.target.value })} />
          </div>

          {createError && <p className="text-sm text-red-500">{createError}</p>}

          <button
            type="submit"
            disabled={creating}
            className="px-6 py-3 border border-amber-700 text-amber-700 text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-amber-700 hover:text-white transition-all disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Book'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className={`rounded-sm border p-6 mb-8 ${cardCls}`}>
        <h3 className={`text-xs uppercase tracking-[0.3em] mb-3 ${textMuted}`}>Payments</h3>
        {syncingStripe ? (
          <p className={`text-sm ${textMuted}`}>Checking your Stripe status...</p>
        ) : profile?.stripePayoutsEnabled ? (
          <p className="text-sm text-amber-700 font-semibold">Stripe connected — you can receive tips from readers.</p>
        ) : (
          <>
            <p className={`text-sm mb-4 ${textMuted}`}>Connect a Stripe account to receive tips from readers.</p>
            {connectError && <p className="text-sm text-red-500 mb-3">{connectError}</p>}
            <button
              onClick={handleConnectStripe}
              disabled={connecting}
              className="px-6 py-3 border border-amber-700 text-amber-700 text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-amber-700 hover:text-white transition-all disabled:opacity-50"
            >
              {connecting ? 'Redirecting...' : 'Connect Stripe'}
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-between mb-6">
        <h2 className={`text-2xl font-['Playfair_Display'] ${isLight ? 'text-gray-900' : 'text-white'}`}>My Books</h2>
        <button
          onClick={() => setSelectedBookId('new')}
          className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] border border-amber-700 text-amber-700 hover:bg-amber-700 hover:text-white transition-all"
        >
          New Book
        </button>
      </div>

      {loading ? (
        <p className={`text-sm ${textMuted}`}>Loading your books...</p>
      ) : books.length === 0 ? (
        <p className={`text-sm ${textMuted}`}>You haven't created any books yet.</p>
      ) : (
        <div className="space-y-3">
          {books.map((book) => (
            <button
              key={book.id}
              onClick={() => setSelectedBookId(book.id)}
              className={`w-full text-left flex items-center justify-between rounded-sm border p-5 transition-colors hover:border-amber-700 ${cardCls}`}
            >
              <div>
                <p className={`text-sm font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>{book.title}</p>
                <p className={`text-xs ${textMuted}`}>{book.genre || 'No genre set'}</p>
              </div>
              <span
                className={`text-[10px] uppercase tracking-[0.15em] font-bold px-3 py-1 rounded-full ${
                  book.isPublished ? 'text-amber-700 border border-amber-700' : `${textMuted} border border-current`
                }`}
              >
                {book.isPublished ? 'Published' : 'Draft'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CreatorStudio;
