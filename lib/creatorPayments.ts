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

// Tipping is now universal for any book with a creator - a creator who
// hasn't finished Stripe Connect onboarding still receives tips, just held
// on the platform's own balance until they connect (see create-tip-checkout
// and the held_for_creator column). This just confirms the book is real.
export async function getBookTipEligibility(bookId: string): Promise<boolean> {
  const { data, error } = await supabase.from('books').select('creator_id').eq('id', bookId).maybeSingle();
  if (error) throw error;
  return Boolean(data?.creator_id);
}
