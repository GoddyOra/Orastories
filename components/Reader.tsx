import React, { useState, useEffect, useRef } from 'react';
import { Book, Chapter, ThemeMode, ReadingSettings } from '../types';
import AIAssistant from './AIAssistant';

interface ReaderProps {
  book: Book;
  onClose: () => void;
  externalTheme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

const getDeviceWidth = () => (typeof window === 'undefined' ? 1280 : window.innerWidth);

const getDefaultTypography = (width: number) => {
  if (width < 640) return { fontSize: 16, lineHeight: 1.75 };
  if (width < 1024) return { fontSize: 18, lineHeight: 1.8 };
  return { fontSize: 20, lineHeight: 1.85 };
};

const getFontRange = (width: number) => {
  if (width < 640) return { min: 14, max: 22 };
  if (width < 1024) return { min: 15, max: 28 };
  return { min: 16, max: 32 };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const Reader: React.FC<ReaderProps> = ({ book, onClose, externalTheme, onThemeChange }) => {
  const [viewportWidth, setViewportWidth] = useState(getDeviceWidth);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [readingProgress, setReadingProgress] = useState(0);
  const [settings, setSettings] = useState<ReadingSettings>(() => {
    const defaults = getDefaultTypography(getDeviceWidth());
    return {
      theme: externalTheme,
      fontSize: defaults.fontSize,
      lineHeight: defaults.lineHeight
    };
  });
  const [showSettings, setShowSettings] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const chapter = book.chapters[currentChapterIndex];
  const fontRange = getFontRange(viewportWidth);

  // Sync settings theme with external theme
  useEffect(() => {
    setSettings(s => ({ ...s, theme: externalTheme }));
  }, [externalTheme]);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const updatedRange = getFontRange(viewportWidth);
    setSettings(prev => ({
      ...prev,
      fontSize: clamp(prev.fontSize, updatedRange.min, updatedRange.max)
    }));
  }, [viewportWidth]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight > 0) {
        const progress = (window.scrollY / scrollHeight) * 100;
        setReadingProgress(progress);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const preventCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      alert("The ink is protected by the archive's seal.");
    };

