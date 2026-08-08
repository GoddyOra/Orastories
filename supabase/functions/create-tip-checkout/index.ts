import { stripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { getUserClient } from '../_shared/supabaseUser.ts';
import { corsHeaders } from '../_shared/cors.ts';

// Platform commission - keep this in sync with the display text in the
// Reader.tsx tip modal if it ever changes.
const PLATFORM_FEE_RATE = 0.1;
const MIN_AMOUNT_CENTS = 50; // Stripe's USD charge minimum

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');

    const { data: userData, error: userError } = await getUserClient(authHeader).auth.getUser();
    if (userError || !userData.user) throw new Error('Not signed in');
    const readerId = userData.user.id;

    const body = await req.json();
    const bookId = String(body.bookId || '');
    const amountCents = Math.round(Number(body.amountCents));
    const origin = String(body.origin || '');

    if (!bookId || !origin) throw new Error('Missing bookId or origin');
    if (!Number.isInteger(amountCents) || amountCents < MIN_AMOUNT_CENTS) {
      throw new Error(`Amount must be at least $${(MIN_AMOUNT_CENTS / 100).toFixed(2)}`);
    }

    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('id, title, creator_id')
      .eq('id', bookId)
      .maybeSingle();
    if (bookError) throw bookError;
    if (!book || !book.creator_id) throw new Error('Book not found');

    const { data: creatorProfile, error: creatorError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id, stripe_payouts_enabled')
      .eq('id', book.creator_id)
      .maybeSingle();
    if (creatorError) throw creatorError;
    if (!creatorProfile?.stripe_account_id || !creatorProfile.stripe_payouts_enabled) {
      throw new Error("This author hasn't finished setting up payments yet.");
    }

    const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);

    const { data: tipRow, error: tipError } = await supabaseAdmin
      .from('tips')
      .insert({
        book_id: book.id,
        creator_id: book.creator_id,
        reader_id: readerId,
        amount_cents: amountCents,
        platform_fee_cents: platformFeeCents,
        status: 'pending'
      })
      .select('id')
      .single();
    if (tipError) throw tipError;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `Tip for "${book.title}"` },
            unit_amount: amountCents
          },
          quantity: 1
        }
      ],
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        transfer_data: { destination: creatorProfile.stripe_account_id },
        metadata: { tip_id: tipRow.id }
      },
      metadata: { tip_id: tipRow.id },
      success_url: `${origin}/?tip=success`,
      cancel_url: `${origin}/?tip=cancelled`
    });

    const { error: sessionUpdateError } = await supabaseAdmin
      .from('tips')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', tipRow.id);
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
