import { supabase } from './supabaseClient';
import { Book, Chapter } from '../types';

export interface BookCatalogItem {
  id: string;
  title: string;
  author: string;
  cover: string;
  synopsis: string;
  genre: string;
  publishedDate: string;
  creatorUsername: string | null;
  loadBook: () => Promise<Book>;
}

export async function loadBookById(bookId: string): Promise<Book> {
  const [{ data: bookRow, error: bookError }, { data: chapterRows, error: chapterError }] = await Promise.all([
    supabase.from('books').select('*').eq('id', bookId).single(),
    supabase
      .from('chapters')
      .select('id,title,content,position')
      .eq('book_id', bookId)
      .order('position', { ascending: true })
  ]);

  if (bookError) throw bookError;
  if (chapterError) throw chapterError;
  if (!bookRow) throw new Error(`Book not found: ${bookId}`);

  const chapters: Chapter[] = (chapterRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content
  }));

  return {
    id: bookRow.id,
    title: bookRow.title,
    author: bookRow.author,
    cover: bookRow.cover ?? '',
    genre: bookRow.genre ?? '',
    publishedDate: bookRow.published_date ?? '',
    synopsis: bookRow.synopsis ?? '',
    chapters
  };
}

export async function fetchBookCatalog(): Promise<BookCatalogItem[]> {
  const { data, error } = await supabase
    .from('books')
    .select('id,title,author,cover,genre,synopsis,published_date,profiles(username)')
    .eq('is_published', true)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      title: row.title,
      author: row.author,
      cover: row.cover ?? '',
      genre: row.genre ?? '',
      synopsis: row.synopsis ?? '',
      publishedDate: row.published_date ?? '',
      creatorUsername: profile?.username ?? null,
      loadBook: () => loadBookById(row.id)
    };
  });
}
