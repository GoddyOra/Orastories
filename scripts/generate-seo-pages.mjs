// Build-time static-site generation for search-engine/crawler visibility.
//
// The site is a client-rendered SPA + vanilla-JS static pages deployed to
// GitHub Pages, which can't run server code at request time - so crawlers
// that don't execute JS see empty shells (<div id="root"></div>, empty
// #booksGrid/#articlesList). This script runs after `vite build` in the
// `npm run build` chain and bakes real HTML into dist/ for every published
// book and article: a standalone detail page with real meta tags, Open
// Graph tags, and schema.org JSON-LD, plus server-rendered cards injected
// into the dist copies of books.html/blog.html so crawlers have something
// to follow links from in the first place.
//
// Uses the same public anon key a browser would use, so it is bound by the
// exact same RLS rules as a real anonymous visitor (the 3-chapter preview
// cap on books, in particular) - a statically-generated page can never
// contain anything a real signed-out visitor couldn't already see.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const SITE_ORIGIN = 'https://orastories.com';
const BUILD_DATE = new Date().toISOString().slice(0, 10);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('generate-seo-pages: missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY - cannot generate SEO pages.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// This environment's network is known to be intermittently flaky - retry
// transient fetch failures a few times before giving up (see
// scripts/migrate-blog-posts.ts for the same pattern).
async function withRetry(fn, label, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`  (${label} attempt ${i + 1} failed, retrying...)`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw lastError;
}

// Titles/synopses/chapter text/article bodies are creator- and
// user-submitted free text rendered on public pages - unlike the React app
// (which escapes automatically via JSX), this script builds raw HTML
// strings by hand, so every piece of user content must be escaped
// explicitly before interpolation.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function truncate(text, max) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// Article body rendering - a plain-HTML port of components/ArticleContent.tsx
// (same token set: **bold**, *italic*, [url=]...[/url], [img]...[/img],
// [code]...[/code], "## " headings, "> " quotes) so static article pages
// render identically to the interactive ArticleReader.
// ---------------------------------------------------------------------------

function parseInlineHtml(text) {
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|\[url=(\S+?)\](.+?)\[\/url\]/g;
  let result = '';
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) result += escapeHtml(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      result += `<strong>${escapeHtml(match[1])}</strong>`;
    } else if (match[2] !== undefined) {
      result += `<em>${escapeHtml(match[2])}</em>`;
    } else {
      result += `<a href="${escapeHtml(match[3])}" target="_blank" rel="noopener noreferrer" class="underline hover:no-underline">${escapeHtml(match[4])}</a>`;
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) result += escapeHtml(text.slice(lastIndex));
  return result;
}

const IMG_TOKEN = /^\[img\](\S+)\[\/img\]$/;
const CODE_TOKEN = /^\[code\]([\s\S]*)\[\/code\]$/;

function splitBlocks(body) {
  const blocks = [];
  const codeRegionRegex = /\[code\][\s\S]*?\[\/code\]/g;
  let lastIndex = 0;
  let match;
  const pushPlain = (segment) => {
    segment.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).forEach((b) => blocks.push(b));
  };
  while ((match = codeRegionRegex.exec(body)) !== null) {
    pushPlain(body.slice(lastIndex, match.index));
    blocks.push(match[0]);
    lastIndex = codeRegionRegex.lastIndex;
  }
  pushPlain(body.slice(lastIndex));
  return blocks;
}

