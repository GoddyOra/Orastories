// One-off migration: pushes the 4 hardcoded static blog posts into the new
// articles table, authored by the real site-owner account (goddyora).
//
// Usage:
//   1. Run the Phase F schema SQL in the Supabase SQL editor first.
//   2. Fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
//   3. npx tsx scripts/migrate-blog-posts.ts
//
// Safe to re-run: articles are upserted by slug.

import 'dotenv/config';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const SITE_ORIGIN = 'https://orastories.com';

// This environment's network is known to be intermittently flaky - retry
// transient fetch failures a few times before giving up.
async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 4): Promise<T> {
  let lastError: unknown;
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

interface PostMeta {
  file: string;
  slug: string;
  title: string;
  publishedAt: string; // ISO date
  coverLocalPath: string; // local file path for upload
  keywords: string[];
}

const POSTS: PostMeta[] = [
  {
    file: 'blog-best-programming-language-2026.html',
    slug: 'best-programming-language-to-learn-in-2026',
    title: "Best Programming Language to Learn in 2026: A Beginner's Guide",
    publishedAt: '2026-01-12T09:00:00Z',
    coverLocalPath: 'images/blog-archive/image(2).jpg',
    keywords: ['programming', 'python', 'javascript', 'coding', 'beginners']
  },
  {
    file: 'blog-perfect-food-menu-pet-dog-2026.html',
    slug: 'perfect-food-menu-for-your-pet-dog',
    title: 'Creating the Perfect Food Menu for Your Pet Dog',
    publishedAt: '2026-01-14T09:00:00Z',
    coverLocalPath: 'images/blog-archive/dogfood(2).jpg',
    keywords: ['dog food', 'pet nutrition', 'dog care', 'pet health']
  },
  {
    file: 'blog-python-syntaxerror-unexpected-eof-guide-2026.html',
    slug: 'python-syntaxerror-unexpected-eof-guide',
    title: "Python SyntaxError: Unexpected EOF While Parsing - Solution Guide",
    publishedAt: '2026-03-02T09:00:00Z',
    coverLocalPath: 'images/blog-archive/python-syntax-main-2026.jpg',
    keywords: ['python', 'syntaxerror', 'debugging', 'programming', 'coding errors']
  },
  {
    file: 'blog-writing-101-profitable-writer-2026.html',
    slug: 'writing-101-profitable-writer',
    title: 'Writing 101: How to Start Your Career as a Profitable Writer',
    publishedAt: '2026-02-18T09:00:00Z',
    coverLocalPath: 'images/blog-archive/writing101-1.jpg',
    keywords: ['writing', 'self-publishing', 'author career', 'book marketing', 'writing tips']
  }
];

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function convertInline(html: string): string {
  let text = html;
  text = text.replace(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_m, url, inner) => `[url=${url}]${inner.trim()}[/url]`);
  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/g, (_m, inner) => `**${inner.trim()}**`);
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/g, (_m, inner) => `*${inner.trim()}*`);
  text = text.replace(/<[^>]+>/g, ''); // strip anything else left
  return decodeEntities(text.trim());
}

function extractBody(html: string, coverLocalPath: string): string {
  const articleMatch = html.match(/<article class="article-content">([\s\S]*?)<\/article>/);
  if (!articleMatch) throw new Error('Could not find <article class="article-content"> block');
  let inner = articleMatch[1];

  // Drop the <header>...</header> (title/byline already captured separately).
  inner = inner.replace(/<header[\s\S]*?<\/header>/, '');

  const coverFile = coverLocalPath.split('/').pop()!;
  const blocks: string[] = [];

  // Tag-name boundaries matter here: `<p[^>]*>` alone also matches `<pre ...>`
  // (since "pre" starts with "p"), which swallows the whole code block plus
  // everything up to the *next* real </p> as if it were paragraph text -
  // `<p(?:\s[^>]*)?>` requires the character right after "p" to be a space
  // or ">", excluding <pre>/<progress>/etc.
  const blockRegex = /<h2[^>]*>([\s\S]*?)<\/h2>|<p(?:\s[^>]*)?>([\s\S]*?)<\/p>|<pre[^>]*>[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>|<img[^>]*src="([^"]+)"[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(inner)) !== null) {
    if (match[1] !== undefined) {
      blocks.push('## ' + convertInline(match[1]));
    } else if (match[2] !== undefined) {
      const text = convertInline(match[2]);
      if (text) blocks.push(text);
    } else if (match[3] !== undefined) {
      blocks.push(`[code]${decodeEntities(match[3].trim())}[/code]`);
    } else if (match[4] !== undefined) {
      const src = match[4];
      if (src.endsWith(coverFile)) continue; // the cover is handled separately
      const absoluteUrl = src.startsWith('http') ? src : `${SITE_ORIGIN}/${src.replace(/^\.?\//, '')}`;
      blocks.push(`[img]${absoluteUrl}[/img]`);
    }
  }

  return blocks.join('\n\n');
}

