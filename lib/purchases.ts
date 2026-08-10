import { supabase } from './supabaseClient';

const PDF_BUCKET = 'book-pdfs';

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function getBookPurchaseEligibility(bookId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('books')
    .select('id, price_cents, profiles!inner(stripe_payouts_enabled)')
    .eq('id', bookId)
    .maybeSingle();

  if (error) throw error;
  if (!data || !data.price_cents) return false;
  const embedded = data.profiles as { stripe_payouts_enabled: boolean } | { stripe_payouts_enabled: boolean }[] | undefined;
  if (!embedded) return false;
  const profile = Array.isArray(embedded) ? embedded[0] : embedded;
  return profile?.stripe_payouts_enabled ?? false;
}

export async function createPurchaseCheckout(bookId: string): Promise<string> {
  const { url } = await invoke<{ url: string }>('create-purchase-checkout', {
    bookId,
    origin: window.location.origin
  });
  return url;
}

export async function claimFreeBook(bookId: string): Promise<void> {
  await invoke('claim-free-book', { bookId });
}

export async function uploadBookPdf(bookId: string, file: File) {
  const { error } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(`${bookId}/manuscript.pdf`, file, { upsert: true, contentType: 'application/pdf' });
  if (error) throw error;
}

export async function getBookPdfStatus(bookId: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(PDF_BUCKET).list(bookId);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function getPurchaseDownloadUrl(bookId: string): Promise<string> {
  const { data, error } = await supabase.storage.from(PDF_BUCKET).createSignedUrl(`${bookId}/manuscript.pdf`, 300);
  if (error) throw error;
  return data.signedUrl;
}

export interface PurchasedBook {
  bookId: string;
  title: string;
  author: string;
  cover: string;
  genre: string;
  publishedDate: string;
}

export async function listMyPurchasesWithBooks(buyerId: string): Promise<PurchasedBook[]> {
  const { data, error } = await supabase
    .from('purchases')
    .select('book_id, created_at, books(id,title,author,cover,genre,published_date)')
    .eq('buyer_id', buyerId)
    .eq('status', 'succeeded')
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
        publishedDate: book.published_date ?? ''
      };
    })
    .filter((b): b is PurchasedBook => b !== null);
}
