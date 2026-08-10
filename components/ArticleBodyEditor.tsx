import React, { useRef, useState } from 'react';
import { ThemeMode } from '../types';
import ArticleContent from './ArticleContent';
import { getLengthStatus } from '../lib/contentLength';

const BODY_MAX = 100000;

interface ArticleBodyEditorProps {
  value: string;
  onChange: (value: string) => void;
  theme: ThemeMode;
}

const ArticleBodyEditor: React.FC<ArticleBodyEditorProps> = ({ value, onChange, theme }) => {
  const isLight = theme !== 'dark';
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);

  const applyWrap = (before: string, after: string, placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const applyLinePrefix = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + prefix.length;
      textarea.setSelectionRange(pos, pos);
    });
  };

  const buttonCls = `px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] border rounded-sm transition-colors ${
    isLight ? 'border-black/15 text-gray-700 hover:bg-black/5' : 'border-white/15 text-gray-300 hover:bg-white/10'
  }`;
  const activeCls = isLight ? 'bg-amber-700 text-white border-amber-700' : 'bg-amber-600 text-white border-amber-600';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button type="button" className={buttonCls} onClick={() => applyWrap('**', '**', 'bold text')}>
          Bold
        </button>
        <button type="button" className={buttonCls} onClick={() => applyWrap('*', '*', 'italic text')}>
          Italic
        </button>
        <button type="button" className={buttonCls} onClick={() => applyLinePrefix('## ')}>
          Heading
        </button>
        <button type="button" className={buttonCls} onClick={() => applyLinePrefix('> ')}>
          Quote
        </button>
        <button type="button" className={buttonCls} onClick={() => applyWrap('[img]', '[/img]', 'https://')}>
          Image
        </button>
        <button type="button" className={buttonCls} onClick={() => applyWrap('[url=https://]', '[/url]', 'link text')}>
          Link
        </button>
        <button type="button" className={buttonCls} onClick={() => applyWrap('[code]', '[/code]', 'code goes here')}>
          Code
        </button>
        <button
          type="button"
          onClick={() => setShowPreview((p) => !p)}
          className={`ml-auto ${buttonCls} ${showPreview ? activeCls : ''}`}
        >
          {showPreview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {showPreview ? (
        <div className={`min-h-[16rem] px-4 py-3 rounded-sm border ${isLight ? 'bg-white border-black/15' : 'bg-[#0f0f0f] border-white/15'}`}>
          {value.trim() ? (
            <ArticleContent body={value} theme={theme} />
          ) : (
            <p className="text-gray-500 text-sm">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          rows={16}
          maxLength={BODY_MAX}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, BODY_MAX))}
          placeholder="Write your article. Leave a blank line between paragraphs. Use ## for a heading, > for a quote."
          className={`w-full px-4 py-3 rounded-sm border text-sm font-['EB_Garamond'] leading-relaxed focus:outline-none focus:border-amber-700 ${
            isLight ? 'bg-white border-black/15 text-gray-900' : 'bg-[#0f0f0f] border-white/15 text-white'
          }`}
        />
      )}
      <p className={`text-xs mt-2 ${getLengthStatus(value.length, BODY_MAX).className}`}>
        {value.length.toLocaleString()}/{BODY_MAX.toLocaleString()} — {getLengthStatus(value.length, BODY_MAX).label}
      </p>
    </div>
  );
};

export default ArticleBodyEditor;
