import { supabase } from './supabaseClient';
import { Profile } from '../types';

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin }
  });
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

// scope: 'local' clears the session client-side without a server round trip.
// The server-round-trip variant was observed hanging indefinitely (never
// resolving or rejecting) when called a while after sign-in, consistent
// with a known class of supabase-js internal lock contention issue. This
// app doesn't need server-side session revocation, so local-only avoids it.
export async function signOut() {
  return supabase.auth.signOut({ scope: 'local' });
}

// Insert-if-absent only: never overwrites an existing profile's role/display_name.
export async function ensureProfile(userId: string) {
  return supabase
    .from('profiles')
    .upsert({ id: userId, role: 'reader' }, { onConflict: 'id', ignoreDuplicates: true });
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,role,display_name,created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    role: data.role,
    displayName: data.display_name,
    createdAt: data.created_at
  };
}
