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

// Tipping is now universal for any book with a creator - a creator who
// hasn't finished Stripe Connect onboarding still receives coin-tips, just
// held until the daily payout sweep can pay them out (see
// spend_coins_for_tip and the held_for_creator column). This just confirms
// the book is real.
export async function getBookTipEligibility(bookId: string): Promise<boolean> {
  const { data, error } = await supabase.from('books').select('creator_id').eq('id', bookId).maybeSingle();
  if (error) throw error;
  return Boolean(data?.creator_id);
}

// Spends OraCoins directly against the caller's own wallet - a single
// atomic Postgres function (see spend_coins_for_tip in db/schema.sql), no
// Stripe call and no redirect. Throws with a message safe to show the
// reader (e.g. "Insufficient OraCoin balance").
export async function tipWithCoins(bookId: string, amountCoins: number): Promise<void> {
  const { error } = await supabase.rpc('spend_coins_for_tip', {
    p_book_id: bookId,
    p_amount_coins: amountCoins
  });
  if (error) throw new Error(error.message);
}

export async function createCoinCheckout(packId: string): Promise<string> {
  const { url } = await invoke<{ url: string }>('create-coin-checkout', {
    packId,
    origin: window.location.origin
  });
  return url;
}

export async function getMyWalletBalance(userId: string): Promise<number> {
  const { data, error } = await supabase.from('wallets').select('coin_balance').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.coin_balance ?? 0;
}

export interface CreatorPayout {
  id: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  status: string;
}

export async function listMyPayouts(creatorId: string): Promise<CreatorPayout[]> {
  const { data, error } = await supabase
    .from('payouts')
    .select('id, period_start, period_end, amount_cents, status')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    amountCents: row.amount_cents,
    status: row.status
  }));
}

// Sum of earnings not yet swept into a real Stripe transfer - see
// claim_creator_payout in db/schema.sql, which is the only thing that ever
// sets payout_id. Read-only for display; the sweep is the sole writer.
export async function getMyPendingPayoutCents(creatorId: string): Promise<number> {
  const [tipsResult, purchasesResult] = await Promise.all([
    supabase
      .from('tips')
      .select('amount_cents, platform_fee_cents')
      .eq('creator_id', creatorId)
      .eq('status', 'succeeded')
      .eq('held_for_creator', true)
      .is('payout_id', null),
    supabase
      .from('purchases')
      .select('amount_cents, platform_fee_cents, books!inner(creator_id)')
      .eq('books.creator_id', creatorId)
      .eq('status', 'succeeded')
      .eq('held_for_creator', true)
      .is('payout_id', null)
  ]);
  if (tipsResult.error) throw tipsResult.error;
  if (purchasesResult.error) throw purchasesResult.error;

  const sum = (rows: { amount_cents: number; platform_fee_cents: number }[] | null) =>
    (rows ?? []).reduce((total, row) => total + (row.amount_cents - row.platform_fee_cents), 0);

  return sum(tipsResult.data) + sum(purchasesResult.data);
}
