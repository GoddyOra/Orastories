import { createClient } from 'npm:@supabase/supabase-js@2';

// Builds a client scoped to the caller's own JWT, so auth.getUser() resolves
// the real signed-in user server-side - never trust a client-supplied id.
export function getUserClient(authHeader: string) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } }
  });
}
