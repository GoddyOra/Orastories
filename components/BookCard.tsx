import React from 'react';
import { ThemeMode } from '../types';
import { BookCatalogItem } from '../lib/books';
import { BookRatingSummary } from '../lib/reviews';

interface BookCardProps {
  book: BookCatalogItem;
  theme: ThemeMode;
  rating?: BookRatingSummary;
  priority?: boolean;
  onSelectBook: (book: BookCatalogItem) => void;
  onSelectCreator: (username: string) => void;
  // Set on a creator's own profile page, where every card already belongs
  // to the creator being viewed - linking the byline there would just
  // reload the same page.
  disableCreatorLink?: boolean;
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

const BookCard: React.FC<BookCardProps> = ({
  book,
  theme,
  rating,
  priority,
  onSelectBook,
  onSelectCreator,
  disableCreatorLink
}) => {
  const isLight = theme === 'light';

  return (
    <div className="group relative cursor-pointer w-full max-w-sm" onClick={() => onSelectBook(book)}>
      {/* Elegant Book Cover */}
      <div
        className={`relative aspect-[2/3] overflow-hidden rounded-sm transition-all duration-700 group-hover:-translate-y-6 ${
          isLight
            ? 'shadow-[0_20px_40px_rgba(0,0,0,0.1)] group-hover:shadow-[0_40px_60px_rgba(0,0,0,0.15)]'
            : 'shadow-[0_20px_50px_rgba(0,0,0,0.8)] group-hover:shadow-[0_40px_80px_rgba(212,175,55,0.15)]'
        }`}
      >
        <img
          src={getCoverSrc(book.cover)}
          alt={book.title}
          width={500}
          height={750}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          className="w-full h-full object-cover grayscale-[0.2] transition-all duration-1000 group-hover:scale-105 group-hover:grayscale-0"
        />
        {/* Synopsis Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-6 sm:p-8 md:p-10">
          <p className="text-[#d4af37] text-[10px] mb-3 tracking-[0.3em] uppercase font-bold">{book.genre}</p>
          <p className="text-2xl md:text-3xl font-['Playfair_Display'] mb-4 italic leading-tight text-white">{book.title}</p>
          <p className="text-sm text-gray-300 line-clamp-3 font-light leading-relaxed mb-8">{book.synopsis}</p>
          <div className="w-fit border-b border-[#d4af37] pb-1 text-[#d4af37] text-[10px] uppercase tracking-[0.4em] hover:text-white hover:border-white transition-all">
            Begin Reading
          </div>
        </div>
      </div>

      <div className="mt-8 sm:mt-10 text-center">
        <h2
          className={`text-xl sm:text-2xl font-['Playfair_Display'] tracking-wide transition-colors ${
            isLight ? 'text-gray-900 group-hover:text-gray-600' : 'text-white group-hover:text-[#d4af37]'
          }`}
        >
          {book.title}
        </h2>
        <p className="text-gray-500 text-[10px] mt-3 uppercase tracking-[0.3em] font-medium">
          {book.creatorUsername && !disableCreatorLink ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectCreator(book.creatorUsername!);
              }}
              className={`transition-colors ${isLight ? 'hover:text-amber-700' : 'hover:text-amber-400'}`}
            >
              {book.author} — {book.publishedDate}
            </button>
          ) : (
            <>
              {book.author} — {book.publishedDate}
            </>
          )}
        </p>
        {rating && (
          <p className={`text-xs mt-3 tracking-wide ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>
            <span className="text-amber-600">
              {'★'.repeat(Math.round(rating.averageRating))}
              {'☆'.repeat(5 - Math.round(rating.averageRating))}
            </span>{' '}
            {rating.averageRating.toFixed(1)} ({rating.reviewCount} review{rating.reviewCount === 1 ? '' : 's'})
          </p>
        )}
      </div>
    </div>
  );
};

export default BookCard;
