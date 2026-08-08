import { stripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { getUserClient } from '../_shared/supabaseUser.ts';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');

    const { data: userData, error: userError } = await getUserClient(authHeader).auth.getUser();
    if (userError || !userData.user) throw new Error('Not signed in');
    const userId = userData.user.id;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, stripe_account_id')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.role !== 'creator') throw new Error('Only creators can connect Stripe');

    const body = await req.json();
    const action = body.action as 'start' | 'sync';

    if (action === 'sync') {
      if (!profile.stripe_account_id) {
        return json({ payoutsEnabled: false });
      }
      const account = await stripe.accounts.retrieve(profile.stripe_account_id);
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ stripe_payouts_enabled: account.payouts_enabled ?? false })
        .eq('id', userId);
      if (updateError) throw updateError;
      return json({ payoutsEnabled: account.payouts_enabled ?? false });
    }

    if (action === 'start') {
      const origin = String(body.origin || '');
      if (!origin) throw new Error('Missing origin');

      let accountId = profile.stripe_account_id;
      if (!accountId) {
        const account = await stripe.accounts.create({
          type: 'express',
          email: userData.user.email,
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true }
          }
        });
        accountId = account.id;
        const { error: saveError } = await supabaseAdmin
          .from('profiles')
          .update({ stripe_account_id: accountId })
          .eq('id', userId);
        if (saveError) throw saveError;
      }

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${origin}/?stripe_return=1`,
        return_url: `${origin}/?stripe_return=1`,
        type: 'account_onboarding'
      });

      return json({ url: accountLink.url });
    }

    throw new Error('Unknown action');
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
