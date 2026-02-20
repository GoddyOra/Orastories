import React from 'react';
import { Book, ThemeMode } from '../types';
import { BOOKS } from '../constants';

interface LibraryProps {
  onSelectBook: (book: Book) => void;
  theme: ThemeMode;
}

const Library: React.FC<LibraryProps> = ({ onSelectBook, theme }) => {
  const isLight = theme === 'light';

  return (
    <div className={`min-h-screen transition-colors duration-500 py-24 px-6 md:px-12 ${isLight ? 'bg-[#fcfaf7]' : 'bg-[#0f0f0f]'}`}>
      <header className="max-w-5xl mx-auto mb-24 text-center">
        <h1 className={`text-6xl md:text-8xl font-['Playfair_Display'] mb-6 tracking-tight ${isLight ? 'text-gray-900' : 'text-[#d4af37]'}`}>
          Orastories
        </h1>
        <p className={`text-xs uppercase tracking-[0.6em] font-semibold mb-10 ${isLight ? 'text-gray-500' : 'text-gray-500'}`}>
          The Archives of Goddy Ora
        </p>
        <div className={`w-16 h-px mx-auto opacity-40 ${isLight ? 'bg-gray-400' : 'bg-[#d4af37]'}`}></div>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-16 md:gap-24">
        {BOOKS.map((book) => (
          <div 
            key={book.id}
            className="group relative cursor-pointer"
            onClick={() => onSelectBook(book)}
          >
            {/* Elegant Book Cover */}
            <div className={`relative aspect-[2/3] overflow-hidden rounded-sm transition-all duration-700 group-hover:-translate-y-6 ${isLight ? 'shadow-[0_20px_40px_rgba(0,0,0,0.1)] group-hover:shadow-[0_40px_60px_rgba(0,0,0,0.15)]' : 'shadow-[0_20px_50px_rgba(0,0,0,0.8)] group-hover:shadow-[0_40px_80px_rgba(212,175,55,0.15)]'}`}>
              <img 
                src={book.cover} 
                alt={book.title}
                className="w-full h-full object-cover grayscale-[0.2] transition-all duration-1000 group-hover:scale-105 group-hover:grayscale-0"
              />
              {/* Synopsis Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-10">
                <p className="text-[#d4af37] text-[10px] mb-3 tracking-[0.3em] uppercase font-bold">{book.genre}</p>
                <h3 className="text-3xl font-['Playfair_Display'] mb-4 italic leading-tight text-white">{book.title}</h3>
                <p className="text-sm text-gray-300 line-clamp-3 font-light leading-relaxed mb-8">
                  {book.synopsis}
                </p>
                <div className="w-fit border-b border-[#d4af37] pb-1 text-[#d4af37] text-[10px] uppercase tracking-[0.4em] hover:text-white hover:border-white transition-all">
                  Begin Reading
                </div>
              </div>
            </div>
            
            <div className="mt-10 text-center">
              <h2 className={`text-2xl font-['Playfair_Display'] tracking-wide transition-colors ${isLight ? 'text-gray-900 group-hover:text-gray-600' : 'text-white group-hover:text-[#d4af37]'}`}>
                {book.title}
              </h2>
              <p className="text-gray-500 text-[10px] mt-3 uppercase tracking-[0.3em] font-medium">
                {book.author} — {book.publishedDate}
              </p>
            </div>
          </div>
        ))}
      </div>

      <footer className="mt-40 border-t border-black/5 pt-20 text-center">
        <p className={`text-[10px] tracking-[0.4em] uppercase ${isLight ? 'text-gray-400' : 'text-gray-700'}`}>
          &copy; {new Date().getFullYear()} Goddy Ora Archives. All stories are property of the author.
        </p>
      </footer>
    </div>
  );
};

export default Library;