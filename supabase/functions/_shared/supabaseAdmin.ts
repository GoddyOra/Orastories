import { createClient } from 'npm:@supabase/supabase-js@2';

// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-provided to every
// deployed Edge Function - no manual `supabase secrets set` needed for these.
export const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);