function renderArticleBodyHtml(body) {
  return splitBlocks(body)
    .map((block) => {
      const imgMatch = block.match(IMG_TOKEN);
      const codeMatch = block.match(CODE_TOKEN);

      if (codeMatch) {
        return `<pre class="overflow-x-auto rounded-sm p-4 my-6 text-sm font-mono bg-black/5 dark:bg-white/10"><code>${escapeHtml(codeMatch[1])}</code></pre>`;
      }
      if (imgMatch) {
        return `<img src="${escapeHtml(imgMatch[1])}" alt="" loading="lazy" class="w-full rounded-sm border border-black/10 dark:border-white/10 my-6">`;
      }
      if (block.startsWith('## ')) {
        return `<h2 class="font-['Playfair_Display'] font-bold text-2xl md:text-3xl mt-10 mb-4">${parseInlineHtml(block.slice(3))}</h2>`;
      }
      if (block.startsWith('> ')) {
        const quoteText = block.split('\n').map((line) => line.replace(/^>\s?/, '')).join(' ');
        return `<blockquote class="border-l-4 pl-4 italic my-6 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400">${parseInlineHtml(quoteText)}</blockquote>`;
      }
      return `<p class="mb-5">${parseInlineHtml(block)}</p>`;
    })
    .join('\n');
}

