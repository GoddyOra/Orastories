import * as Sentry from 'npm:@sentry/deno@10';

// No Sentry project exists yet - this initializes for real once the
// SENTRY_DSN secret is set (`supabase secrets set SENTRY_DSN=...`, kept
// separate from the client's VITE_SENTRY_DSN) and is a harmless no-op until
// then, so this code can ship ahead of the account being created.
const dsn = Deno.env.get('SENTRY_DSN');

if (dsn) {
  Sentry.init({ dsn, sendDefaultPii: false });
}

// Money-handling functions (stripe-webhook, create-coin-checkout,
// create-purchase-checkout, sweep-creator-payouts) call this from their
// catch blocks so a real production failure surfaces somewhere other than
// "a user eventually complains" - see the site rating's "no error
// monitoring" finding.
export function reportError(error: unknown, context?: Record<string, unknown>) {
  console.error(error);
  if (!dsn) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
