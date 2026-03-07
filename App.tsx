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
    window.dispatchEvent(new CustomEvent('orastories-theme-change', { detail: { theme } }));
  }, [theme]);

  useEffect(() => {
    const handleExternalThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: ThemeMode }>;
      const nextTheme = customEvent.detail?.theme;
      if (!nextTheme) return;
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

  return (
    <div className={`min-h-screen transition-colors duration-500 ${theme === 'light' ? 'bg-[#fcfaf7] text-[#1a1a1a]' : 'bg-[#0f0f0f] text-[#e0e0e0]'}`}>
      {!selectedBook ? (
        <>
          <Library onSelectBook={setSelectedBook} theme={theme} />
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
