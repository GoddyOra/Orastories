import { supabase } from './supabaseClient';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export interface CreatorBook {
  id: string;
  title: string;
  author: string;
  cover: string;
  genre: string;
  synopsis: string;
  publishedDate: string;
  isPublished: boolean;
  priceCents: number | null;
}

export interface BookFields {
  title: string;
  author: string;
  genre: string;
  synopsis: string;
  cover: string;
  publishedDate: string;
}

function rowToCreatorBook(row: any): CreatorBook {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    cover: row.cover ?? '',
    genre: row.genre ?? '',
    synopsis: row.synopsis ?? '',
    publishedDate: row.published_date ?? '',
    isPublished: row.is_published,
    priceCents: row.price_cents ?? null
  };
}

export async function listMyBooks(creatorId: string): Promise<CreatorBook[]> {
  const { data, error } = await supabase
    .from('books')
    .select('id,title,author,cover,genre,synopsis,published_date,is_published,price_cents')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToCreatorBook);
}

export async function createBook(creatorId: string, fields: BookFields): Promise<{ id: string }> {
  const id = slugify(fields.title);

  const { error } = await supabase.from('books').insert({
    id,
    creator_id: creatorId,
    title: fields.title,
    author: fields.author,
    genre: fields.genre,
    synopsis: fields.synopsis,
    cover: fields.cover,
    published_date: fields.publishedDate,
    is_published: false
  });

  if (error) {
    if (error.code === '23505') {
      throw new Error('A book with a similar title already exists. Try a different title.');
    }
    throw error;
  }

  return { id };
}

export async function updateBook(bookId: string, fields: BookFields) {
  const { error } = await supabase
    .from('books')
    .update({
      title: fields.title,
      author: fields.author,
      genre: fields.genre,
      synopsis: fields.synopsis,
      cover: fields.cover,
      published_date: fields.publishedDate
    })
    .eq('id', bookId);

  if (error) throw error;
}

export async function setPublished(bookId: string, isPublished: boolean) {
  const { error } = await supabase.from('books').update({ is_published: isPublished }).eq('id', bookId);
  if (error) throw error;
}

export async function setBookPrice(bookId: string, priceCents: number | null) {
  const { error } = await supabase.from('books').update({ price_cents: priceCents }).eq('id', bookId);
  if (error) throw error;
}

export interface CreatorChapter {
  id: string;
  title: string;
  content: string;
  position: number;
}

export async function listChaptersForBook(bookId: string): Promise<CreatorChapter[]> {
  const { data, error } = await supabase
    .from('chapters')
    .select('id,title,content,position')
    .eq('book_id', bookId)
    .order('position', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function addChapter(bookId: string, title: string, content: string) {
  const { count, error: countError } = await supabase
    .from('chapters')
    .select('id', { count: 'exact', head: true })
    .eq('book_id', bookId);

  if (countError) throw countError;

  const { error } = await supabase.from('chapters').insert({ book_id: bookId, position: count ?? 0, title, content });
  if (error) throw error;
}

export async function addChaptersBulk(bookId: string, chapters: { title: string; content: string }[]) {
  const { count, error: countError } = await supabase
    .from('chapters')
    .select('id', { count: 'exact', head: true })
    .eq('book_id', bookId);

  if (countError) throw countError;

  const startPosition = count ?? 0;
  const rows = chapters.map((chapter, index) => ({
    book_id: bookId,
    position: startPosition + index,
    title: chapter.title,
    content: chapter.content
  }));

  const { error } = await supabase.from('chapters').insert(rows);
  if (error) throw error;
}

export async function updateChapter(chapterId: string, title: string, content: string) {
  const { error } = await supabase.from('chapters').update({ title, content }).eq('id', chapterId);
  if (error) throw error;
}

export async function deleteChapter(chapterId: string) {
  const { error } = await supabase.from('chapters').delete().eq('id', chapterId);
  if (error) throw error;
}

export async function getReadCountForBook(bookId: string): Promise<number> {
  const { count, error } = await supabase
    .from('reads')
    .select('id, chapters!inner(book_id)', { count: 'exact', head: true })
    .eq('chapters.book_id', bookId);

  if (error) throw error;
  return count ?? 0;
}
