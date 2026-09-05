import React, { useEffect, useState } from 'react';
import { ThemeMode } from '../types';
import { BookCatalogItem, fetchBookCatalog, loadBookById } from '../constants';
import { BookRatingSummary, getBookRatings } from '../lib/reviews';
import BookCard from './BookCard';

// scripts/generate-seo-pages.mjs embeds the published catalog as JSON in
// index.html at build time so crawlers without JS see real content
// immediately. index.tsx mounts with createRoot (not hydrateRoot), so React
// fully replaces #root's pre-rendered HTML on first render regardless -
// seeding this component's initial state from the same JSON means that
// first render already shows the real cards instead of the loading
// skeleton, so a JS-enabled visitor never sees a flash between the two. The
// live fetch below still always runs afterward to reconcile with anything
// published since the last deploy.
function readEmbeddedCatalog(): BookCatalogItem[] {
  if (typeof document === 'undefined') return [];
  const node = document.getElementById('ssg-books-data');
  if (!node?.textContent) return [];
  try {
    const rows = JSON.parse(node.textContent) as Array<Omit<BookCatalogItem, 'loadBook'>>;
    return rows.map((row) => ({ ...row, loadBook: () => loadBookById(row.id) }));
  } catch {
    return [];
  }
}

interface LibraryProps {
  onSelectBook: (book: BookCatalogItem) => void;
  onSelectCreator: (username: string) => void;
  theme: ThemeMode;
}

const Library: React.FC<LibraryProps> = ({ onSelectBook, onSelectCreator, theme }) => {
  const isLight = theme === 'light';
  const [embeddedCatalog] = useState<BookCatalogItem[]>(readEmbeddedCatalog);
  const [books, setBooks] = useState<BookCatalogItem[]>(embeddedCatalog);
  const [isLoading, setIsLoading] = useState(embeddedCatalog.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, BookRatingSummary>>({});

  useEffect(() => {
    let cancelled = false;

    fetchBookCatalog()
      .then((catalog) => {
        if (cancelled) return;
        setBooks(catalog);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError('Unable to load the library right now. Please try again.');
        console.error('Book catalog load failed:', error);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Ratings are a supplementary display, not core function - a failure here
  // shouldn't block or error out the catalog itself, so it's a separate
  // effect with no shared loading/error state.
  useEffect(() => {
    let cancelled = false;

    getBookRatings()
      .then((summary) => {
        if (cancelled) return;
        setRatings(summary);
      })
      .catch((error) => console.error('Book ratings load failed:', error));

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={`min-h-screen transition-colors duration-500 py-16 sm:py-20 md:py-24 px-4 sm:px-6 md:px-12 ${isLight ? 'bg-[#fcfaf7]' : 'bg-[#0f0f0f]'}`}>
      <header className="max-w-5xl mx-auto mb-14 sm:mb-16 md:mb-24 text-center">
        <h1 className={`text-5xl sm:text-6xl md:text-8xl font-['Playfair_Display'] mb-4 sm:mb-6 tracking-tight min-h-[80px] sm:min-h-[104px] md:min-h-[150px] ${isLight ? 'text-gray-900' : 'text-[#d4af37]'}`}>
          Orastories
          <span className="block text-[10px] sm:text-xs uppercase tracking-[0.35em] sm:tracking-[0.6em] font-semibold mt-2 sm:mt-3 text-gray-500">
            A Community of Storytellers
          </span>
        </h1>
        <div className={`w-16 h-px mx-auto opacity-40 mb-8 sm:mb-10 ${isLight ? 'bg-gray-400' : 'bg-[#d4af37]'}`}></div>
        <p className={`max-w-xl mx-auto text-sm leading-relaxed ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
          Free romance, thriller, and nonfiction novels from independent authors — read online, no downloads or apps
          required. Preview any book's first 3 chapters instantly, then claim it free to keep reading on any phone,
          tablet, or computer.
        </p>
      </header>

      {loadError && (
        <p className="text-center text-sm text-red-500">{loadError}</p>
      )}

      {isLoading && (
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-12 sm:gap-16 md:gap-20 lg:gap-24 justify-items-center" aria-hidden="true">
          {[0, 1, 2].map((placeholder) => (
            <div key={placeholder} className="w-full max-w-sm animate-pulse">
              <div className={`relative aspect-[2/3] overflow-hidden rounded-sm ${isLight ? 'bg-gray-200' : 'bg-gray-800'}`}></div>
              <div className="mt-8 sm:mt-10 flex flex-col items-center gap-3">
                <div className={`h-6 w-2/3 rounded ${isLight ? 'bg-gray-200' : 'bg-gray-800'}`}></div>
                <div className={`h-3 w-1/3 rounded ${isLight ? 'bg-gray-200' : 'bg-gray-800'}`}></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-12 sm:gap-16 md:gap-20 lg:gap-24 justify-items-center">
        {books.map((book, index) => (
          <BookCard
            key={book.id}
            book={book}
            theme={theme}
            rating={ratings[book.id]}
            priority={index === 0}
            onSelectBook={onSelectBook}
            onSelectCreator={onSelectCreator}
          />
        ))}
      </div>
    </div>
  );
};

export default Library;
