import { stripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

// Triggered daily by .github/workflows/sweep-payouts.yml, authenticated with
// the service-role key as a bearer token (verify_jwt stays on - this is not
// a public endpoint like stripe-webhook, which authenticates via Stripe's
// own signature instead).
//
// Coin-tips never settle instantly (there's no live PaymentIntent to split
// via transfer_data - see spend_coins_for_tip in db/schema.sql), so every
// coin-tip - and every purchase/tip from a creator who wasn't Connect-ready
// at charge time - just accrues as held_for_creator=true until this sweep
// claims and transfers it. This also finally gives previously-stuck
// held_for_creator rows a real path to the creator once they connect,
// closing a gap that existed before OraCoins for any reason at all.
const PAYOUT_THRESHOLD_CENTS = 2000; // $20

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { data: creators, error: creatorsError } = await supabaseAdmin
      .from('profiles')
      .select('id, stripe_account_id')
      .eq('role', 'creator')
      .eq('stripe_payouts_enabled', true)
      .not('stripe_account_id', 'is', null);
    if (creatorsError) throw creatorsError;

    const results: Array<{ creatorId: string; status: string; amountCents?: number; error?: string }> = [];

    for (const creator of creators ?? []) {
      // claim_creator_payout returns zero rows when the creator is under
      // threshold - that's an expected, common outcome, not an error, so
      // maybeSingle() (not single(), which throws on zero rows) is required
      // here.
      const { data: claim, error: claimError } = await supabaseAdmin
        .rpc('claim_creator_payout', {
          p_creator_id: creator.id,
          p_min_cents: PAYOUT_THRESHOLD_CENTS
        })
        .maybeSingle();
      if (claimError) throw claimError;

      const claimed = claim as { payout_id: string | null; amount_cents: number | null } | null;
      if (!claimed?.payout_id || !claimed.amount_cents) {
        results.push({ creatorId: creator.id, status: 'below_threshold' });
        continue;
      }

      try {
        const transfer = await stripe.transfers.create({
          amount: claimed.amount_cents,
          currency: 'usd',
          destination: creator.stripe_account_id as string,
          metadata: { payout_id: claimed.payout_id }
        });

        const { error: updateError } = await supabaseAdmin
          .from('payouts')
          .update({ status: 'paid', stripe_transfer_id: transfer.id })
          .eq('id', claimed.payout_id);
        if (updateError) throw updateError;

        results.push({ creatorId: creator.id, status: 'paid', amountCents: claimed.amount_cents });
      } catch (transferError) {
        // The claim already happened (rows are stamped with this payout_id),
        // so on a Stripe failure this is marked failed for manual review
        // rather than silently retried - retrying blind here risks a
        // double-transfer if the failure was actually a delivery issue
        // rather than a real decline.
        await supabaseAdmin.from('payouts').update({ status: 'failed' }).eq('id', claimed.payout_id);
        results.push({
          creatorId: creator.id,
          status: 'failed',
          error: transferError instanceof Error ? transferError.message : 'Unknown error'
        });
      }
    }

    return json({ swept: results.length, results });
  } catch (error) {
    console.error('sweep-creator-payouts error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
