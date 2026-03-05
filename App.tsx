import React, { useState, useEffect } from 'react';
import Library from './components/Library';
import Reader from './components/Reader';
import { Book, ThemeMode } from './types';

const App: React.FC = () => {
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light';
    return localStorage.getItem('darkMode') === 'true' ? 'dark' : 'light';
  });

  // Smooth scroll behavior
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
  }, []);

  useEffect(() => {
    localStorage.setItem('darkMode', theme === 'dark' ? 'true' : 'false');
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 ${theme === 'light' ? 'bg-[#fcfaf7] text-[#1a1a1a]' : 'bg-[#0f0f0f] text-[#e0e0e0]'}`}>
      {!selectedBook ? (
        <>
          <div className="fixed top-4 right-4 md:top-8 md:right-8 z-50">
            <button 
              onClick={toggleTheme}
              className={`p-2.5 md:p-3 rounded-full shadow-xl transition-all hover:scale-110 active:scale-95 border ${theme === 'light' ? 'bg-white border-gray-200 text-gray-800' : 'bg-[#1a1a1a] border-white/10 text-[#d4af37]'}`}
              title={theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            </button>
          </div>
          <Library onSelectBook={setSelectedBook} theme={theme} />
        </>
      ) : (
        <div className="animate-fadeIn">
          <Reader 
            book={selectedBook} 
            onClose={() => setSelectedBook(null)} 
            externalTheme={theme}
            onThemeChange={setTheme}
          />
        </div>
      )}
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.8s ease-out forwards;
        }
        .animate-slideUp {
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};

const SunIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

export default App;
