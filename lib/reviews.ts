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

export interface RecentReview {
  id: string;
  rating: number;
  body: string | null;
  bookTitle: string;
  reviewerName: string;
}

export async function listRecentReviews(limit = 20): Promise<RecentReview[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id,rating,body,books(title),profiles(username,display_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const book = Array.isArray(row.books) ? row.books[0] : row.books;
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      if (!book) return null;
      return {
        id: row.id,
        rating: row.rating,
        body: row.body,
        bookTitle: book.title,
        reviewerName: profile?.username || profile?.display_name || 'A Reader'
      };
    })
    .filter((r): r is RecentReview => r !== null);
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
