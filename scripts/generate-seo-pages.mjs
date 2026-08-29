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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

function capitalize(text) {
  return text.length ? text[0].toUpperCase() + text.slice(1) : text;
}

// ---------------------------------------------------------------------------
// Genre -> natural search-phrase matching for book descriptions ("free
// [phrase], read online"). Two tiers so this stays useful for genres that
// don't exist yet:
//   1. GENRE_PHRASE_EXACT - hand-tuned phrasing for exact genre strings
//      already seen in the catalog (best quality).
//   2. GENRE_TOKEN_PHRASES - per-word fallback used when a new book's genre
//      string doesn't match anything above: split on "/" and ",", map what's
//      recognized, keep the rest as-is. Never produces empty output.
// ---------------------------------------------------------------------------

const GENRE_PHRASE_EXACT = {
  'contemporary romance': 'contemporary romance novel',
  'self-help / psychology': 'self-help and psychology book',
  'contemporary romance / legal thriller': 'romantic legal thriller',
  'christian romance / new adult': 'christian romance novel',
  'legal thriller, mystery, crime thriller': 'legal thriller and crime mystery',
  'contemporary romance / workplace romance': 'workplace romance novel',
  'legal thriller': 'legal thriller',
  'true crime': 'true crime story',
  'nonfiction / reference': 'nonfiction reference book',
  'nonfiction / sports trivia': 'sports trivia book',
  "children's nonfiction": "kids' nonfiction book"
};

const GENRE_TOKEN_PHRASES = {
  'contemporary romance': 'contemporary romance',
  'legal thriller': 'legal thriller',
  'crime thriller': 'crime thriller',
  mystery: 'mystery',
  'true crime': 'true crime',
  'self-help': 'self-help',
  psychology: 'psychology',
  'christian romance': 'christian romance',
  'new adult': 'new adult',
  'workplace romance': 'workplace romance',
  nonfiction: 'nonfiction',
  reference: 'reference',
  'sports trivia': 'sports trivia',
  "children's nonfiction": "kids' nonfiction",
  fantasy: 'fantasy',
  'science fiction': 'science fiction',
  horror: 'horror',
  'historical romance': 'historical romance',
  'young adult': 'young adult',
  poetry: 'poetry',
  memoir: 'memoir',
  biography: 'biography'
};

function buildBreadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url
    }))
  };
}

function buildBreadcrumbHtml(items) {
  return `  <nav aria-label="Breadcrumb" class="mb-6 text-xs text-gray-500 dark:text-gray-400">
    ${items
      .map((item, i) =>
        i === items.length - 1
          ? `<span aria-current="page">${escapeHtml(item.name)}</span>`
          : `<a href="${escapeHtml(item.url.replace(SITE_ORIGIN, ''))}" class="hover:text-amber-700 dark:hover:text-amber-400 hover:underline">${escapeHtml(item.name)}</a> <span class="mx-1">/</span> `
      )
      .join('')}
  </nav>`;
}

