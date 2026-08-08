import { supabase } from './supabaseClient';

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function startStripeOnboarding(): Promise<string> {
  const { url } = await invoke<{ url: string }>('connect-onboarding', {
    action: 'start',
    origin: window.location.origin
  });
  return url;
}

export async function syncStripeOnboardingStatus(): Promise<boolean> {
  const { payoutsEnabled } = await invoke<{ payoutsEnabled: boolean }>('connect-onboarding', {
    action: 'sync'
  });
  return payoutsEnabled;
}

export async function createTipCheckout(bookId: string, amountCents: number): Promise<string> {
  const { url } = await invoke<{ url: string }>('create-tip-checkout', {
    bookId,
    amountCents,
    origin: window.location.origin
  });
  return url;
}

export async function getBookTipEligibility(bookId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('books')
    .select('id, profiles!inner(stripe_payouts_enabled)')
    .eq('id', bookId)
    .maybeSingle();

  if (error) throw error;
  const embedded = data?.profiles as { stripe_payouts_enabled: boolean } | { stripe_payouts_enabled: boolean }[] | undefined;
  if (!embedded) return false;
  const profile = Array.isArray(embedded) ? embedded[0] : embedded;
  return profile?.stripe_payouts_enabled ?? false;
}
