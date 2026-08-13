import { stripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { getUserClient } from '../_shared/supabaseUser.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { assertUnderDailyLimit, getClientIp } from '../_shared/rateLimit.ts';

// Fixed denominations only - coin amounts are never trusted from the
// client, unlike the old create-tip-checkout which took an arbitrary
// reader-supplied amount. 1 OraCoin = 1 US cent.
const PACKS: Record<string, { amountCents: number; coins: number; label: string }> = {
  pack_500: { amountCents: 500, coins: 500, label: '500 OraCoins' },
  pack_1000: { amountCents: 1000, coins: 1000, label: '1,000 OraCoins' },
  pack_2500: { amountCents: 2500, coins: 2600, label: '2,600 OraCoins (100 bonus)' },
  pack_5000: { amountCents: 5000, coins: 5500, label: '5,500 OraCoins (500 bonus)' }
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');

    const { data: userData, error: userError } = await getUserClient(authHeader).auth.getUser();
    if (userError || !userData.user) throw new Error('Not signed in');
    const buyerId = userData.user.id;

    const body = await req.json();
    const packId = String(body.packId || '');
    const origin = String(body.origin || '');
    if (!origin) throw new Error('Missing origin');

    const pack = PACKS[packId];
    if (!pack) throw new Error('Unknown coin pack');

    await assertUnderDailyLimit(buyerId, getClientIp(req));

    const { data: purchaseRow, error: purchaseError } = await supabaseAdmin
      .from('coin_purchases')
      .insert({
        buyer_id: buyerId,
        pack_id: packId,
        amount_cents: pack.amountCents,
        coins_credited: pack.coins,
        status: 'pending',
        ip_address: getClientIp(req)
      })
      .select('id')
      .single();
    if (purchaseError) throw purchaseError;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `Orastories - ${pack.label}` },
            unit_amount: pack.amountCents
          },
          quantity: 1
        }
      ],
      payment_intent_data: { metadata: { coin_purchase_id: purchaseRow.id } },
      metadata: { coin_purchase_id: purchaseRow.id },
      success_url: `${origin}/?coins=success`,
      cancel_url: `${origin}/?coins=cancelled`
    });

    const { error: sessionUpdateError } = await supabaseAdmin
      .from('coin_purchases')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', purchaseRow.id);
    if (sessionUpdateError) throw sessionUpdateError;

    return json({ url: session.url });
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
