import { supabase } from './supabaseClient';

export async function getBookmark(bookId: string, readerId: string): Promise<{ chapterId: string | null } | null> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('chapter_id')
    .eq('book_id', bookId)
    .eq('reader_id', readerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { chapterId: data.chapter_id };
}

export async function saveBookmark(bookId: string, readerId: string, chapterId: string) {
  return supabase
    .from('bookmarks')
    .upsert({ book_id: bookId, reader_id: readerId, chapter_id: chapterId }, { onConflict: 'reader_id,book_id' });
}

export interface BookmarkedBook {
  bookId: string;
  title: string;
  author: string;
  cover: string;
  genre: string;
  synopsis: string;
  publishedDate: string;
}

export async function listBookmarksWithBooks(readerId: string): Promise<BookmarkedBook[]> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('book_id, books(id,title,author,cover,genre,synopsis,published_date)')
    .eq('reader_id', readerId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const book = Array.isArray(row.books) ? row.books[0] : row.books;
      if (!book) return null;
      return {
        bookId: book.id,
        title: book.title,
        author: book.author,
        cover: book.cover ?? '',
        genre: book.genre ?? '',
        synopsis: book.synopsis ?? '',
        publishedDate: book.published_date ?? ''
      };
    })
    .filter((b): b is BookmarkedBook => b !== null);
}