    const preventContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const preventKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'u' || e.key === 'p' || e.key === 's')) {
        e.preventDefault();
        alert("The Archives of Goddy Ora are for reading, not for copying.");
      }
    };

    document.addEventListener('copy', preventCopy);
    document.addEventListener('contextmenu', preventContextMenu);
    document.addEventListener('keydown', preventKeys);

    return () => {
      document.removeEventListener('copy', preventCopy);
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('keydown', preventKeys);
    };
  }, []);

  const getThemeClasses = () => {
    switch (settings.theme) {
      case 'sepia': return 'bg-[#f4ecd8] text-[#5b4636]';
      case 'light': return 'bg-[#f8f9fa] text-[#1a1a1a]';
      default: return 'bg-[#0a0a0a] text-[#e0e0e0]';
    }
  };

  const getPageClasses = () => {
    switch (settings.theme) {
      case 'sepia': return 'bg-[#fcf8ed] border-[#e9dec1] shadow-[0_10px_50px_rgba(91,70,54,0.15)]';
      case 'light': return 'bg-white border-black/5 shadow-[0_10px_50px_rgba(0,0,0,0.05)]';
      default: return 'bg-[#121212] border-white/5 shadow-[0_10px_50px_rgba(0,0,0,0.6)]';
    }
  };

  const getTitleColor = () => {
    switch (settings.theme) {
      case 'sepia': return 'text-[#8b4513]';
      case 'light': return 'text-[#1a1a1a]';
      default: return 'text-[#d4af37]';
    }
  };

  const handleAuraChange = (t: ThemeMode) => {
    setSettings(prev => ({ ...prev, theme: t }));
    onThemeChange(t);
  };

  return (
    <div className={`min-h-screen transition-colors duration-700 ease-in-out pb-20 md:pb-32 ${getThemeClasses()}`} ref={containerRef}>
      {/* Progress Bar */}
      <div className="fixed top-0 left-0 w-full h-1 z-50 bg-gray-800/30">
        <div 
          className="h-full bg-[#d4af37] transition-all duration-300 shadow-[0_0_10px_#d4af37]"
          style={{ width: `${readingProgress}%` }}
        />
      </div>

      {/* Reader Nav */}
      <nav className={`fixed top-0 left-0 w-full px-3 sm:px-4 md:px-6 py-3 md:py-4 flex justify-between items-center z-40 backdrop-blur-xl border-b transition-colors duration-500 ${settings.theme === 'dark' ? 'border-white/5 bg-black/20' : 'border-black/5 bg-white/20'}`}>
        <button 
          onClick={onClose}
          className="text-[10px] tracking-[0.2em] sm:tracking-[0.3em] uppercase flex items-center gap-2 sm:gap-3 hover:text-[#d4af37] transition-colors group"
        >
          <span className="text-base sm:text-lg group-hover:-translate-x-1 transition-transform">←</span> Return
        </button>
        <div className="hidden md:block text-[11px] uppercase tracking-[0.6em] text-[#d4af37] font-bold">
          Goddy Ora Presents
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleAuraChange(settings.theme === 'light' ? 'dark' : 'light')}
            className={`p-2 rounded-full transition-colors ${settings.theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-black/10'}`}
            title="Toggle Light/Dark Mode"
          >
            {settings.theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-full transition-colors ${settings.theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-black/10'}`}
          >
            <SettingsIcon />
          </button>
        </div>
      </nav>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setShowSettings(false)}>
          <div 
            className="bg-[#161616] text-white p-6 sm:p-8 md:p-10 rounded-sm shadow-2xl w-full max-w-sm border border-[#d4af37]/20"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl sm:text-2xl font-['Playfair_Display'] mb-6 sm:mb-8 text-[#d4af37] italic">Archive Settings</h3>
            
            <div className="space-y-6 sm:space-y-8">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-4">Aura</label>
                <div className="flex gap-6">
                  {(['dark', 'light', 'sepia'] as ThemeMode[]).map(t => (
                    <button
                      key={t}
                      onClick={() => handleAuraChange(t)}
                      className={`w-12 h-12 rounded-full border-2 transition-all ${t === 'dark' ? 'bg-[#0f0f0f]' : t === 'light' ? 'bg-white' : 'bg-[#f4ecd8]'} ${settings.theme === t ? 'border-[#d4af37] scale-110' : 'border-white/10'}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-4">Text Scale</label>
                <input 
                  type="range" min={fontRange.min} max={fontRange.max} value={settings.fontSize}
                  onChange={e => setSettings({ ...settings, fontSize: parseInt(e.target.value) })}
                  className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#d4af37]"
                />
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="w-full py-4 border border-[#d4af37]/40 text-[#d4af37] text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-[#d4af37] hover:text-black transition-all"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area - Styled like a professional Folio Page */}
      <main className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 pt-28 sm:pt-36 md:pt-44 lg:pt-48 protected-text">
        <div className={`relative p-6 sm:p-8 md:p-14 lg:p-24 rounded-sm border transition-colors duration-700 ${getPageClasses()}`}>
          <header className="mb-14 sm:mb-16 md:mb-24 text-center">
            <h1 className={`text-3xl sm:text-5xl md:text-7xl lg:text-8xl font-['Playfair_Display'] leading-tight mb-6 sm:mb-8 ${getTitleColor()}`}>
              {chapter.title}
            </h1>
            <div className="w-24 h-px bg-current mx-auto opacity-10"></div>
          </header>

          <article 
            className="font-['EB_Garamond'] text-left md:text-justify selection:bg-[#d4af37]/30 whitespace-pre-wrap"
            style={{ 
              fontSize: `${settings.fontSize}px`, 
              lineHeight: settings.lineHeight 
            }}
          >
            {chapter.content.split('\n\n').map((para, i) => (
              <p key={i} className="mb-7 md:mb-10 indent-0 md:indent-12 first:indent-0 animate-fadeIn opacity-0 [animation-fill-mode:forwards]" style={{ animationDelay: `${i * 0.02}s` }}>
                {para}
              </p>
            ))}
          </article>

          {/* Footer Navigation within the Folio */}
          <div className="mt-20 md:mt-32 lg:mt-48 border-t border-current/5 pt-10 md:pt-16 lg:pt-20 flex justify-between items-center gap-6">
            <button 
              disabled={currentChapterIndex === 0}
              onClick={() => { setCurrentChapterIndex(prev => prev - 1); window.scrollTo(0, 0); }}
              className={`flex flex-col items-start gap-2 transition-all ${currentChapterIndex === 0 ? 'opacity-5 pointer-events-none' : 'hover:translate-x-[-8px]'}`}
            >
              <span className="text-[10px] uppercase tracking-[0.4em] opacity-40">Previous</span>
              <span className="text-lg sm:text-xl md:text-2xl font-['Playfair_Display'] italic">Turn Back</span>
            </button>
            
            <button 
              disabled={currentChapterIndex === book.chapters.length - 1}
              onClick={() => { setCurrentChapterIndex(prev => prev + 1); window.scrollTo(0, 0); }}
              className={`flex flex-col items-end gap-2 text-right transition-all ${currentChapterIndex === book.chapters.length - 1 ? 'opacity-5 pointer-events-none' : 'hover:translate-x-[8px]'}`}
            >
              <span className="text-[10px] uppercase tracking-[0.4em] opacity-40">Next</span>
              <span className="text-lg sm:text-xl md:text-2xl font-['Playfair_Display'] italic">Turn Page</span>
            </button>
          </div>
        </div>
      </main>

      <AIAssistant chapterContent={chapter.content} />
    </div>
  );
};

const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60 hover:opacity-100 transition-opacity">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

export default Reader;
