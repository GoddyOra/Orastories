import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { getUserClient } from '../_shared/supabaseUser.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { reportError } from '../_shared/sentry.ts';

// Permanent account deletion, required in-app by App Store Review Guideline
// 5.1.1(v) for any app that lets people create an account. Deleting a row in
// auth.users needs the service role, so it can't happen from the browser -
// but the id is always taken from the caller's own verified JWT, never from
// the request body, so this can only ever delete the caller's own account.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let userId: string | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const { data: userData, error: userError } = await getUserClient(authHeader).auth.getUser();
    if (userError || !userData.user) return json({ error: 'Not signed in' }, 401);
    userId = userData.user.id;

    // Typing the exact account email is the confirmation step - a permanent,
    // unrecoverable delete shouldn't be one stray click (or one replayed
    // request) away.
    const body = await req.json().catch(() => ({}));
    const confirmEmail = String(body?.confirmEmail ?? '').trim().toLowerCase();
    const actualEmail = (userData.user.email ?? '').trim().toLowerCase();

    if (!confirmEmail || confirmEmail !== actualEmail) {
      return json({ error: 'Enter your account email exactly as it appears to confirm.' }, 400);
    }

    // Removing the auth user cascades through profiles into reviews,
    // bookmarks, articles, comments, purchases, wallets and reading progress.
    // Books are the deliberate exception: books.creator_id is ON DELETE SET
    // NULL, so titles someone already claimed stay readable rather than
    // vanishing out of another reader's library.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return json({ success: true });
  } catch (error) {
    // Only genuine failures reach here - a wrong confirmation email returns
    // above without paging anyone.
    reportError(error, { fn: 'delete-account', userId });
    return json({ error: 'Could not delete the account. Please try again or contact support.' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
