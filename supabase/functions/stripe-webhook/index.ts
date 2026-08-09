import { stripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

// Public endpoint - Stripe calls this directly, not through an authenticated
// app user, so this function has verify_jwt disabled (see supabase/config.toml).
// It is the sole authority for marking a tip as succeeded or a creator's
// payout status as enabled - never trust a client-side redirect for either.
//
// Two Stripe event destinations point at this same URL, each with its own
// signing secret: a "Your account" scoped destination for
// checkout.session.completed (Checkout Sessions are created with the
// platform's own key, not in a connected-account context), and a
// "Connected accounts" scoped destination for the v1 account.updated event
// (which Stripe routes to that scope specifically for Connect platforms).
// Try each configured secret in turn since a single request only matches one.

const webhookSecrets = [Deno.env.get('STRIPE_WEBHOOK_SECRET'), Deno.env.get('STRIPE_WEBHOOK_SECRET_CONNECT')].filter(
  (secret): secret is string => Boolean(secret)
);
if (webhookSecrets.length === 0) {
  throw new Error('Missing STRIPE_WEBHOOK_SECRET / STRIPE_WEBHOOK_SECRET_CONNECT secrets');
}

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const rawBody = await req.text();

  let event;
  for (const secret of webhookSecrets) {
    try {
      // Async variant required in Deno - the sync constructEvent depends on
      // Node's crypto module, which isn't available in the edge runtime.
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
      break;
    } catch {
      // try the next secret
    }
  }
  if (!event) {
    console.error('Webhook signature verification failed against all configured secrets');
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as {
          metadata?: { tip_id?: string; purchase_id?: string };
          payment_intent?: string | null;
        };
        const tipId = session.metadata?.tip_id;
        const purchaseId = session.metadata?.purchase_id;
        if (tipId) {
          const { error } = await supabaseAdmin
            .from('tips')
            .update({
              status: 'succeeded',
              stripe_payment_intent_id: session.payment_intent ?? null
            })
            .eq('id', tipId);
          if (error) throw error;
        } else if (purchaseId) {
          const { error } = await supabaseAdmin
            .from('purchases')
            .update({
              status: 'succeeded',
              stripe_payment_intent_id: session.payment_intent ?? null
            })
            .eq('id', purchaseId);
          if (error) throw error;
        }
        break;
      }

      case 'account.updated': {
        const account = event.data.object as { id: string; payouts_enabled?: boolean };
        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ stripe_payouts_enabled: account.payouts_enabled ?? false })
          .eq('stripe_account_id', account.id);
        if (error) throw error;
        break;
      }

      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return new Response('Webhook handler error', { status: 500 });
  }
});
