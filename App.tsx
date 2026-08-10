import React, { useState, useEffect, useRef } from 'react';
import Library from './components/Library';
import Reader from './components/Reader';
import Portal from './components/Portal';
import CreatorProfile from './components/CreatorProfile';
import NavAccountControl from './components/NavAccountControl';
import { Book, ThemeMode } from './types';
import { BookCatalogItem } from './constants';

const App: React.FC = () => {
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isLoadingBook, setIsLoadingBook] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPortal, setShowPortal] = useState(false);
  const [selectedCreatorUsername, setSelectedCreatorUsername] = useState<string | null>(null);
  const [tipNotice, setTipNotice] = useState<string | null>(null);
  const loadRequestId = useRef(0);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light';
    return localStorage.getItem('darkMode') === 'true' ? 'dark' : 'light';
  });

  // Smooth scroll behavior
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
  }, []);

  // Stripe Connect onboarding also redirects back here as a full page
  // navigation (see the tip-notice effect below for why). The sync check
  // that reads the actual verification status lives inside Creator Studio,
  // so returning here has to reopen Portal on the right tab, not just land
  // back on the library with the query param sitting unused in the URL.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('stripe_return') === '1') {
      setShowPortal(true);
    }
  }, []);

  // The static marketing pages (about.html, books.html, etc.) have no
  // sign-in form of their own - their nav's "Sign In" / "My Account" links
  // send readers here with this param so they land directly in Portal
  // instead of just the plain library view.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('openPortal') !== '1') return;
    setShowPortal(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('openPortal');
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Static pages (reviews.html) can only link into the React app via a full
  // URL, same reasoning as openPortal above - a creator's username in the
  // query string opens their public profile directly.
  useEffect(() => {
    const username = new URLSearchParams(window.location.search).get('creator');
    if (!username) return;
    setSelectedCreatorUsername(username);
    const url = new URL(window.location.href);
    url.searchParams.delete('creator');
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Stripe Checkout redirects back here as a full page navigation (React
  // state doesn't survive the trip to checkout.stripe.com and back), so this
  // is just a one-time acknowledgment on the library view, not a return to
  // the specific book the reader was tipping from.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tip = params.get('tip');
    if (tip === 'success') {
      setTipNotice('Thank you for your tip!');
    } else if (tip === 'cancelled') {
      setTipNotice('Tip cancelled.');
    } else {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('tip');
    window.history.replaceState({}, '', url.toString());
    const timeout = setTimeout(() => setTipNotice(null), 5000);
    return () => clearTimeout(timeout);
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

    if (selectedBook || showPortal) {
      navElement.style.display = 'none';
      navElement.setAttribute('aria-hidden', 'true');
      if (wrapperElement) wrapperElement.style.paddingTop = '0px';
      return;
    }

    navElement.style.display = '';
    navElement.removeAttribute('aria-hidden');
    if (wrapperElement) wrapperElement.style.paddingTop = '';
    window.dispatchEvent(new Event('resize'));
  }, [selectedBook, showPortal]);

  const handleSelectBook = async (book: BookCatalogItem) => {
    const requestId = ++loadRequestId.current;
    setLoadError(null);
    setIsLoadingBook(true);
    setShowPortal(false);

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

  const handleOpenPortal = () => {
    setSelectedBook(null);
    setShowPortal(true);
  };

  const handleSelectCreator = (username: string) => {
    setSelectedBook(null);
    setShowPortal(false);
    setSelectedCreatorUsername(username);
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 ${theme === 'light' ? 'bg-[#fcfaf7] text-[#1a1a1a]' : 'bg-[#0f0f0f] text-[#e0e0e0]'}`}>
      <NavAccountControl theme={theme} onOpenPortal={handleOpenPortal} />

      {tipNotice && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[96] rounded border border-amber-700/30 bg-amber-50/95 text-amber-900 px-4 py-2 text-sm shadow-sm">
          {tipNotice}
        </div>
      )}

      <main>
        {selectedBook ? (
          <div className="animate-readerFadeIn">
            <Reader
              book={selectedBook}
              onClose={() => setSelectedBook(null)}
              externalTheme={theme}
              onThemeChange={setTheme}
              onRequireSignIn={handleOpenPortal}
            />
          </div>
        ) : showPortal ? (
          <Portal
            theme={theme}
            onSelectBook={handleSelectBook}
            onSelectCreator={handleSelectCreator}
            onClose={() => setShowPortal(false)}
          />
        ) : selectedCreatorUsername ? (
          <CreatorProfile
            username={selectedCreatorUsername}
            theme={theme}
            onSelectBook={handleSelectBook}
            onBack={() => setSelectedCreatorUsername(null)}
          />
        ) : (
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
            <Library onSelectBook={handleSelectBook} onSelectCreator={handleSelectCreator} theme={theme} />
          </>
        )}
      </main>

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