async function getGoddyOraId(): Promise<string> {
  const data = await withRetry(async () => {
    const { data, error } = await supabase.from('profiles').select('id').eq('username', 'goddyora').maybeSingle();
    if (error) throw error;
    return data;
  }, 'lookup goddyora profile');
  if (!data) throw new Error('No profile found with username "goddyora" - sign up first.');
  return data.id;
}

async function uploadCover(articleId: string, localPath: string, altText: string): Promise<{ url: string; alt: string }> {
  const ext = localPath.split('.').pop() || 'jpg';
  const fileBuffer = readFileSync(localPath);
  const storagePath = `${articleId}/cover.${ext}`;
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

  await withRetry(async () => {
    const { error: uploadError } = await supabase.storage.from('article-covers').upload(storagePath, fileBuffer, {
      upsert: true,
      contentType
    });
    if (uploadError) throw uploadError;
  }, 'cover upload');

  const { data } = supabase.storage.from('article-covers').getPublicUrl(storagePath);
  return { url: data.publicUrl, alt: altText };
}

async function migrate() {
  const authorId = await getGoddyOraId();
  console.log(`Migrating as author ${authorId} (goddyora)`);

  for (const post of POSTS) {
    console.log(`\nProcessing "${post.title}"...`);
    const html = readFileSync(post.file, 'utf8');
    const body = extractBody(html, post.coverLocalPath);
    console.log(`  Extracted body: ${body.length} chars`);

    const existing = await withRetry(async () => {
      const { data, error } = await supabase.from('articles').select('id').eq('slug', post.slug).maybeSingle();
      if (error) throw error;
      return data;
    }, 'lookup existing article');

    let articleId: string;
    if (existing) {
      articleId = existing.id;
      await withRetry(async () => {
        const { error } = await supabase
          .from('articles')
          .update({ title: post.title, body, keywords: post.keywords, created_at: post.publishedAt })
          .eq('id', articleId);
        if (error) throw error;
      }, 'update article');
      console.log(`  Updated existing article ${articleId}`);
    } else {
      const inserted = await withRetry(async () => {
        const { data, error } = await supabase
          .from('articles')
          .insert({
            slug: post.slug,
            author_id: authorId,
            title: post.title,
            body,
            keywords: post.keywords,
            created_at: post.publishedAt,
            is_published: true
          })
          .select('id')
          .single();
        if (error) throw error;
        return data;
      }, 'insert article');
      articleId = inserted.id;
      console.log(`  Inserted new article ${articleId}`);
    }

    const altText = `${post.title} — ${post.keywords.slice(0, 3).join(', ')}`;
    const cover = await uploadCover(articleId, post.coverLocalPath, altText);
    await withRetry(async () => {
      const { error: coverUpdateError } = await supabase
        .from('articles')
        .update({ cover_image_url: cover.url, cover_image_alt: cover.alt })
        .eq('id', articleId);
      if (coverUpdateError) throw coverUpdateError;
    }, 'update cover url');
    console.log(`  Cover uploaded: ${cover.url}`);
  }

  console.log('\nDone.');
}

migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
