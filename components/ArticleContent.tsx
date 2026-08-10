import React from 'react';
import { ThemeMode } from '../types';

interface ArticleContentProps {
  body: string;
  theme: ThemeMode;
}

// A small, closed set of tokens parsed directly into React elements - never
// raw HTML, never dangerouslySetInnerHTML. Article bodies are the most
// exposed free-text surface in the app (any signed-up user, rendered to
// every visitor), so this is deliberately not a general markdown/HTML
// renderer.
function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|\[url=(\S+?)\](.+?)\[\/url\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b-${i++}`}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-i-${i++}`}>{match[2]}</em>);
    } else {
      nodes.push(
        <a key={`${keyPrefix}-l-${i++}`} href={match[3]} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
          {match[4]}
        </a>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

const IMG_TOKEN = /^\[img\](\S+)\[\/img\]$/;
const CODE_TOKEN = /^\[code\]([\s\S]*)\[\/code\]$/;

// [code]...[/code] can legitimately contain blank lines internally (e.g. a
// terminal transcript) - splitting the whole body on blank lines in one
// pass would shatter the token pair across two fragments and shift every
// later block boundary too. Code regions are extracted first as atomic
// blocks; blank-line paragraph splitting only applies to the text around
// them.
function splitBlocks(body: string): string[] {
  const blocks: string[] = [];
  const codeRegionRegex = /\[code\][\s\S]*?\[\/code\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushPlain = (segment: string) => {
    segment
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean)
      .forEach((b) => blocks.push(b));
  };

  while ((match = codeRegionRegex.exec(body)) !== null) {
    pushPlain(body.slice(lastIndex, match.index));
    blocks.push(match[0]);
    lastIndex = codeRegionRegex.lastIndex;
  }
  pushPlain(body.slice(lastIndex));

  return blocks;
}

const ArticleContent: React.FC<ArticleContentProps> = ({ body, theme }) => {
  const isLight = theme !== 'dark';
  const textColor = isLight ? 'text-gray-800' : 'text-gray-200';
  const headingColor = isLight ? 'text-gray-900' : 'text-white';
  const quoteBorder = isLight ? 'border-gray-300 text-gray-600' : 'border-gray-700 text-gray-400';

  const blocks = splitBlocks(body);

  return (
    <div className={`font-['EB_Garamond'] text-lg leading-8 ${textColor}`}>
      {blocks.map((block, idx) => {
        const key = `block-${idx}`;
        const imgMatch = block.match(IMG_TOKEN);
        const codeMatch = block.match(CODE_TOKEN);

        if (codeMatch) {
          return (
            <pre
              key={key}
              className={`overflow-x-auto rounded-sm p-4 my-6 text-sm font-mono ${isLight ? 'bg-black/5' : 'bg-white/10'}`}
            >
              <code>{codeMatch[1]}</code>
            </pre>
          );
        }

        if (imgMatch) {
          return (
            <img
              key={key}
              src={imgMatch[1]}
              alt=""
              loading="lazy"
              className="w-full rounded-sm border border-black/10 dark:border-white/10 my-6"
            />
          );
        }

        if (block.startsWith('## ')) {
          return (
            <h2 key={key} className={`font-['Playfair_Display'] font-bold text-2xl md:text-3xl mt-10 mb-4 ${headingColor}`}>
              {parseInline(block.slice(3), key)}
            </h2>
          );
        }

        if (block.startsWith('> ')) {
          const quoteText = block
            .split('\n')
            .map((line) => line.replace(/^>\s?/, ''))
            .join(' ');
          return (
            <blockquote key={key} className={`border-l-4 pl-4 italic my-6 ${quoteBorder}`}>
              {parseInline(quoteText, key)}
            </blockquote>
          );
        }

        return (
          <p key={key} className="mb-5">
            {parseInline(block, key)}
          </p>
        );
      })}
    </div>
  );
};

export default ArticleContent;
