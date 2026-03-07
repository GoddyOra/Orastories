import React, { useState, useEffect, useRef } from 'react';
import Library from './components/Library';
import Reader from './components/Reader';
import { Book, ThemeMode } from './types';
import { BookCatalogItem } from './constants';

const App: React.FC = () => {
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isLoadingBook, setIsLoadingBook] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestId = useRef(0);
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
    window.dispatchEvent(new CustomEvent('orastories-theme-change', { detail: { theme } }));
  }, [theme]);

  useEffect(() => {
    const handleExternalThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: ThemeMode }>;
      const nextTheme = customEvent.detail?.theme;
      if (!nextTheme) return;
      if (nextTheme !== 'light' && nextTheme !== 'dark') return;
      setTheme(prev => (prev === nextTheme ? prev : nextTheme));
    };

    window.addEventListener('orastories-theme-change', handleExternalThemeChange as EventListener);
    return () => window.removeEventListener('orastories-theme-change', handleExternalThemeChange as EventListener);
  }, []);

  useEffect(() => {
    const siteNav = document.getElementById('siteNavBar') || document.querySelector('body > nav');
    const contentWrapper = document.getElementById('contentWrapper');
    const navElement = siteNav instanceof HTMLElement ? siteNav : null;
    const wrapperElement = contentWrapper instanceof HTMLElement ? contentWrapper : null;

    if (!navElement) return;

    if (selectedBook) {
      navElement.style.display = 'none';
      navElement.setAttribute('aria-hidden', 'true');
      if (wrapperElement) wrapperElement.style.paddingTop = '0px';
      return;
    }

    navElement.style.display = '';
    navElement.removeAttribute('aria-hidden');
    if (wrapperElement) wrapperElement.style.paddingTop = '';
    window.dispatchEvent(new Event('resize'));
  }, [selectedBook]);

  const handleSelectBook = async (book: BookCatalogItem) => {
    const requestId = ++loadRequestId.current;
    setLoadError(null);
    setIsLoadingBook(true);

    try {
      const loadedBook = await book.loadBook();
      if (loadRequestId.current !== requestId) return;
      setSelectedBook(loadedBook);
    } catch (error) {
      if (loadRequestId.current !== requestId) return;
      setLoadError('Unable to open this book right now. Please try again.');
      console.error('Book load failed:', error);
    } finally {
      if (loadRequestId.current === requestId) {
        setIsLoadingBook(false);
      }
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 ${theme === 'light' ? 'bg-[#fcfaf7] text-[#1a1a1a]' : 'bg-[#0f0f0f] text-[#e0e0e0]'}`}>
      {!selectedBook ? (
        <>
          {loadError && (
            <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[96] rounded border border-red-500/30 bg-red-100/90 text-red-900 px-4 py-2 text-sm">
              {loadError}
            </div>
          )}
          {isLoadingBook && (
            <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
              <div className="rounded border border-black/10 bg-white/95 px-5 py-3 text-sm font-semibold text-[#1a1a1a]">
                Opening book...
              </div>
            </div>
          )}
          <Library onSelectBook={handleSelectBook} theme={theme} />
        </>
      ) : (
        <div className="animate-readerFadeIn">
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
        @keyframes readerFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-readerFadeIn {
          animation: readerFadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default App;
