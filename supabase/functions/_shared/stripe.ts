import Stripe from 'npm:stripe@22';

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY secret');
}

// Deno has no node:http - Stripe's default Node http client breaks silently
// in the edge runtime, so the fetch-based client is required here.
export const stripe = new Stripe(stripeSecretKey, {
  httpClient: Stripe.createFetchHttpClient()
});
