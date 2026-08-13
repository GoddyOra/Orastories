import { supabaseAdmin } from './supabaseAdmin.ts';

const DAILY_LIMIT = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000;

// Supabase's own edge gateway sets x-forwarded-for in front of this
// function - unlike a self-hosted server with no trusted proxy in front of
// it, a calling client can't simply forge this header to dodge the IP-based
// half of the check below.
export function getClientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (!xff) return null;
  return xff.split(',')[0].trim() || null;
}

async function countSince(table: 'purchases' | 'coin_purchases', column: 'buyer_id' | 'ip_address', value: string, since: string) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
    .gte('created_at', since);
  if (error) throw error;
  return count ?? 0;
}

// Counts real-money checkout *attempts* (rows are inserted at Checkout
// Session creation time, before the card is even charged, so this catches
// rapid-fire attempts including ones that fail or are abandoned - the
// actual card-testing pattern) across both purchases and coin_purchases,
// since both are live Stripe charges and share the same fraud surface.
// This is a straightforward velocity cap, not real fraud infrastructure -
// see the plan notes on Stripe Radar as the complementary layer for
// VPN/multi-account abuse this can't reliably catch on its own.
export async function assertUnderDailyLimit(userId: string, ip: string | null): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const userCounts = await Promise.all([
    countSince('purchases', 'buyer_id', userId, since),
    countSince('coin_purchases', 'buyer_id', userId, since)
  ]);
  if (userCounts[0] + userCounts[1] >= DAILY_LIMIT) {
    throw new Error("You've reached today's transaction limit. Please try again tomorrow.");
  }

  if (!ip) return;
  const ipCounts = await Promise.all([
    countSince('purchases', 'ip_address', ip, since),
    countSince('coin_purchases', 'ip_address', ip, since)
  ]);
  if (ipCounts[0] + ipCounts[1] >= DAILY_LIMIT) {
    throw new Error("You've reached today's transaction limit. Please try again tomorrow.");
  }
}
