'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/omni/primitives';
import { buildLots, type LedgerTx, type LedgerType } from '@/lib/math/lots';
import { classifyPosition, financialYear, type TaxCategory } from '@/lib/math/tax';
import { formatINR, formatINRCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { addTransactionAction, deleteTransactionAction, seedLedgerAction } from '@/app/portfolio/ledger/actions';

export interface LedgerPosition {
  key: string;
  holdingId: string | null;
  accountId: string;
  instrumentId: string;
  accountName: string;
  symbol: string;
  name: string;
  category: TaxCategory;
  units: number;
  averageCost: number;
  firstPurchased: string | null;
  price: number | null;
  transactions: LedgerTx[];
}

const inr = (x: number) => formatINRCompact(Math.round(x));
const dateLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const TYPE_LABEL: Record<LedgerType, string> = { BUY: 'Buy', SELL: 'Sell', BONUS: 'Bonus', SPLIT: 'Split' };

export function LedgerView({ positions, asOf }: { positions: LedgerPosition[]; asOf: string }) {
  const [selectedKey, setSelectedKey] = useState(positions[0]?.key ?? null);
  const selected = positions.find((p) => p.key === selectedKey) ?? null;
  const fy = financialYear(asOf);

  // Realised gains this financial year across every ledger.
  const realisedThisYear = useMemo(
    () =>
      positions.flatMap((p) =>
        buildLots(p.transactions).realized
          .filter((r) => financialYear(r.sellDate) === fy)
          .map((r) => ({ p, r }))
      ),
    [positions, fy]
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portfolio" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Portfolio
        </Link>
        <PageHeader
          eyebrow="Transaction ledger"
          title="Every buy and sell, lot by lot."
          question="Record purchases in instalments, sales, bonuses and splits. Units, average cost, holding periods and capital-gains tax are worked out from the lots (first in, first out)."
        />
      </div>

      {realisedThisYear.length > 0 && (
        <Card className="p-5 text-sm">
          <p className="font-medium">Gains realised in {fy}: {inr(realisedThisYear.reduce((s, x) => s + x.r.gain, 0))}</p>
          <p className="mt-1 text-muted-foreground">These count against this year&rsquo;s ₹1.25 lakh long-term exemption in the Tax Centre automatically.</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit p-2">
          <ul className="space-y-0.5">
            {positions.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => setSelectedKey(p.key)}
                  aria-current={p.key === selectedKey}
                  className={cn('flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm', p.key === selectedKey ? 'bg-accent font-medium' : 'hover:bg-accent/60')}
                >
                  <span>
                    {p.symbol}
                    {p.units === 0 && <span className="ml-1.5 text-[10px] text-muted-foreground">sold</span>}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{p.transactions.length ? `${p.transactions.length} txn` : 'no ledger'}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {selected ? <PositionLedger key={selected.key} p={selected} asOf={asOf} /> : <Card className="p-6 text-sm text-muted-foreground">Add holdings on the Portfolio page first.</Card>}
      </div>
    </div>
  );
}

function PositionLedger({ p, asOf }: { p: LedgerPosition; asOf: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const state = useMemo(() => buildLots(p.transactions), [p.transactions]);
  const hasLedger = p.transactions.length > 0;
  const units = hasLedger ? state.units : p.units;
  const avg = hasLedger ? state.averageCost : p.averageCost;

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{p.symbol}</h2>
            <p className="text-sm text-muted-foreground">{p.name}{p.accountName ? ` · ${p.accountName}` : ''}</p>
          </div>
          <dl className="grid grid-cols-3 gap-4 text-right text-sm">
            <div><dt className="text-[11px] text-muted-foreground">Units</dt><dd className="tnum font-medium">{units.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">Average cost</dt><dd className="tnum font-medium">{formatINR(avg)}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">Price</dt><dd className="tnum font-medium">{p.price != null ? formatINR(p.price) : '—'}</dd></div>
          </dl>
        </div>
        {!hasLedger && p.holdingId && (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p>
              This holding is tracked as a single purchase{p.firstPurchased ? ` on ${dateLabel(p.firstPurchased)}` : ''}. Start a ledger to record each buy and
              sell separately.
            </p>
            {p.firstPurchased ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => seedLedgerAction(p.holdingId as string))}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {pending && <Loader2 className="size-3 animate-spin" />}Start ledger from current position
              </button>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Add its purchase date in the <Link href="/tax" className="text-primary hover:underline">Tax Centre</Link> first, or record the purchases below.
              </p>
            )}
          </div>
        )}
        {state.errors.length > 0 && <p className="mt-3 text-sm text-danger">{state.errors.join('; ')}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      </Card>

      <AddTransaction p={p} asOf={asOf} pending={pending} onAdd={(tx) => run(() => addTransactionAction(tx))} />

      {hasLedger && (
        <Card className="overflow-x-auto p-6">
          <h3 className="font-semibold">Transactions</h3>
          <table className="mt-3 w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Date</th><th className="py-2 font-medium">Type</th><th className="py-2 text-right font-medium">Quantity</th><th className="py-2 text-right font-medium">Price</th><th className="py-2 text-right font-medium">Charges</th><th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {[...p.transactions].sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
                <tr key={t.id} className="border-b border-border/60">
                  <td className="py-2">{dateLabel(t.date)}</td>
                  <td className="py-2">{TYPE_LABEL[t.type]}</td>
                  <td className="py-2 text-right tnum">{t.type === 'SPLIT' ? `×${t.quantity}` : t.quantity.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</td>
                  <td className="py-2 text-right tnum">{t.type === 'BUY' || t.type === 'SELL' ? formatINR(t.price) : '—'}</td>
                  <td className="py-2 text-right tnum">{t.charges ? formatINR(t.charges) : '—'}</td>
                  <td className="py-2 text-right">
                    <button type="button" disabled={pending} onClick={() => run(() => deleteTransactionAction(t.id))} aria-label={`Delete ${TYPE_LABEL[t.type]} on ${dateLabel(t.date)}`} className="text-muted-foreground hover:text-danger">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {hasLedger && state.open.length > 0 && (
        <Card className="overflow-x-auto p-6">
          <h3 className="font-semibold">Open lots</h3>
          <p className="mt-1 text-xs text-muted-foreground">Each lot has its own holding period, so part of a holding can be long-term while the rest is still short-term.</p>
          <table className="mt-3 w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Bought</th><th className="py-2 text-right font-medium">Units</th><th className="py-2 text-right font-medium">Cost / unit</th><th className="py-2 text-right font-medium">Gain</th><th className="py-2 pl-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {state.open.map((l, i) => {
                const pos = p.price != null ? classifyPosition({ id: String(i), symbol: p.symbol, name: p.name, category: p.category, purchaseDate: l.buyDate, units: l.units, costPerUnit: l.costPerUnit, price: p.price }, asOf) : null;
                return (
                  <tr key={`${l.sourceId}-${i}`} className="border-b border-border/60">
                    <td className="py-2">{dateLabel(l.buyDate)}</td>
                    <td className="py-2 text-right tnum">{l.units.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</td>
                    <td className="py-2 text-right tnum">{formatINR(l.costPerUnit)}</td>
                    <td className={cn('py-2 text-right tnum', pos && pos.gain >= 0 ? 'text-success' : 'text-danger')}>{pos ? inr(pos.gain) : '—'}</td>
                    <td className="py-2 pl-4 text-xs text-muted-foreground">{pos?.term === 'long' ? 'Long-term' : pos?.term === 'short' ? `Short-term · long-term in ${pos.daysToLongTerm} days` : pos?.excludedReason ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {state.realized.length > 0 && (
        <Card className="overflow-x-auto p-6">
          <h3 className="font-semibold">Realised gains</h3>
          <table className="mt-3 w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Sold</th><th className="py-2 font-medium">Bought</th><th className="py-2 text-right font-medium">Units</th><th className="py-2 text-right font-medium">Gain</th><th className="py-2 pl-4 font-medium">Term · year</th>
              </tr>
            </thead>
            <tbody>
              {state.realized.map((r, i) => {
                const pos = classifyPosition({ id: String(i), symbol: p.symbol, name: p.name, category: p.category, purchaseDate: r.buyDate, units: r.units, costPerUnit: r.cost / r.units, price: r.proceeds / r.units }, r.sellDate);
                return (
                  <tr key={`${r.sellId}-${i}`} className="border-b border-border/60">
                    <td className="py-2">{dateLabel(r.sellDate)}</td>
                    <td className="py-2">{dateLabel(r.buyDate)}</td>
                    <td className="py-2 text-right tnum">{r.units.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</td>
                    <td className={cn('py-2 text-right tnum', r.gain >= 0 ? 'text-success' : 'text-danger')}>{inr(r.gain)}</td>
                    <td className="py-2 pl-4 text-xs text-muted-foreground">{pos.term === 'long' ? 'Long-term' : 'Short-term'} · {financialYear(r.sellDate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function AddTransaction({ p, asOf, pending, onAdd }: { p: LedgerPosition; asOf: string; pending: boolean; onAdd: (tx: { accountId: string; instrumentId: string; type: LedgerType; date: string; quantity: number; price: number; charges: number }) => void }) {
  const [type, setType] = useState<LedgerType>('BUY');
  const [date, setDate] = useState(asOf);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [charges, setCharges] = useState('');
  const priced = type === 'BUY' || type === 'SELL';
  return (
    <Card className="p-6">
      <h3 className="font-semibold">Add a transaction</h3>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-[repeat(5,minmax(0,1fr))_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd({ accountId: p.accountId, instrumentId: p.instrumentId, type, date, quantity: Number(quantity), price: priced ? Number(price) : 0, charges: priced ? Number(charges || 0) : 0 });
        }}
      >
        <label className="text-xs text-muted-foreground">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as LedgerType)} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground">
            {(Object.keys(TYPE_LABEL) as LedgerType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Date
          <input type="date" required max={asOf} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">
          {type === 'SPLIT' ? 'Split ratio (2 = 1:2)' : type === 'BONUS' ? 'Bonus units received' : 'Units'}
          <input type="number" required min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground tnum" />
        </label>
        <label className={cn('text-xs text-muted-foreground', !priced && 'opacity-40')}>
          Price per unit (₹)
          <input type="number" min="0" step="any" disabled={!priced} required={priced} value={priced ? price : ''} onChange={(e) => setPrice(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground tnum" />
        </label>
        <label className={cn('text-xs text-muted-foreground', !priced && 'opacity-40')}>
          Charges (₹)
          <input type="number" min="0" step="any" disabled={!priced} value={priced ? charges : ''} onChange={(e) => setCharges(e.target.value)} placeholder="0" className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground tnum" />
        </label>
        <button type="submit" disabled={pending || !quantity} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Add
        </button>
      </form>
    </Card>
  );
}
