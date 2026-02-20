
import React, { useState } from 'react';
import { GeminiService } from '../services/geminiService';

interface AIAssistantProps {
  chapterContent: string;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ chapterContent }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    const userText = query;
    setQuery('');
    setHistory(prev => [...prev, { role: 'user', text: userText }]);
    setIsLoading(true);

    const gemini = new GeminiService();
    const result = await gemini.discussChapter(chapterContent, userText);
    
    setHistory(prev => [...prev, { role: 'ai', text: result || '' }]);
    setIsLoading(false);
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#d4af37] text-black rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform z-40"
      >
        <AssistantIcon />
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-8 w-80 md:w-96 bg-[#1a1a1a] border border-[#d4af37]/30 rounded-xl shadow-2xl flex flex-col z-50 animate-slideUp">
          <div className="p-4 border-b border-[#d4af37]/20 flex justify-between items-center bg-black/40 rounded-t-xl">
            <h4 className="text-sm font-['Playfair_Display'] text-[#d4af37] flex items-center gap-2">
              <AssistantIcon size={16} /> Archive Companion
            </h4>
            <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white">&times;</button>
          </div>

          <div className="h-80 overflow-y-auto p-4 space-y-4 scroll-smooth">
            {history.length === 0 && (
              <p className="text-gray-500 text-xs text-center italic mt-8">
                "What mysteries do you wish to unravel in these pages?"
              </p>
            )}
            {history.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-lg text-xs leading-relaxed ${msg.role === 'user' ? 'bg-[#d4af37]/10 text-gray-200' : 'bg-[#3d3d3d]/50 text-[#d4af37]'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-[#3d3d3d]/50 p-3 rounded-lg flex gap-1">
                  <span className="w-1.5 h-1.5 bg-[#d4af37] rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-[#d4af37] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-[#d4af37] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-4 border-t border-[#d4af37]/20">
            <input 
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ask about themes or symbols..."
              className="w-full bg-black/40 border border-[#d4af37]/20 rounded-full px-4 py-2 text-xs focus:outline-none focus:border-[#d4af37] text-white"
            />
          </form>
        </div>
      )}
    </>
  );
};

const AssistantIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
    <path d="M12 8v4l3 3"/>
  </svg>
);

export default AIAssistant;
