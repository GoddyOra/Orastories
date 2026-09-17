import { supabase } from './supabaseClient';
import { Profile } from '../types';
import { USERNAME_PATTERN } from './username';

export async function signUp(email: string, password: string, username: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { username }, emailRedirectTo: window.location.origin }
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
// rawUsername comes from auth user_metadata, which is arbitrary client-supplied
// JSON - re-validate the format here rather than trusting it, since a malformed
// value would otherwise trip the DB's CHECK constraint (a different error code
// than the unique-collision retry below expects) and leave the account with no
// profile row at all.
export async function ensureProfile(userId: string, rawUsername: unknown) {
  const username = typeof rawUsername === 'string' && USERNAME_PATTERN.test(rawUsername) ? rawUsername : null;

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, role: 'reader', username }, { onConflict: 'id', ignoreDuplicates: true });

  if (error && error.code === '23505' && username) {
    // The desired username was taken by the time this account's email got
    // confirmed (confirmation can lag signup by minutes). Fall back to no
    // username rather than leaving the account with no profile row at all -
    // Portal's "choose a username" gate recovers from here.
    await supabase
      .from('profiles')
      .upsert({ id: userId, role: 'reader', username: null }, { onConflict: 'id', ignoreDuplicates: true });
  }
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,role,display_name,username,bio,stripe_payouts_enabled,created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    role: data.role,
    displayName: data.display_name,
    username: data.username,
    bio: data.bio,
    stripePayoutsEnabled: data.stripe_payouts_enabled,
    createdAt: data.created_at
  };
}

// Permanent, irreversible. Deleting auth.users needs the service role, so the
// real work happens in the delete-account Edge Function - it takes the user id
// from the caller's own JWT, so this can only ever delete your own account.
// confirmEmail must match the signed-in address exactly; the server checks it
// too rather than trusting the UI to have asked.
export async function deleteAccount(confirmEmail: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: { confirmEmail }
  });

  if (error) {
    // A non-2xx from the function surfaces as FunctionsHttpError, whose
    // message is generic ("non-2xx status code") - the useful text is in the
    // response body, so read it back rather than showing the wrapper.
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      const body = await context.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);

  // The account is gone; clear the now-orphaned local session so the UI
  // doesn't keep rendering as if it were still signed in.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}

export async function updateBio(userId: string, bio: string): Promise<void> {
  const trimmed = bio.trim();
  const { error } = await supabase
    .from('profiles')
    .update({ bio: trimmed.length > 0 ? trimmed : null })
    .eq('id', userId);
  if (error) throw error;
}
