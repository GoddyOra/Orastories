import React, { useState } from 'react';
import { COIN_PACKS } from '../lib/coinPacks';
import { createCoinCheckout } from '../lib/creatorPayments';

interface WalletProps {
  isLight: boolean;
  balance: number;
}

const Wallet: React.FC<WalletProps> = ({ isLight, balance }) => {
  const [buyingPackId, setBuyingPackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textMuted = isLight ? 'text-gray-500' : 'text-gray-400';
  const cardBg = isLight ? 'bg-white border-black/10' : 'bg-[#161616] border-white/10';

  const handleBuy = async (packId: string) => {
    setError(null);
    setBuyingPackId(packId);
    try {
      const url = await createCoinCheckout(packId);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBuyingPackId(null);
    }
  };

  return (
    <section className="mb-14">
      <h2 className={`text-xs uppercase tracking-[0.3em] mb-5 ${textMuted}`}>OraCoins Wallet</h2>
      <div className={`rounded-sm border p-6 mb-5 ${cardBg}`}>
        <p className={`text-[10px] uppercase tracking-[0.2em] mb-1 ${textMuted}`}>Current Balance</p>
        <p className="text-3xl font-['Playfair_Display'] font-bold text-amber-700">{balance.toLocaleString()} <span className="text-base font-normal">OraCoins</span></p>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {COIN_PACKS.map((pack) => (
          <button
            key={pack.id}
            onClick={() => handleBuy(pack.id)}
            disabled={buyingPackId !== null}
            className={`rounded-sm border p-4 text-center transition-all hover:border-amber-700 disabled:opacity-40 ${cardBg}`}
          >
            <p className="text-lg font-bold text-amber-700">${(pack.amountCents / 100).toFixed(0)}</p>
            <p className={`text-xs mt-1 ${textMuted}`}>{pack.coins.toLocaleString()} coins</p>
            {pack.bonusCoins > 0 && <p className="text-[10px] mt-1 text-amber-600">+{pack.bonusCoins} bonus</p>}
            {buyingPackId === pack.id && <p className="text-[10px] mt-2 text-amber-700">Redirecting...</p>}
          </button>
        ))}
      </div>
    </section>
  );
};

export default Wallet;
