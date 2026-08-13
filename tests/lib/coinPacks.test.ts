import { describe, it, expect } from 'vitest';
import { COIN_PACKS } from '../../lib/coinPacks';

// Display-only mirror of the price authority in
// supabase/functions/create-coin-checkout/index.ts - these guards exist so
// a typo here (e.g. a pack showing more coins than it actually charges for)
// fails a test instead of quietly shipping a pricing bug.
describe('COIN_PACKS', () => {
  it('has a unique, non-empty id for every pack', () => {
    const ids = COIN_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id.length).toBeGreaterThan(0));
  });

  it('never shows more base coins than 1 coin = 1 cent implies (bonus coins must be tracked separately)', () => {
    COIN_PACKS.forEach((pack) => {
      expect(pack.coins - pack.bonusCoins).toBe(pack.amountCents);
    });
  });

  it('is priced in strictly increasing order', () => {
    for (let i = 1; i < COIN_PACKS.length; i++) {
      expect(COIN_PACKS[i].amountCents).toBeGreaterThan(COIN_PACKS[i - 1].amountCents);
    }
  });
});
