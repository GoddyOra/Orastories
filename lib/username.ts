import { supabase } from './supabaseClient';

// Kept in sync with db/schema.sql's CHECK constraint on profiles.username.
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (error) throw error;
  return !data;
}

export async function claimUsername(userId: string, username: string) {
  const { error } = await supabase.from('profiles').update({ username }).eq('id', userId);

  if (error) {
    if (error.code === '23505') {
      throw new Error('That username is already taken.');
    }
    throw error;
  }
}
