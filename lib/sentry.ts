import * as Sentry from '@sentry/react';

// No Sentry project exists yet - this initializes for real once
// VITE_SENTRY_DSN is set (client-safe, same trust tier as
// VITE_SUPABASE_ANON_KEY) and is a harmless no-op until then, so this code
// can ship ahead of the account being created rather than blocking on it.
const dsn = import.meta.env.VITE_SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false
  });
}

export { Sentry };
