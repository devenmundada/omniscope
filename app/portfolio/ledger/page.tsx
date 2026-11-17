import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { getUserHoldings } from '@/lib/db/portfolio';
import { getUserLedger } from '@/lib/db/transactions';
import { todayInIndia } from '@/lib/db/tax';
import { LedgerView, type LedgerPosition, type LedgerPrefill } from '@/components/portfolio/ledger-view';
import { taxCategoryFor } from '@/lib/math/tax';

export const metadata = { title: 'Transaction ledger — OmniScope' };
export const dynamic = 'force-dynamic';

const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

const TYPES = new Set(['BUY', 'SELL', 'BONUS', 'SPLIT']);

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ symbol?: string; type?: string; quantity?: string }> }) {
  const sp = await searchParams;
  const quantity = Number(sp.quantity);
  const prefill: LedgerPrefill | null =
    sp.symbol && sp.type && TYPES.has(sp.type) && Number.isFinite(quantity) && quantity > 0
      ? { symbol: sp.symbol, type: sp.type as LedgerPrefill['type'], quantity }
      : null;
  if (!isSupabaseConfigured()) redirect('/');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=%2Fportfolio%2Fledger');

  const [holdings, ledger] = await Promise.all([getUserHoldings(user.id), getUserLedger(user.id)]);
  const positions: LedgerPosition[] = holdings.map((h) => {
    const key = `${h.accountId}:${h.instrumentId}`;
    return {
      key,
      holdingId: h.id,
      accountId: h.accountId,
      instrumentId: h.instrumentId,
      accountName: h.accountName,
      symbol: h.symbol,
      name: h.name,
      category: taxCategoryFor(h.assetClass, h.sector, h.name),
      units: h.units,
      averageCost: h.averageAcquisitionCost,
      firstPurchased: h.firstPurchasedAt ? istDate(new Date(h.firstPurchasedAt)) : null,
      price: h.currentPrice,
      transactions: ledger.get(key) ?? [],
    };
  });
  // Fully sold positions keep their ledger (and realised gains) even though the holding is gone.
  for (const [key, txs] of ledger) {
    if (positions.some((p) => p.key === key)) continue;
    const t = txs[0];
    positions.push({
      key,
      holdingId: null,
      accountId: t.accountId,
      instrumentId: t.instrumentId,
      accountName: '',
      symbol: t.symbol,
      name: t.name,
      category: taxCategoryFor(t.assetClass, t.sector, t.name),
      units: 0,
      averageCost: 0,
      firstPurchased: null,
      price: null,
      transactions: txs,
    });
  }
  return <LedgerView positions={positions} asOf={todayInIndia()} prefill={prefill} />;
}