function genreTokens(genre) {
  if (!genre) return [];
  return genre
    .split(/[/,]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function genreSearchPhrase(genre) {
  if (!genre) return 'book';
  const key = genre.trim().toLowerCase();
  if (GENRE_PHRASE_EXACT[key]) return GENRE_PHRASE_EXACT[key];

  const tokens = genre
    .split(/[/,]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const phrases = [...new Set(tokens.slice(0, 2).map((t) => GENRE_TOKEN_PHRASES[t] || t))];
  return phrases.length ? `${phrases.join(' and ')} book` : 'book';
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

function pageShell({ title, description, canonicalPath, ogType, ogImage, keywords, jsonLd, bodyHtml }) {
  const canonicalUrl = `${SITE_ORIGIN}${canonicalPath}`;
  const escTitle = escapeHtml(title);
  const escDescription = escapeHtml(description);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-76ZXK09PF3"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-76ZXK09PF3');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escTitle}</title>
  <meta name="description" content="${escDescription}">
  ${keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : ''}
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
  ${(Array.isArray(jsonLd) ? jsonLd : [jsonLd])
    .filter(Boolean)
    .map((block) => `<script type="application/ld+json">${safeJsonLd(block)}</script>`)
    .join('\n  ')}
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
        <img id="siteLogo" src="images/logos/orastories-logo-option-2.svg" alt="Orastories" class="h-10 w-auto" width="138" height="40" />
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
    const siteLogo = document.getElementById('siteLogo');

    const applyTheme = (isDark) => {
      // A flat <img> logo can't inherit dark-mode CSS from this page, so
      // the near-black strokes/text baked into the light-mode file just
      // vanish against a dark nav - swap to a pre-built dark variant instead.
      siteLogo.src = isDark ? 'images/logos/orastories-logo-option-2-dark.svg' : 'images/logos/orastories-logo-option-2.svg';
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
// Legacy URL redirect shim - book/article detail pages used to live at
// /book-{id} and /article-{slug}. Phase N moved them to bare root-level
// slugs (/{id}, /{slug}) so they share one flat, indexable namespace with
// creator profiles (/{username}). Anything already indexed or shared under
// the old prefixed path still needs to resolve, so that path keeps getting
// written - just as a redirect to the new canonical one instead of 404ing.
// ---------------------------------------------------------------------------

// canonicalPath defaults to the redirect target itself (the legacy /book-*
// and /article-* shims - the redirect destination IS the real canonical
// page). The /books/{slug} purchase-shortcut shim is the one case where
// these differ: it redirects to a URL fragment on the books listing page,
// but its canonical still needs to point at the book's own real detail
// page, not at that fragment, so it isn't treated as separate content.
function redirectShellHtml(toPath, canonicalPath = toPath) {
  const canonicalUrl = `${SITE_ORIGIN}${canonicalPath}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="robots" content="noindex">
  <link rel="canonical" href="${canonicalUrl}">
  <meta http-equiv="refresh" content="0;url=${toPath}">
  <title>Redirecting…</title>
</head>
<body>
  <p>This page has moved. <a href="${toPath}">Continue to ${SITE_ORIGIN}${toPath}</a>.</p>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Book detail pages
// ---------------------------------------------------------------------------

// Every book on Orastories is currently free (price_cents: 0) - when that's
// true, lead the search snippet with it explicitly rather than relying on
// searchers to infer it, since "free [genre] books/novels" is real, matched
// search intent this site can honestly claim.
function bookMetaDescription(book) {
  const phrase = genreSearchPhrase(book.genre);
  const prefix =
    book.price_cents === 0 ? `Free ${phrase}, read online — ` : `${capitalize(phrase)} — `;
  return prefix + truncate(book.synopsis, 155 - prefix.length);
}

function reviewerNameFor(review) {
  const profile = Array.isArray(review.profiles) ? review.profiles[0] : review.profiles;
  return (profile && (profile.display_name || profile.username)) || 'A Reader';
}

function buildBookJsonLd(book, canonicalUrl, reviews = []) {
  const isFree = book.price_cents === 0;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    author: { '@type': 'Person', name: book.author },
    description: book.synopsis || undefined,
    genre: book.genre || undefined,
    image: book.cover || undefined,
    url: canonicalUrl,
    // Real schema.org property Google's structured-data pipeline recognizes
    // for surfacing "free to access" content - only ever true when the book
    // actually is (price_cents === 0), never asserted for paid titles.
    isAccessibleForFree: isFree || undefined
  };
  if (book.price_cents != null) {
    jsonLd.offers = {
      '@type': 'Offer',
      price: (book.price_cents / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock'
    };
  }
  // Google's own guidelines require review/rating markup to reflect reviews
  // that are genuinely visible on the page (see the ratings block in
  // buildBookBodyHtml below) - so this only ever appears for books that
  // actually have at least one real reader review, never a fabricated or
  // placeholder rating, and grows automatically as real reviews come in.
  if (reviews.length) {
    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: avg.toFixed(1),
      reviewCount: reviews.length,
      bestRating: 5,
      worstRating: 1
    };
    jsonLd.review = reviews.slice(0, 10).map((r) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: reviewerNameFor(r) },
      datePublished: r.created_at ? r.created_at.slice(0, 10) : undefined,
      reviewBody: r.body || undefined,
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 }
    }));
  }
  return jsonLd;
}

function buildReviewsHtml(reviews) {
  if (!reviews.length) return '';
  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  return `
    <div class="border-t border-gray-200 dark:border-white/10 mt-12 pt-10">
      <h2 class="text-xl font-['Playfair_Display'] font-bold mb-1 dark:text-white">Reader Reviews</h2>
      <p class="text-amber-700 dark:text-amber-400 mb-6" aria-label="${avg.toFixed(1)} out of 5 stars, ${reviews.length} review${reviews.length === 1 ? '' : 's'}">
        <span aria-hidden="true">${stars(Math.round(avg))}</span>
        <span class="text-sm text-gray-600 dark:text-gray-400">${avg.toFixed(1)} out of 5 &middot; ${reviews.length} review${reviews.length === 1 ? '' : 's'}</span>
      </p>
      <div class="space-y-6">
        ${reviews
          .slice(0, 10)
          .map(
            (r) => `<div>
          <p class="text-amber-700 dark:text-amber-400 text-sm" aria-hidden="true">${stars(r.rating)}</p>
          ${r.body ? `<p class="text-gray-700 dark:text-gray-300 text-sm mt-1">${escapeHtml(r.body)}</p>` : ''}
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${escapeHtml(reviewerNameFor(r))}</p>
        </div>`
          )
          .join('\n        ')}
      </div>
    </div>`;
}

function pickRelated(items, current, { sameField, tokenField, limit = 3 } = {}) {
  const rest = items.filter((i) => i !== current);
  const bySame = sameField ? rest.filter((i) => sameField(i) === sameField(current)) : [];
  const currentTokens = tokenField ? new Set(tokenField(current)) : new Set();
  const byToken = tokenField
    ? rest.filter((i) => !bySame.includes(i) && tokenField(i).some((t) => currentTokens.has(t)))
    : [];
  const remainder = rest.filter((i) => !bySame.includes(i) && !byToken.includes(i));
  return [...bySame, ...byToken, ...remainder].slice(0, limit);
}

function buildRelatedBooksHtml(book, allBooks) {
  const related = pickRelated(allBooks, book, {
    sameField: (b) => {
      const p = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles;
      return p?.username;
    },
    tokenField: (b) => genreTokens(b.genre)
  });
  if (!related.length) return '';
  return `
    <div class="border-t border-gray-200 dark:border-white/10 mt-12 pt-10">
      <h2 class="text-xl font-['Playfair_Display'] font-bold mb-6 dark:text-white">More Free Books to Read</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
${related.map(buildBookCardHtml).join('\n')}
      </div>
    </div>`;
}

function buildBookBodyHtml(book, chapters, allBooks = [], reviews = []) {
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
    ${buildBreadcrumbHtml([
      { name: 'Home', url: `${SITE_ORIGIN}/` },
      { name: 'Books', url: `${SITE_ORIGIN}/books` },
      { name: book.title, url: `${SITE_ORIGIN}/${book.id}` }
    ])}
    <div class="flex flex-col sm:flex-row gap-8 mb-12">
      <div class="w-full sm:w-64 shrink-0">
        <img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)} cover" class="w-full aspect-[2/3] object-cover rounded-lg shadow-md" width="400" height="600">
      </div>
      <div class="flex-1">
        <h1 class="text-4xl font-['Playfair_Display'] font-bold mb-2 dark:text-white">${escapeHtml(book.title)}</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-2">${escapeHtml(book.author)}${book.published_date ? ' • ' + escapeHtml(book.published_date) : ''}</p>
        ${book.genre ? `<p class="text-[11px] uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400 mb-4">${escapeHtml(book.genre)}</p>` : ''}
        ${book.price_cents === 0 ? `<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">Free ${genreSearchPhrase(book.genre)}, read online — no download, no app, no cost. Works on any phone, tablet, or computer right in your browser.</p>` : ''}
        <p class="text-gray-700 dark:text-gray-300 leading-relaxed mb-6">${escapeHtml(book.synopsis)}</p>
        <a href="/?book=${encodeURIComponent(book.id)}" class="inline-block px-6 py-3 border border-amber-700 dark:border-amber-400 text-amber-700 dark:text-amber-400 rounded hover:bg-amber-700 hover:text-white dark:hover:bg-amber-400 dark:hover:text-black transition-all text-xs uppercase tracking-[0.2em] font-semibold">Continue Reading &mdash; Free Sign Up</a>
      </div>
    </div>

    <div class="border-t border-gray-200 dark:border-white/10 pt-10">
      <p class="text-[10px] uppercase tracking-[0.3em] text-amber-700 dark:text-amber-400 mb-6">Free Preview &mdash; First 3 Chapters</p>
${chaptersHtml}
    </div>
    ${buildReviewsHtml(reviews)}
    ${buildRelatedBooksHtml(book, allBooks)}
  </article>`;
}

function buildHomeBodyHtml(books) {
  const cardsHtml = books.length
    ? books.map(buildBookCardHtml).join('\n')
    : '  <p class="col-span-full text-center text-sm text-gray-500">No books available yet.</p>';

  return `<div id="ssgHomeContent" class="min-h-screen py-16 sm:py-20 md:py-24 px-4 sm:px-6 md:px-12">
    <header class="max-w-5xl mx-auto mb-14 sm:mb-16 md:mb-24 text-center">
      <h1 class="text-5xl sm:text-6xl md:text-8xl font-['Playfair_Display'] mb-4 sm:mb-6 tracking-tight min-h-[48px] sm:min-h-[60px] md:min-h-[96px] text-gray-900 dark:text-[#d4af37]">Orastories</h1>
      <p class="text-[10px] sm:text-xs uppercase tracking-[0.35em] sm:tracking-[0.6em] font-semibold mb-8 sm:mb-10 text-gray-500">A Community of Storytellers</p>
      <p class="max-w-xl mx-auto text-sm text-gray-600 dark:text-gray-400 leading-relaxed">Free romance, thriller, and nonfiction novels from independent authors — read online, no downloads or apps required. Preview any book's first 3 chapters instantly, then claim it free to keep reading on any phone, tablet, or computer.</p>
    </header>
    <div class="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 items-stretch">
${cardsHtml}
    </div>
  </div>`;
}

function buildBookCardHtml(book) {
  const priceLabel = book.price_cents === 0 ? 'Read Free' : book.price_cents != null ? `View Book — $${(book.price_cents / 100).toFixed(2)}` : 'View Book';
  return `  <article class="h-full flex flex-col border border-gray-200 dark:border-white/10 rounded-lg p-6 bg-white dark:bg-gray-900">
    <a href="/${encodeURIComponent(book.id)}" class="flex flex-col h-full">
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

// The creator's first keyword is their own best signal of what the piece is
// "about" for search - if the article's opening text doesn't already
// naturally contain it (most well-written openings do, but not guaranteed),
// lead the snippet with it explicitly rather than relying on truncation
// alone to convey relevance.
function articleMetaDescription(article, maxLen) {
  const plainBody = bodyToPlainText(article.body);
  const primaryKeyword = article.keywords && article.keywords[0];
  if (!primaryKeyword || plainBody.toLowerCase().includes(primaryKeyword.toLowerCase())) {
    return truncate(plainBody, maxLen);
  }
  const prefix = `${capitalize(primaryKeyword)}: `;
  return prefix + truncate(plainBody, maxLen - prefix.length);
}

// Splits an article body into {header, contentBlocks} sections using the
// same "## " header + blank-line-separated block rules renderArticleBodyHtml
// already renders with, so what gets extracted here matches what a reader
// actually sees on the page - never fabricated Q&A content.
function extractArticleSections(body) {
  const blocks = splitBlocks(body);
  const sections = [];
  let current = null;
  for (const block of blocks) {
    if (block.startsWith('## ')) {
      if (current) sections.push(current);
      current = { header: block.slice(3).trim(), contentBlocks: [] };
    } else if (current) {
      current.contentBlocks.push(block);
    }
  }
  if (current) sections.push(current);
  return sections;
}

const QUESTION_HEADER_RE = /\?$|^(how to|how do|how does|how can|what is|what are|what's|why|when|where|which|can i|should i|do i)\b/i;
const NUMBERED_HEADER_RE = /^\d+[).]\s*/;

// Only ever produces a schema block when the creator's own section headers
// already read as questions or as ordered steps - never invents a Q&A pair
// or a step that isn't a real section of the article, so this stays honest
// and applies automatically to any future article with the same structure.
function buildArticleFaqOrHowToJsonLd(article) {
  const sections = extractArticleSections(article.body).filter((s) => s.contentBlocks.length);
  if (!sections.length) return null;

  const numbered = sections.filter((s) => NUMBERED_HEADER_RE.test(s.header));
  if (numbered.length >= 2 && numbered.length / sections.length >= 0.5) {
    return {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: article.title,
      step: numbered.map((s) => ({
        '@type': 'HowToStep',
        name: s.header.replace(NUMBERED_HEADER_RE, '').trim(),
        text: truncate(bodyToPlainText(s.contentBlocks.join('\n\n')), 500)
      }))
    };
  }

  const faq = sections.filter((s) => QUESTION_HEADER_RE.test(s.header));
  if (!faq.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((s) => ({
      '@type': 'Question',
      name: s.header,
      acceptedAnswer: {
        '@type': 'Answer',
        text: truncate(bodyToPlainText(s.contentBlocks.join('\n\n')), 500)
      }
    }))
  };
}

function buildRelatedArticlesHtml(article, allArticles) {
  const related = pickRelated(allArticles, article, {
    sameField: (a) => {
      const p = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
      return p?.username;
    },
    tokenField: (a) => (a.keywords || []).map((k) => k.toLowerCase())
  });
  if (!related.length) return '';
  return `
    <div class="border-t border-gray-200 dark:border-white/10 mt-12 pt-10">
      <h2 class="text-xl font-['Playfair_Display'] font-bold mb-6 dark:text-white">More From Orastories</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
${related.map(buildArticleCardHtml).join('\n')}
      </div>
    </div>`;
}

function buildArticleJsonLd(article, canonicalUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    author: { '@type': 'Person', name: authorNameFor(article) },
    datePublished: article.created_at || undefined,
    image: article.cover_image_url || undefined,
    description: articleMetaDescription(article, 200),
    // The creator's own keywords (set at publish time, see lib/articles.ts) -
    // a real signal for Google's topical understanding of the piece, unlike
    // the old <meta name="keywords"> tag which search engines mostly ignore
    // now (that tag is still emitted below for the engines that still read it).
    keywords: article.keywords && article.keywords.length ? article.keywords.join(', ') : undefined,
    url: canonicalUrl
  };
}

function buildArticleBodyHtml(article, allArticles = []) {
  return `  <article>
    ${buildBreadcrumbHtml([
      { name: 'Home', url: `${SITE_ORIGIN}/` },
      { name: 'Blog', url: `${SITE_ORIGIN}/blog` },
      { name: article.title, url: `${SITE_ORIGIN}/${article.slug}` }
    ])}
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
    ${buildRelatedArticlesHtml(article, allArticles)}
  </article>`;
}

function buildArticleCardHtml(article) {
  return `  <article class="rounded-sm border overflow-hidden bg-white dark:bg-[#161616] border-black/10 dark:border-white/10">
    <a href="/${encodeURIComponent(article.slug)}" class="block">
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
// Creator profile pages - mirrors components/CreatorProfile.tsx (same
// role='creator' gating as lib/creatorProfile.ts's getCreatorProfile(), same
// published-books listing as listPublishedBooksByCreator()).
// ---------------------------------------------------------------------------

function buildCreatorJsonLd(creator, canonicalUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: creator.display_name || creator.username,
    alternateName: creator.username,
    description: creator.bio || undefined,
    url: canonicalUrl
  };
}

function buildCreatorBodyHtml(creator, books) {
  const memberSinceYear = creator.created_at ? new Date(creator.created_at).getFullYear() : null;
  const booksHtml = books.length
    ? `  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 items-stretch">
${books.map(buildBookCardHtml).join('\n')}
  </div>`
    : '  <p class="text-center text-sm text-gray-500 dark:text-gray-400">Hasn\'t published any books yet.</p>';

  return `  ${buildBreadcrumbHtml([
    { name: 'Home', url: `${SITE_ORIGIN}/` },
    { name: `@${creator.username}`, url: `${SITE_ORIGIN}/${creator.username}` }
  ])}
  <div class="text-center mb-14">
    <h1 class="text-4xl sm:text-5xl font-['Playfair_Display'] mb-3 tracking-tight dark:text-white">${escapeHtml(creator.display_name || creator.username)}</h1>
    <p class="text-[10px] sm:text-xs uppercase tracking-[0.35em] font-semibold text-gray-500">
      @${escapeHtml(creator.username)}${memberSinceYear ? ` &mdash; Member since ${memberSinceYear}` : ''}
    </p>
    ${creator.bio ? `<p class="max-w-2xl mx-auto mt-6 text-sm sm:text-base leading-relaxed text-gray-700 dark:text-gray-300">${escapeHtml(creator.bio)}</p>` : ''}
  </div>
${booksHtml}`;
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
      .select('id,slug,title,body,cover_image_url,cover_image_alt,keywords,created_at,profiles(username,display_name,role)')
      .eq('is_published', true);
    if (error) throw error;
    return data || [];
  }, 'fetch articles');
}

async function fetchReviewsByBook() {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('reviews')
      .select('book_id, rating, body, created_at, profiles(username, display_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const byBook = new Map();
    for (const review of data || []) {
      if (!byBook.has(review.book_id)) byBook.set(review.book_id, []);
      byBook.get(review.book_id).push(review);
    }
    return byBook;
  }, 'fetch reviews');
}

async function fetchCreators() {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('username,display_name,bio,created_at')
      .eq('role', 'creator')
      .not('username', 'is', null);
    if (error) throw error;
    return data || [];
  }, 'fetch creators');
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
  const [books, articles, creators, reviewsByBook] = await Promise.all([
    fetchBooks(),
    fetchArticles(),
    fetchCreators(),
    fetchReviewsByBook()
  ]);
  console.log(`  ${books.length} published book(s), ${articles.length} published article(s), ${creators.length} creator profile(s)`);

  await mkdir(path.join(distDir, 'books'), { recursive: true });

  await Promise.all(
    books.map(async (book) => {
      const chapters = await fetchPreviewChapters(book.id);
      const canonicalPath = `/${book.id}`;
      const bookReviews = reviewsByBook.get(book.id) || [];
      const html = pageShell({
        title: `${book.title} | Orastories`,
        description: bookMetaDescription(book),
        canonicalPath,
        ogType: 'book',
        ogImage: book.cover || null,
        jsonLd: [
          buildBookJsonLd(book, `${SITE_ORIGIN}${canonicalPath}`, bookReviews),
          buildBreadcrumbJsonLd([
            { name: 'Home', url: `${SITE_ORIGIN}/` },
            { name: 'Books', url: `${SITE_ORIGIN}/books` },
            { name: book.title, url: `${SITE_ORIGIN}${canonicalPath}` }
          ])
        ],
        bodyHtml: buildBookBodyHtml(book, chapters, books, bookReviews)
      });
      await writeFile(path.join(distDir, `${book.id}.html`), html, 'utf8');
      // Legacy path from before Phase N's bare-slug URLs - redirects rather
      // than 404s so anything already indexed/shared under it keeps working.
      await writeFile(path.join(distDir, `book-${book.id}.html`), redirectShellHtml(canonicalPath), 'utf8');
      // /books/{slug} - a UX shortcut straight to the buy/claim button on the
      // books listing page, not new content, so it redirects rather than
      // being its own indexed page (see the books.html hash-scroll handler).
      await writeFile(
        path.join(distDir, 'books', `${book.id}.html`),
        redirectShellHtml(`/books#${book.id}`, canonicalPath),
        'utf8'
      );
    })
  );
  console.log(`  wrote ${books.length} book detail page(s)`);

  await Promise.all(
    articles.map(async (article) => {
      const canonicalPath = `/${article.slug}`;
      const html = pageShell({
        title: `${article.title} | Orastories`,
        description: articleMetaDescription(article, 155),
        canonicalPath,
        ogType: 'article',
        ogImage: article.cover_image_url || null,
        keywords: article.keywords && article.keywords.length ? article.keywords.join(', ') : null,
        jsonLd: [
          buildArticleJsonLd(article, `${SITE_ORIGIN}${canonicalPath}`),
          buildBreadcrumbJsonLd([
            { name: 'Home', url: `${SITE_ORIGIN}/` },
            { name: 'Blog', url: `${SITE_ORIGIN}/blog` },
            { name: article.title, url: `${SITE_ORIGIN}${canonicalPath}` }
          ]),
          buildArticleFaqOrHowToJsonLd(article)
        ],
        bodyHtml: buildArticleBodyHtml(article, articles)
      });
      await writeFile(path.join(distDir, `${article.slug}.html`), html, 'utf8');
      // Legacy path - see the matching comment in the book loop above.
      await writeFile(path.join(distDir, `article-${article.slug}.html`), redirectShellHtml(canonicalPath), 'utf8');
    })
  );
  console.log(`  wrote ${articles.length} article detail page(s)`);

  const booksByCreator = new Map();
  for (const book of books) {
    const profile = Array.isArray(book.profiles) ? book.profiles[0] : book.profiles;
    if (!profile?.username) continue;
    if (!booksByCreator.has(profile.username)) booksByCreator.set(profile.username, []);
    booksByCreator.get(profile.username).push(book);
  }

  await Promise.all(
    creators.map(async (creator) => {
      const canonicalPath = `/${creator.username}`;
      const creatorBooks = booksByCreator.get(creator.username) || [];
      const html = pageShell({
        title: `${creator.display_name || creator.username} | Orastories`,
        description: truncate(creator.bio || `${creator.display_name || creator.username}'s author profile on Orastories.`, 155),
        canonicalPath,
        ogType: 'profile',
        ogImage: null,
        jsonLd: [
          buildCreatorJsonLd(creator, `${SITE_ORIGIN}${canonicalPath}`),
          buildBreadcrumbJsonLd([
            { name: 'Home', url: `${SITE_ORIGIN}/` },
            { name: `@${creator.username}`, url: `${SITE_ORIGIN}${canonicalPath}` }
          ])
        ],
        bodyHtml: buildCreatorBodyHtml(creator, creatorBooks)
      });
      await writeFile(path.join(distDir, `${creator.username}.html`), html, 'utf8');
    })
  );
  console.log(`  wrote ${creators.length} creator profile page(s)`);

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
    ...books.map((b) => ({ loc: `/${b.id}`, lastmod: (b.created_at || BUILD_DATE).slice(0, 10) })),
    ...articles.map((a) => ({ loc: `/${a.slug}`, lastmod: (a.created_at || BUILD_DATE).slice(0, 10) })),
    ...creators.map((c) => ({ loc: `/${c.username}`, lastmod: (c.created_at || BUILD_DATE).slice(0, 10) }))
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

  const rssItems = [...articles]
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .map((article) => {
      const url = `${SITE_ORIGIN}/${article.slug}`;
      const pubDate = article.created_at ? new Date(article.created_at).toUTCString() : new Date().toUTCString();
      return `    <item>
      <title>${escapeHtml(article.title)}</title>
      <link>${url}</link>
      <guid>${url}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeHtml(articleMetaDescription(article, 300))}</description>
    </item>`;
    })
    .join('\n');
  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>The Orastories Blog</title>
    <link>${SITE_ORIGIN}/blog</link>
    <description>Writing craft, publishing advice, and articles from an open community of authors and readers.</description>
    <language>en</language>
${rssItems}
  </channel>
</rss>
`;
  await writeFile(path.join(distDir, 'rss.xml'), rssXml, 'utf8');
  console.log('  wrote rss.xml');
}

main().catch((error) => {
  console.error('generate-seo-pages failed:', error);
  process.exit(1);
});
