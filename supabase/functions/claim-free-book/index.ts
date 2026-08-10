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
    const buyerId = userData.user.id;

    const body = await req.json();
    const bookId = String(body.bookId || '');
    if (!bookId) throw new Error('Missing bookId');

    // The price is never trusted from the client - always the DB's own value.
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('id, price_cents, is_published')
      .eq('id', bookId)
      .maybeSingle();
    if (bookError) throw bookError;
    if (!book || !book.is_published) throw new Error('Book not found');
    if (book.price_cents !== 0) throw new Error("This book isn't available for free.");

    const { data: existingPurchase, error: existingError } = await supabaseAdmin
      .from('purchases')
      .select('id')
      .eq('book_id', bookId)
      .eq('buyer_id', buyerId)
      .eq('status', 'succeeded')
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingPurchase) throw new Error('You already own this book.');

    const { error: insertError } = await supabaseAdmin.from('purchases').insert({
      book_id: bookId,
      buyer_id: buyerId,
      amount_cents: 0,
      platform_fee_cents: 0,
      status: 'succeeded'
    });
    if (insertError) throw insertError;

    return json({ success: true });
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
