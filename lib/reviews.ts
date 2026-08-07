import { supabase } from './supabaseClient';

export interface MyReview {
  bookId: string;
  rating: number;
  body: string | null;
}

export async function getMyReview(bookId: string, readerId: string): Promise<MyReview | null> {
  const { data, error } = await supabase
    .from('reviews')
    .select('book_id,rating,body')
    .eq('book_id', bookId)
    .eq('reader_id', readerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { bookId: data.book_id, rating: data.rating, body: data.body };
}

export async function upsertReview(bookId: string, readerId: string, rating: number, body: string) {
  return supabase
    .from('reviews')
    .upsert(
      { book_id: bookId, reader_id: readerId, rating, body },
      { onConflict: 'book_id,reader_id' }
    );
}

export interface MyReviewWithBook extends MyReview {
  title: string;
  cover: string;
}

export async function listMyReviews(readerId: string): Promise<MyReviewWithBook[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('book_id,rating,body,books(id,title,cover)')
    .eq('reader_id', readerId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const book = Array.isArray(row.books) ? row.books[0] : row.books;
      if (!book) return null;
      return {
        bookId: row.book_id,
        rating: row.rating,
        body: row.body,
        title: book.title,
        cover: book.cover ?? ''
      };
    })
    .filter((r): r is MyReviewWithBook => r !== null);
}
