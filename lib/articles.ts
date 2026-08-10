import { supabase } from './supabaseClient';

const COVER_BUCKET = 'article-covers';
const ANON_VIEWER_KEY = 'orastories-anon-viewer-id';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export interface ArticleAuthor {
  username: string;
  displayName: string | null;
  isCreator: boolean;
}

export interface ArticleSummary {
  id: string;
  slug: string;
  title: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  keywords: string[];
  viewCount: number;
  createdAt: string;
  author: ArticleAuthor;
  averageRating: number | null;
  ratingCount: number;
}

export interface Article extends ArticleSummary {
  body: string;
}

function mapRow(row: any): ArticleSummary {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const ratings: number[] = (row.article_ratings || []).map((r: any) => r.rating);
  const ratingCount = ratings.length;
  const averageRating = ratingCount > 0 ? ratings.reduce((a, b) => a + b, 0) / ratingCount : null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    coverImageUrl: row.cover_image_url,
    coverImageAlt: row.cover_image_alt,
    keywords: row.keywords || [],
    viewCount: row.view_count,
    createdAt: row.created_at,
    author: {
      username: profile?.username ?? '',
      displayName: profile?.display_name ?? null,
      isCreator: profile?.role === 'creator'
    },
    averageRating,
    ratingCount
  };
}

const SUMMARY_SELECT =
  'id,slug,title,cover_image_url,cover_image_alt,keywords,view_count,created_at,profiles(username,display_name,role),article_ratings(rating)';

export type ArticleSort = 'relevance' | 'popular' | 'newest';

export async function listArticles(options: { sort?: ArticleSort; authorUsername?: string } = {}): Promise<ArticleSummary[]> {
  let query = supabase.from('articles').select(SUMMARY_SELECT).eq('is_published', true);

  if (options.authorUsername) {
    query = query.eq('profiles.username', options.authorUsername);
  }

  const { data, error } = await query;
  if (error) throw error;

  const articles = (data ?? []).map(mapRow);

  const sort = options.sort ?? 'relevance';
  if (sort === 'newest') {
    articles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sort === 'popular') {
    articles.sort((a, b) => b.viewCount - a.viewCount);
  } else {
    // Relevance: a simple, transparent heuristic (view count plus rating
    // weighted up) rather than a "properly normalized" statistical score -
    // simple and tunable beats fake precision at this scale.
    const score = (a: ArticleSummary) => a.viewCount + (a.averageRating ?? 0) * 20;
    articles.sort((a, b) => score(b) - score(a));
  }

  return articles;
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const { data, error } = await supabase
    .from('articles')
    .select(`body,${SUMMARY_SELECT}`)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return { ...mapRow(data), body: data.body };
}

export function getAnonViewerId(): string {
  let id = localStorage.getItem(ANON_VIEWER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_VIEWER_KEY, id);
  }
  return id;
}

export async function recordArticleView(articleId: string, viewerKey: string) {
  // A plain insert, not an upsert: article_views has no SELECT policy
  // (view logs shouldn't be publicly queryable), and Postgres's ON CONFLICT
  // handling needs some row-visibility to check for a conflict, which RLS
  // then blocks. A duplicate (article, viewer, day) is the expected,
  // benign "already viewed today" case, not a real error - the unique
  // constraint violation is caught and swallowed instead.
  const { error } = await supabase.from('article_views').insert({ article_id: articleId, viewer_key: viewerKey });
  if (error && error.code !== '23505') throw error;
}

export async function getMyArticleRating(articleId: string, readerId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('article_ratings')
    .select('rating')
    .eq('article_id', articleId)
    .eq('reader_id', readerId)
    .maybeSingle();

  if (error) throw error;
  return data?.rating ?? null;
}

export async function rateArticle(articleId: string, readerId: string, rating: number) {
  const { error } = await supabase
    .from('article_ratings')
    .upsert({ article_id: articleId, reader_id: readerId, rating }, { onConflict: 'article_id,reader_id' });
  if (error) throw error;
}

export async function flagArticle(articleId: string, flaggerId: string, reason?: string) {
  const { error } = await supabase.from('article_flags').insert({ article_id: articleId, flagger_id: flaggerId, reason: reason || null });
  if (error) {
    if (error.code === '23505') {
      throw new Error("You've already flagged this article.");
    }
    throw error;
  }
}

export interface ArticleFields {
  title: string;
  body: string;
  keywords: string[];
}

export interface MyArticle {
  id: string;
  slug: string;
  title: string;
  body: string;
  coverImageUrl: string | null;
  keywords: string[];
  viewCount: number;
  isPublished: boolean;
  removedReason: string | null;
  createdAt: string;
}

export async function listMyArticles(authorId: string): Promise<MyArticle[]> {
  const { data, error } = await supabase
    .from('articles')
    .select('id,slug,title,body,cover_image_url,keywords,view_count,is_published,removed_reason,created_at')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    coverImageUrl: row.cover_image_url,
    keywords: row.keywords || [],
    viewCount: row.view_count,
    isPublished: row.is_published,
    removedReason: row.removed_reason,
    createdAt: row.created_at
  }));
}

export async function createArticle(authorId: string, fields: ArticleFields): Promise<{ id: string; slug: string }> {
  const slug = slugify(fields.title);

  const { data, error } = await supabase
    .from('articles')
    .insert({
      slug,
      author_id: authorId,
      title: fields.title,
      body: fields.body,
      keywords: fields.keywords
    })
    .select('id, slug')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('An article with a similar title already exists. Try a different title.');
    }
    throw error;
  }

  return data;
}

export async function updateArticle(articleId: string, fields: ArticleFields) {
  const { error } = await supabase
    .from('articles')
    .update({
      title: fields.title,
      body: fields.body,
      keywords: fields.keywords,
      updated_at: new Date().toISOString()
    })
    .eq('id', articleId);

  if (error) throw error;
}

export async function setArticlePublished(articleId: string, isPublished: boolean) {
  const { error } = await supabase.from('articles').update({ is_published: isPublished }).eq('id', articleId);
  if (error) throw error;
}

export async function uploadArticleCover(articleId: string, file: File, altText: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${articleId}/cover.${ext}`;

  const { error: uploadError } = await supabase.storage.from(COVER_BUCKET).upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(COVER_BUCKET).getPublicUrl(path);

  const { error: updateError } = await supabase
    .from('articles')
    .update({ cover_image_url: data.publicUrl, cover_image_alt: altText })
    .eq('id', articleId);
  if (updateError) throw updateError;

  return data.publicUrl;
}
