import { stripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { getUserClient } from '../_shared/supabaseUser.ts';
import { corsHeaders } from '../_shared/cors.ts';

// Same commission as tipping - keep in sync with create-tip-checkout.
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
    const buyerId = userData.user.id;

    const body = await req.json();
    const bookId = String(body.bookId || '');
    const origin = String(body.origin || '');
    if (!bookId || !origin) throw new Error('Missing bookId or origin');

    // The price is never trusted from the client - always the DB's own value.
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('id, title, creator_id, price_cents')
      .eq('id', bookId)
      .maybeSingle();
    if (bookError) throw bookError;
    if (!book || !book.creator_id) throw new Error('Book not found');
    if (!book.price_cents || book.price_cents < MIN_AMOUNT_CENTS) {
      throw new Error("This book isn't for sale.");
    }

    const { data: creatorProfile, error: creatorError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id, stripe_payouts_enabled')
      .eq('id', book.creator_id)
      .maybeSingle();
    if (creatorError) throw creatorError;
    // A creator without a connected Stripe account isn't blocked from selling -
    // the full charge is simply held on the platform's own balance instead of
    // being split via transfer_data, and the purchase row is flagged so it can
    // be manually reconciled once the creator finishes onboarding.
    const isConnected = Boolean(creatorProfile?.stripe_account_id && creatorProfile.stripe_payouts_enabled);

    const { data: existingPurchase, error: existingError } = await supabaseAdmin
      .from('purchases')
      .select('id')
      .eq('book_id', bookId)
      .eq('buyer_id', buyerId)
      .eq('status', 'succeeded')
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingPurchase) throw new Error('You already own this book.');

    const { data: files, error: filesError } = await supabaseAdmin.storage.from('book-pdfs').list(bookId);
    if (filesError) throw filesError;
    if (!files || files.length === 0) throw new Error("This book's file isn't ready yet.");

    const amountCents = book.price_cents;
    const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);

    const { data: purchaseRow, error: purchaseError } = await supabaseAdmin
      .from('purchases')
      .insert({
        book_id: book.id,
        buyer_id: buyerId,
        amount_cents: amountCents,
        platform_fee_cents: platformFeeCents,
        status: 'pending',
        held_for_creator: !isConnected
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
            product_data: { name: `"${book.title}" (PDF)` },
            unit_amount: amountCents
          },
          quantity: 1
        }
      ],
      payment_intent_data: isConnected
        ? {
            application_fee_amount: platformFeeCents,
            transfer_data: { destination: creatorProfile!.stripe_account_id! },
            metadata: { purchase_id: purchaseRow.id }
          }
        : { metadata: { purchase_id: purchaseRow.id } },
      metadata: { purchase_id: purchaseRow.id },
      success_url: `${origin}/books?purchase=success`,
      cancel_url: `${origin}/books?purchase=cancelled`
    });

    const { error: sessionUpdateError } = await supabaseAdmin
      .from('purchases')
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
