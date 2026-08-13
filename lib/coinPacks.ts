// Display-only mirror of supabase/functions/create-coin-checkout's PACKS
// table - the server is the price authority; this just needs to stay in
// sync so the UI shows the same numbers the checkout will actually charge.
// 1 OraCoin = 1 US cent.
export interface CoinPack {
  id: string;
  amountCents: number;
  coins: number;
  bonusCoins: number;
}

export const COIN_PACKS: CoinPack[] = [
  { id: 'pack_500', amountCents: 500, coins: 500, bonusCoins: 0 },
  { id: 'pack_1000', amountCents: 1000, coins: 1000, bonusCoins: 0 },
  { id: 'pack_2500', amountCents: 2500, coins: 2600, bonusCoins: 100 },
  { id: 'pack_5000', amountCents: 5000, coins: 5500, bonusCoins: 500 }
];
