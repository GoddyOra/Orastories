import React, { useEffect, useState } from 'react';
import { ThemeMode } from '../types';
import { BookCatalogItem, fetchBookCatalog } from '../constants';
import { BookRatingSummary, getBookRatings } from '../lib/reviews';
import BookCard from './BookCard';

interface LibraryProps {
  onSelectBook: (book: BookCatalogItem) => void;
  onSelectCreator: (username: string) => void;
  theme: ThemeMode;
}

const Library: React.FC<LibraryProps> = ({ onSelectBook, onSelectCreator, theme }) => {
  const isLight = theme === 'light';
  const [books, setBooks] = useState<BookCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
        <h1 className={`text-5xl sm:text-6xl md:text-8xl font-['Playfair_Display'] mb-4 sm:mb-6 tracking-tight ${isLight ? 'text-gray-900' : 'text-[#d4af37]'}`}>
          Orastories
        </h1>
        <p className={`text-[10px] sm:text-xs uppercase tracking-[0.35em] sm:tracking-[0.6em] font-semibold mb-8 sm:mb-10 ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
          The Archives of Goddy Ora
        </p>
        <div className={`w-16 h-px mx-auto opacity-40 ${isLight ? 'bg-gray-400' : 'bg-[#d4af37]'}`}></div>
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
