import { supabase } from './supabaseClient';
import { BookCatalogItem, loadBookById } from './books';

export interface PublicCreatorProfile {
  username: string;
  displayName: string | null;
  bio: string | null;
  memberSince: string;
}

export async function getCreatorProfile(username: string): Promise<PublicCreatorProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username, display_name, bio, created_at')
    .eq('username', username)
    .eq('role', 'creator')
    .maybeSingle();

  if (error) throw error;
  if (!data || !data.username) return null;

  return {
    username: data.username,
    displayName: data.display_name,
    bio: data.bio,
    memberSince: data.created_at
  };
}

export async function listPublishedBooksByCreator(username: string): Promise<BookCatalogItem[]> {
  const { data, error } = await supabase
    .from('books')
    .select('id,title,author,cover,genre,synopsis,published_date,profiles!inner(username)')
    .eq('profiles.username', username)
    .eq('is_published', true)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author,
    cover: row.cover ?? '',
    genre: row.genre ?? '',
    synopsis: row.synopsis ?? '',
    publishedDate: row.published_date ?? '',
    creatorUsername: username,
    loadBook: () => loadBookById(row.id)
  }));
}
