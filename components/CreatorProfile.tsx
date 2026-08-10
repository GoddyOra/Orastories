import React, { useEffect, useState } from 'react';
import { ThemeMode } from '../types';
import { BookCatalogItem } from '../lib/books';
import { BookRatingSummary, getBookRatings } from '../lib/reviews';
import { PublicCreatorProfile, getCreatorProfile, listPublishedBooksByCreator } from '../lib/creatorProfile';
import BookCard from './BookCard';

interface CreatorProfileProps {
  username: string;
  theme: ThemeMode;
  onSelectBook: (book: BookCatalogItem) => void;
  onBack: () => void;
}

const CreatorProfile: React.FC<CreatorProfileProps> = ({ username, theme, onSelectBook, onBack }) => {
  const isLight = theme === 'light';
  const [profile, setProfile] = useState<PublicCreatorProfile | null>(null);
  const [books, setBooks] = useState<BookCatalogItem[]>([]);
  const [ratings, setRatings] = useState<Record<string, BookRatingSummary>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setNotFound(false);

    Promise.all([getCreatorProfile(username), listPublishedBooksByCreator(username), getBookRatings()])
      .then(([profileResult, bookResults, ratingsResult]) => {
        if (cancelled) return;
        if (!profileResult) {
          setNotFound(true);
          return;
        }
        setProfile(profileResult);
        setBooks(bookResults);
        setRatings(ratingsResult);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load creator profile:', error);
        setNotFound(true);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

  const memberSinceYear = profile ? new Date(profile.memberSince).getFullYear() : null;

  return (
    <div className={`min-h-screen transition-colors duration-500 py-16 sm:py-20 md:py-24 px-4 sm:px-6 md:px-12 ${isLight ? 'bg-[#fcfaf7]' : 'bg-[#0f0f0f]'}`}>
      <div className="max-w-5xl mx-auto mb-10">
        <button
          onClick={onBack}
          className={`inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] font-semibold transition-colors ${
            isLight ? 'text-gray-500 hover:text-amber-700' : 'text-gray-400 hover:text-amber-400'
          }`}
        >
          <span className="text-base leading-none">←</span> Back to Library
        </button>
      </div>

      {isLoading ? (
        <p className={`text-center text-sm uppercase tracking-[0.3em] ${isLight ? 'text-gray-400' : 'text-gray-600'}`}>Loading...</p>
      ) : notFound || !profile ? (
        <div className="max-w-2xl mx-auto text-center">
          <h1 className={`text-3xl font-['Playfair_Display'] mb-4 ${isLight ? 'text-gray-900' : 'text-white'}`}>Creator not found</h1>
          <p className={isLight ? 'text-gray-600' : 'text-gray-400'}>This creator doesn't exist or hasn't been approved yet.</p>
        </div>
      ) : (
        <>
          <header className="max-w-5xl mx-auto mb-14 sm:mb-16 md:mb-24 text-center">
            <h1 className={`text-4xl sm:text-5xl md:text-6xl font-['Playfair_Display'] mb-3 tracking-tight ${isLight ? 'text-gray-900' : 'text-[#d4af37]'}`}>
              {profile.displayName || profile.username}
            </h1>
            <p className={`text-[10px] sm:text-xs uppercase tracking-[0.35em] font-semibold ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
              @{profile.username}
              {memberSinceYear ? ` — Member since ${memberSinceYear}` : ''}
            </p>
            {profile.bio && (
              <p className={`max-w-2xl mx-auto mt-6 text-sm sm:text-base leading-relaxed ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                {profile.bio}
              </p>
            )}
            <div className={`w-16 h-px mx-auto opacity-40 mt-8 ${isLight ? 'bg-gray-400' : 'bg-[#d4af37]'}`}></div>
          </header>

          {books.length === 0 ? (
            <p className={`text-center text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>Hasn't published any books yet.</p>
          ) : (
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-12 sm:gap-16 md:gap-20 lg:gap-24 justify-items-center">
              {books.map((book, index) => (
                <BookCard
                  key={book.id}
                  book={book}
                  theme={theme}
                  rating={ratings[book.id]}
                  priority={index === 0}
                  onSelectBook={onSelectBook}
                  onSelectCreator={() => {}}
                  disableCreatorLink
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CreatorProfile;