function bodyToPlainText(body) {
  return String(body ?? '')
    .replace(/\[code\][\s\S]*?\[\/code\]/g, ' ')
    .replace(/\[img\]\S+\[\/img\]/g, ' ')
    .replace(/\[url=\S+?\](.+?)\[\/url\]/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^##?\s*/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Shared page shell - mirrors the head/nav/footer chrome already used by
// books.html/blog.html so the generated pages match the rest of the site,
// with unique meta description, canonical, Open Graph, and JSON-LD per page.
// ---------------------------------------------------------------------------

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Montserrat:wght@300;400;600&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap";

function pageShell({ title, description, canonicalPath, ogType, ogImage, jsonLd, bodyHtml }) {
  const canonicalUrl = `${SITE_ORIGIN}${canonicalPath}`;
  const escTitle = escapeHtml(title);
  const escDescription = escapeHtml(description);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escTitle}</title>
  <meta name="description" content="${escDescription}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:title" content="${escTitle}">
  <meta property="og:description" content="${escDescription}">
  <meta property="og:url" content="${canonicalUrl}">
  ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : ''}
  <meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${escTitle}">
  <meta name="twitter:description" content="${escDescription}">
  ${ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}">` : ''}
  <script type="application/ld+json">${safeJsonLd(jsonLd)}</script>
  <link rel="icon" type="image/svg+xml" href="images/logos/orastories-logo-option-2.svg">
  <link rel="stylesheet" href="styles/tailwind.generated.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="${FONT_HREF}">
  <link href="${FONT_HREF}" rel="stylesheet" media="print" onload="this.media='all'">
  <noscript><link href="${FONT_HREF}" rel="stylesheet"></noscript>
  <style>
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: #fcfaf7; }
    ::-webkit-scrollbar-thumb { background: #d1d1d1; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #b1b1b1; }
    body { overflow-x: hidden; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    .dark-mode ::-webkit-scrollbar-track { background: #0f0f0f; }
  </style>
</head>
<body id="seoPageBody" class="bg-[#fcfaf7] text-[#1a1a1a] font-['Montserrat'] transition-colors duration-500">
  <nav class="fixed top-0 left-0 right-0 bg-white/95 dark:bg-black/95 backdrop-blur z-50 border-b border-gray-200 dark:border-white/10 transition-colors duration-500">
    <div class="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-3 md:py-4 flex flex-wrap justify-between items-center gap-3">
      <a href="/" class="inline-flex items-center transition-opacity hover:opacity-90" aria-label="Orastories Home">
        <img src="images/logos/orastories-logo-option-2.svg" alt="Orastories" class="h-10 w-auto" />
      </a>
      <div class="flex flex-wrap justify-end gap-3 sm:gap-5 md:gap-8 items-center text-sm sm:text-base">
        <a href="/" class="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Home</a>
        <a href="/books" class="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Books</a>
        <a href="/reviews" class="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Reviews</a>
        <a href="/blog" class="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Blog</a>
        <a href="/contact" class="hover:text-amber-700 dark:hover:text-amber-400 transition-colors">Contact</a>
        <button id="themeToggle" class="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors" aria-label="Toggle Theme">
          <svg id="sunIcon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <svg id="moonIcon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
      </div>
    </div>
  </nav>

  <main class="pt-24 max-w-4xl mx-auto px-3 sm:px-4 md:px-6 py-12 md:py-16">
${bodyHtml}
  </main>

  <footer class="border-t border-gray-200 dark:border-white/10 mt-16 py-8 text-center text-gray-600 dark:text-gray-400 transition-colors duration-500">
    <p>&copy; 2026 Orastories. All rights reserved.</p>
  </footer>

  <script>
    const seoPageBody = document.getElementById('seoPageBody');
    const themeToggle = document.getElementById('themeToggle');
    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');

    const applyTheme = (isDark) => {
      if (isDark) {
        seoPageBody.classList.add('dark-mode');
        seoPageBody.style.backgroundColor = '#0f0f0f';
        seoPageBody.style.color = '#e0e0e0';
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
      } else {
        seoPageBody.classList.remove('dark-mode');
        seoPageBody.style.backgroundColor = '#fcfaf7';
        seoPageBody.style.color = '#1a1a1a';
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
      }
    };
    applyTheme(localStorage.getItem('darkMode') === 'true');
    themeToggle.addEventListener('click', () => {
      const isDark = !seoPageBody.classList.contains('dark-mode');
      localStorage.setItem('darkMode', String(isDark));
      applyTheme(isDark);
    });
  </script>
  <script type="module" src="scripts/navigation.js"></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Book detail pages
// ---------------------------------------------------------------------------

function buildBookJsonLd(book, canonicalUrl) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    author: { '@type': 'Person', name: book.author },
    description: book.synopsis || undefined,
    genre: book.genre || undefined,
    image: book.cover || undefined,
    url: canonicalUrl
  };
  if (book.price_cents != null) {
    jsonLd.offers = {
      '@type': 'Offer',
      price: (book.price_cents / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock'
    };
  }
  return jsonLd;
}

function buildBookBodyHtml(book, chapters) {
  const chaptersHtml = chapters.length
    ? chapters
        .map(
          (c) => `    <div class="mb-10">
      <h2 class="text-2xl font-['Playfair_Display'] font-bold mb-4">${escapeHtml(c.title)}</h2>
      <div class="font-['EB_Garamond'] text-lg leading-8 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">${escapeHtml(c.content)}</div>
    </div>`
        )
        .join('\n')
    : '    <p class="text-sm text-gray-500 dark:text-gray-400">No preview available for this book yet.</p>';

  return `  <article>
    <div class="flex flex-col sm:flex-row gap-8 mb-12">
      <div class="w-full sm:w-64 shrink-0">
        <img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)} cover" class="w-full aspect-[2/3] object-cover rounded-lg shadow-md" width="400" height="600">
      </div>
      <div class="flex-1">
        <h1 class="text-4xl font-['Playfair_Display'] font-bold mb-2 dark:text-white">${escapeHtml(book.title)}</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-2">${escapeHtml(book.author)}${book.published_date ? ' • ' + escapeHtml(book.published_date) : ''}</p>
        ${book.genre ? `<p class="text-[11px] uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400 mb-4">${escapeHtml(book.genre)}</p>` : ''}
        <p class="text-gray-700 dark:text-gray-300 leading-relaxed mb-6">${escapeHtml(book.synopsis)}</p>
        <a href="/?book=${encodeURIComponent(book.id)}" class="inline-block px-6 py-3 border border-amber-700 dark:border-amber-400 text-amber-700 dark:text-amber-400 rounded hover:bg-amber-700 hover:text-white dark:hover:bg-amber-400 dark:hover:text-black transition-all text-xs uppercase tracking-[0.2em] font-semibold">Continue Reading &mdash; Free Sign Up</a>
      </div>
    </div>

    <div class="border-t border-gray-200 dark:border-white/10 pt-10">
      <p class="text-[10px] uppercase tracking-[0.3em] text-amber-700 dark:text-amber-400 mb-6">Free Preview &mdash; First 3 Chapters</p>
${chaptersHtml}
    </div>
  </article>`;
}

function buildHomeBodyHtml(books) {
  const cardsHtml = books.length
    ? books.map(buildBookCardHtml).join('\n')
    : '  <p class="col-span-full text-center text-sm text-gray-500">No books available yet.</p>';

  return `<div id="ssgHomeContent" class="min-h-screen py-16 sm:py-20 md:py-24 px-4 sm:px-6 md:px-12">
    <header class="max-w-5xl mx-auto mb-14 sm:mb-16 md:mb-24 text-center">
      <h1 class="text-5xl sm:text-6xl md:text-8xl font-['Playfair_Display'] mb-4 sm:mb-6 tracking-tight text-gray-900 dark:text-[#d4af37]">Orastories</h1>
      <p class="text-[10px] sm:text-xs uppercase tracking-[0.35em] sm:tracking-[0.6em] font-semibold mb-8 sm:mb-10 text-gray-500">A Community of Storytellers</p>
      <p class="max-w-xl mx-auto text-sm text-gray-600 dark:text-gray-400 leading-relaxed">Novels and nonfiction from a growing community of independent authors. Read the first 3 chapters of any book free, then claim or purchase to keep reading.</p>
    </header>
    <div class="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 items-stretch">
${cardsHtml}
    </div>
  </div>`;
}

function buildBookCardHtml(book) {
  const priceLabel = book.price_cents === 0 ? 'Read Free' : book.price_cents != null ? `View Book — $${(book.price_cents / 100).toFixed(2)}` : 'View Book';
  return `  <article class="h-full flex flex-col border border-gray-200 dark:border-white/10 rounded-lg p-6 bg-white dark:bg-gray-900">
    <a href="/book-${encodeURIComponent(book.id)}" class="flex flex-col h-full">
      <div class="aspect-[2/3] overflow-hidden rounded mb-4 bg-gray-100 dark:bg-gray-800">
        <img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)} cover" class="w-full h-full object-cover" loading="lazy" width="400" height="600">
      </div>
      <h3 class="text-2xl font-bold mb-1 dark:text-white" style="font-family:'Playfair Display',serif;">${escapeHtml(book.title)}</h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">${escapeHtml(book.author)}${book.published_date ? ' • ' + escapeHtml(book.published_date) : ''}</p>
      ${book.genre ? `<p class="text-[11px] uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400 mb-3">${escapeHtml(book.genre)}</p>` : ''}
      <p class="text-gray-700 dark:text-gray-300 mb-6 leading-relaxed text-sm flex-1">${escapeHtml(book.synopsis)}</p>
      <span class="mt-auto w-full py-2 border border-amber-700 dark:border-amber-400 text-amber-700 dark:text-amber-400 rounded text-xs uppercase tracking-[0.2em] font-semibold text-center block">${priceLabel}</span>
    </a>
  </article>`;
}

// ---------------------------------------------------------------------------
// Article detail pages
// ---------------------------------------------------------------------------

function authorNameFor(article) {
  const profile = Array.isArray(article.profiles) ? article.profiles[0] : article.profiles;
  return (profile && (profile.display_name || profile.username)) || 'A Reader';
}

function buildArticleJsonLd(article, canonicalUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    author: { '@type': 'Person', name: authorNameFor(article) },
    datePublished: article.created_at || undefined,
    image: article.cover_image_url || undefined,
    description: truncate(bodyToPlainText(article.body), 200),
    url: canonicalUrl
  };
}

function buildArticleBodyHtml(article) {
  return `  <article>
    ${
      article.cover_image_url
        ? `<div class="aspect-[16/9] overflow-hidden rounded-sm mb-8"><img src="${escapeHtml(article.cover_image_url)}" alt="${escapeHtml(article.cover_image_alt || article.title)}" class="w-full h-full object-cover"></div>`
        : ''
    }
    <h1 class="text-3xl md:text-4xl font-['Playfair_Display'] font-bold mb-3 dark:text-white">${escapeHtml(article.title)}</h1>
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-10">By ${escapeHtml(authorNameFor(article))} &middot; <a href="/?article=${encodeURIComponent(article.slug)}" class="underline hover:no-underline">Read &amp; discuss on Orastories</a></p>
    <div class="font-['EB_Garamond'] text-lg leading-8 text-gray-800 dark:text-gray-200">
${renderArticleBodyHtml(article.body)}
    </div>
  </article>`;
}

function buildArticleCardHtml(article) {
  return `  <article class="rounded-sm border overflow-hidden bg-white dark:bg-[#161616] border-black/10 dark:border-white/10">
    <a href="/article-${encodeURIComponent(article.slug)}" class="block">
      ${
        article.cover_image_url
          ? `<div class="aspect-[16/9] overflow-hidden"><img src="${escapeHtml(article.cover_image_url)}" alt="${escapeHtml(article.cover_image_alt || article.title)}" loading="lazy" class="w-full h-full object-cover"></div>`
          : ''
      }
      <div class="p-5">
        <h2 class="text-xl font-['Playfair_Display'] font-bold mb-2 dark:text-white">${escapeHtml(article.title)}</h2>
      </div>
    </a>
    <p class="px-5 pb-5 text-xs text-gray-500 dark:text-gray-400">By ${escapeHtml(authorNameFor(article))}</p>
  </article>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function fetchBooks() {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('books')
      .select('id,title,author,cover,genre,synopsis,published_date,price_cents,created_at,profiles(username)')
      .eq('is_published', true)
      .not('price_cents', 'is', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }, 'fetch books');
}

// Matches the shape lib/books.ts's fetchBookCatalog() builds client-side
// (minus loadBook, which isn't serializable) - Library.tsx reconstructs it
// with loadBookById(id) when it reads this back out of index.html.
function toEmbeddedCatalogEntry(book) {
  const profile = Array.isArray(book.profiles) ? book.profiles[0] : book.profiles;
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    cover: book.cover || '',
    genre: book.genre || '',
    synopsis: book.synopsis || '',
    publishedDate: book.published_date || '',
    creatorUsername: profile?.username ?? null
  };
}

async function fetchPreviewChapters(bookId) {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('chapters')
      .select('title,content,position')
      .eq('book_id', bookId)
      .lt('position', 3)
      .order('position', { ascending: true });
    if (error) throw error;
    return data || [];
  }, `fetch chapters for ${bookId}`);
}

async function fetchArticles() {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('articles')
      .select('id,slug,title,body,cover_image_url,cover_image_alt,created_at,profiles(username,display_name,role)')
      .eq('is_published', true);
    if (error) throw error;
    return data || [];
  }, 'fetch articles');
}

async function injectGrid(fileName, placeholder, cardsHtml) {
  const filePath = path.join(distDir, fileName);
  const html = await readFile(filePath, 'utf8');
  if (!html.includes(placeholder)) {
    throw new Error(`generate-seo-pages: could not find the expected placeholder markup in dist/${fileName} - the source page structure may have changed.`);
  }
  const replacement = placeholder.replace('></div>', `>\n${cardsHtml}\n  </div>`);
  await writeFile(filePath, html.replace(placeholder, replacement), 'utf8');
}

async function main() {
  console.log('generate-seo-pages: fetching published catalog...');
  const [books, articles] = await Promise.all([fetchBooks(), fetchArticles()]);
  console.log(`  ${books.length} published book(s), ${articles.length} published article(s)`);

  await Promise.all(
    books.map(async (book) => {
      const chapters = await fetchPreviewChapters(book.id);
      const canonicalPath = `/book-${book.id}`;
      const html = pageShell({
        title: `${book.title} | Orastories`,
        description: truncate(book.synopsis, 155),
        canonicalPath,
        ogType: 'book',
        ogImage: book.cover || null,
        jsonLd: buildBookJsonLd(book, `${SITE_ORIGIN}${canonicalPath}`),
        bodyHtml: buildBookBodyHtml(book, chapters)
      });
      await writeFile(path.join(distDir, `book-${book.id}.html`), html, 'utf8');
    })
  );
  console.log(`  wrote ${books.length} book detail page(s)`);

  await Promise.all(
    articles.map(async (article) => {
      const canonicalPath = `/article-${article.slug}`;
      const html = pageShell({
        title: `${article.title} | Orastories`,
        description: truncate(bodyToPlainText(article.body), 155),
        canonicalPath,
        ogType: 'article',
        ogImage: article.cover_image_url || null,
        jsonLd: buildArticleJsonLd(article, `${SITE_ORIGIN}${canonicalPath}`),
        bodyHtml: buildArticleBodyHtml(article)
      });
      await writeFile(path.join(distDir, `article-${article.slug}.html`), html, 'utf8');
    })
  );
  console.log(`  wrote ${articles.length} article detail page(s)`);

  await injectGrid(
    'books.html',
    '<div id="booksGrid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 items-stretch"></div>',
    books.map(buildBookCardHtml).join('\n')
  );
  console.log('  injected server-rendered cards into dist/books.html');

  const articlesPlaceholder =
    '<div id="articlesList" class="grid grid-cols-1 sm:grid-cols-2 gap-8">\n      <p class="col-span-full text-center text-sm uppercase tracking-[0.3em] text-gray-400 dark:text-gray-600">Loading articles...</p>\n    </div>';
  const articlesFilePath = path.join(distDir, 'blog.html');
  const blogHtml = await readFile(articlesFilePath, 'utf8');
  if (!blogHtml.includes(articlesPlaceholder)) {
    throw new Error('generate-seo-pages: could not find the expected placeholder markup in dist/blog.html - the source page structure may have changed.');
  }
  const articlesReplacement = `<div id="articlesList" class="grid grid-cols-1 sm:grid-cols-2 gap-8">\n${articles.map(buildArticleCardHtml).join('\n')}\n    </div>`;
  await writeFile(articlesFilePath, blogHtml.replace(articlesPlaceholder, articlesReplacement), 'utf8');
  console.log('  injected server-rendered cards into dist/blog.html');

  const homeRootPlaceholder = '<div id="root"></div>';
  const indexFilePath = path.join(distDir, 'index.html');
  const indexHtml = await readFile(indexFilePath, 'utf8');
  if (!indexHtml.includes(homeRootPlaceholder)) {
    throw new Error('generate-seo-pages: could not find the expected #root placeholder in dist/index.html - the source page structure may have changed.');
  }
  const embeddedCatalog = books.map(toEmbeddedCatalogEntry);
  const homeReplacement = `<div id="root">${buildHomeBodyHtml(books)}</div>
  <script type="application/json" id="ssg-books-data">${safeJsonLd(embeddedCatalog)}</script>`;
  await writeFile(indexFilePath, indexHtml.replace(homeRootPlaceholder, homeReplacement), 'utf8');
  console.log('  pre-rendered dist/index.html homepage + embedded catalog JSON for hydration');

  const urls = [
    { loc: '/', lastmod: BUILD_DATE },
    { loc: '/books', lastmod: BUILD_DATE },
    { loc: '/blog', lastmod: BUILD_DATE },
    { loc: '/reviews', lastmod: BUILD_DATE },
    { loc: '/contact', lastmod: BUILD_DATE },
    ...books.map((b) => ({ loc: `/book-${b.id}`, lastmod: (b.created_at || BUILD_DATE).slice(0, 10) })),
    ...articles.map((a) => ({ loc: `/article-${a.slug}`, lastmod: (a.created_at || BUILD_DATE).slice(0, 10) }))
  ];
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${SITE_ORIGIN}${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`).join('\n')}
</urlset>
`;
  await writeFile(path.join(distDir, 'sitemap.xml'), sitemapXml, 'utf8');

  const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
  await writeFile(path.join(distDir, 'robots.txt'), robotsTxt, 'utf8');
  console.log('  wrote sitemap.xml and robots.txt');
}

main().catch((error) => {
  console.error('generate-seo-pages failed:', error);
  process.exit(1);
});
