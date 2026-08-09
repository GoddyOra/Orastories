import React, { useEffect, useState } from 'react';
import { ThemeMode } from '../types';
import { BookCatalogItem, fetchBookCatalog } from '../constants';

interface LibraryProps {
  onSelectBook: (book: BookCatalogItem) => void;
  theme: ThemeMode;
}

// Unsplash serves whatever width is requested - the source URLs stored in
// Supabase default to a much larger width than a book cover ever renders at
// in this grid, so covers are re-requested at a size close to their actual
// display size (max-w-sm card, 2/3 aspect ratio, up to 3 columns @2x retina).
const getCoverSrc = (url: string) => {
  if (!url.includes('images.unsplash.com')) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('w', '750');
    parsed.searchParams.set('q', '70');
    parsed.searchParams.set('auto', 'format');
    parsed.searchParams.set('fit', 'crop');
    return parsed.toString();
  } catch {
    return url;
  }
};

const Library: React.FC<LibraryProps> = ({ onSelectBook, theme }) => {
  const isLight = theme === 'light';
  const [books, setBooks] = useState<BookCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
          <div 
            key={book.id}
            className="group relative cursor-pointer w-full max-w-sm"
            onClick={() => onSelectBook(book)}
          >
            {/* Elegant Book Cover */}
            <div className={`relative aspect-[2/3] overflow-hidden rounded-sm transition-all duration-700 group-hover:-translate-y-6 ${isLight ? 'shadow-[0_20px_40px_rgba(0,0,0,0.1)] group-hover:shadow-[0_40px_60px_rgba(0,0,0,0.15)]' : 'shadow-[0_20px_50px_rgba(0,0,0,0.8)] group-hover:shadow-[0_40px_80px_rgba(212,175,55,0.15)]'}`}>
              <img
                src={getCoverSrc(book.cover)}
                alt={book.title}
                width={500}
                height={750}
                loading={index === 0 ? 'eager' : 'lazy'}
                fetchPriority={index === 0 ? 'high' : undefined}
                className="w-full h-full object-cover grayscale-[0.2] transition-all duration-1000 group-hover:scale-105 group-hover:grayscale-0"
              />
              {/* Synopsis Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-6 sm:p-8 md:p-10">
                <p className="text-[#d4af37] text-[10px] mb-3 tracking-[0.3em] uppercase font-bold">{book.genre}</p>
                <p className="text-2xl md:text-3xl font-['Playfair_Display'] mb-4 italic leading-tight text-white">{book.title}</p>
                <p className="text-sm text-gray-300 line-clamp-3 font-light leading-relaxed mb-8">
                  {book.synopsis}
                </p>
                <div className="w-fit border-b border-[#d4af37] pb-1 text-[#d4af37] text-[10px] uppercase tracking-[0.4em] hover:text-white hover:border-white transition-all">
                  Begin Reading
                </div>
              </div>
            </div>
            
            <div className="mt-8 sm:mt-10 text-center">
              <h2 className={`text-xl sm:text-2xl font-['Playfair_Display'] tracking-wide transition-colors ${isLight ? 'text-gray-900 group-hover:text-gray-600' : 'text-white group-hover:text-[#d4af37]'}`}>
                {book.title}
              </h2>
              <p className="text-gray-500 text-[10px] mt-3 uppercase tracking-[0.3em] font-medium">
                {book.author} — {book.publishedDate}
              </p>
            </div>
          </div>
        ))}
      </div>

      <footer className="mt-20 sm:mt-28 md:mt-40 border-t border-black/5 pt-10 sm:pt-14 md:pt-20 text-center">
        <p className={`text-[10px] tracking-[0.4em] uppercase ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
          &copy; {new Date().getFullYear()} Goddy Ora Archives. All stories are property of the author.
        </p>
      </footer>
    </div>
  );
};

export default Library;
