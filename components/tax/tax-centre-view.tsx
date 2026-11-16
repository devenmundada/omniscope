'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { CalendarClock, Hourglass, Leaf, Loader2, Receipt, Scissors, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/omni/primitives';
import { StaggerContainer, StaggerItem } from '@/components/omni/page-transition';
import type { TaxCentreData } from '@/lib/db/tax';
import {
  BUCKET_LABELS,
  CATEGORY_LABELS,
  TAX_RULES,
  classifyPosition,
  computeTax,
  daysBetween,
  lossHarvest,
  ltcgHarvestPlan,
  waitToSave,
  type Bucket,
  type TaxPosition,
} from '@/lib/math/tax';
import { formatINRCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { setPurchaseDateAction } from '@/app/tax/actions';

const SLABS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
const inr = (x: number) => formatINRCompact(Math.round(x));
const dateLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function heldFor(from: string, to: string) {
  const days = daysBetween(from, to);
  if (days < 60) return `${days} days`;
  const months = Math.floor(days / 30.44);
  return months < 24 ? `${months} months` : `${(days / 365.25).toFixed(1)} years`;
}

export function TaxCentreView({ data }: { data: TaxCentreData }) {
  const [slabRate, setSlabRate] = useState(data.defaultSlabRate);
  const [booked, setBooked] = useState(0);
  const opts = useMemo(() => ({ slabRate, ltcgAlreadyBooked: booked }), [slabRate, booked]);

  const positions = useMemo(() => data.holdings.map((h) => classifyPosition(h, data.asOf)), [data]);
  const dated = positions.filter((p) => p.bucket);
  const undated = positions.filter((p) => p.excludedReason === 'Purchase date needed');
  const tax = useMemo(() => computeTax(dated, opts), [dated, opts]);
  const harvest = useMemo(() => ltcgHarvestPlan(dated, tax.exemptionLeft + tax.exemptionUsed), [dated, tax]);
  const waits = useMemo(() => waitToSave(dated, opts), [dated, opts]);
  const losses = useMemo(() => lossHarvest(dated, opts), [dated, opts]);
  const netGain = dated.reduce((s, p) => s + p.gain, 0);
  const exemptionLeft = Math.max(0, TAX_RULES.ltcgExemption - booked);

  return (
    <StaggerContainer>
      <StaggerItem>
        <PageHeader
          eyebrow={`Tax Centre · ${data.financialYear}`}
          title="What would you owe if you sold today?"
          question="Capital-gains tax on every holding under the rules in force since 23 July 2024, and three legal ways to owe less."
        />
      </StaggerItem>

      {undated.length > 0 && (
        <StaggerItem className="mb-6">
          <MissingDates positions={undated} asOf={data.asOf} total={positions.length} />
        </StaggerItem>
      )}

      <StaggerItem>
        <Card className="flex flex-wrap items-end gap-6 p-5">
          <label className="text-sm">
            <span className="block text-xs text-muted-foreground">Your income-tax slab</span>
            <select
              value={slabRate}
              onChange={(e) => setSlabRate(Number(e.target.value))}
              className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {SLABS.map((s) => (
                <option key={s} value={s}>{Math.round(s * 100)}%</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {data.slabSource === 'profile'
                ? `Estimated from your profile income (₹${Math.round((data.annualIncome ?? 0) / 100_000 * 10) / 10} L a year, new regime)`
                : 'Assumed; add your income on the Profile page'}
            </span>
          </label>
          <label className="text-sm">
            <span className="block text-xs text-muted-foreground">Long-term equity gains already booked in {data.financialYear}</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={booked || ''}
              placeholder="0"
              onChange={(e) => setBooked(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-44 rounded-lg border border-border bg-background px-3 py-2 text-sm tnum"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">Uses up part of the ₹1.25 L yearly exemption</span>
          </label>
        </Card>
      </StaggerItem>

      <StaggerItem className="mt-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={<Wallet className="size-4" />} label="Unrealised gain" value={inr(netGain)} hint={`On ${dated.length} of ${positions.length} holdings with dates`} tone={netGain >= 0 ? 'good' : 'bad'} />
          <Kpi icon={<Receipt className="size-4" />} label="Tax if you sold everything today" value={inr(tax.totalTax)} hint="Including 4% cess, after loss set-off" tone="bad" />
          <Kpi icon={<Leaf className="size-4" />} label="Tax-free gains left this year" value={inr(exemptionLeft)} hint={`Of the ₹1.25 L long-term equity exemption`} tone="good" />
          <Kpi
            icon={<Scissors className="size-4" />}
            label="Tax you could save"
            value={inr(harvest.futureTaxSaved + waits.reduce((s, w) => s + w.saving, 0))}
            hint="Gain harvesting plus waiting for long-term status"
            tone="good"
          />
        </div>
      </StaggerItem>

      <StaggerItem className="mt-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <Opportunity
            icon={<Leaf className="size-4" />}
            title={harvest.gainBooked > 0 ? `Book ${inr(harvest.gainBooked)} of gains tax-free` : 'Gain harvesting'}
            empty={harvest.suggestions.length === 0 ? 'No long-term equity gains to harvest right now, or the exemption is used up.' : null}
          >
            <ul className="space-y-2">
              {harvest.suggestions.map((s) => (
                <li key={s.position.id} className="text-sm">
                  Sell and rebuy <span className="font-medium tnum">{s.units < 10 ? s.units.toFixed(2) : Math.floor(s.units)}</span> units of{' '}
                  <span className="font-medium">{s.position.symbol}</span> ({inr(s.saleValue)}), booking {inr(s.gainBooked)}.
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              No tax is due because the gain falls inside the yearly exemption, and the higher cost basis saves about{' '}
              {inr(harvest.futureTaxSaved)} on a future sale. India has no specific wash-sale rule, but check exit loads and brokerage first.
            </p>
          </Opportunity>

          <Opportunity
            icon={<Hourglass className="size-4" />}
            title={waits.length ? `Wait to save ${inr(waits.reduce((s, w) => s + w.saving, 0))}` : 'Wait for long-term status'}
            empty={waits.length === 0 ? 'No short-term gains turn long-term in the next 120 days.' : null}
          >
            <ul className="space-y-2">
              {waits.map((w) => (
                <li key={w.position.id} className="text-sm">
                  <span className="font-medium">{w.position.symbol}</span> turns long-term in <span className="font-medium tnum">{w.days} days</span>: tax on a sale falls
                  from {inr(w.taxNow)} to {inr(w.taxIfLongTerm)}.
                </li>
              ))}
            </ul>
          </Opportunity>

          <Opportunity
            icon={<Scissors className="size-4" />}
            title={losses.length ? `${inr(losses.reduce((s, l) => s + l.loss, 0))} of losses you could use` : 'Loss harvesting'}
            empty={losses.length === 0 ? 'No holdings are below their cost right now.' : null}
          >
            <ul className="space-y-2">
              {losses.slice(0, 5).map((l) => (
                <li key={l.position.id} className="text-sm">
                  <span className="font-medium">{l.position.symbol}</span>: {inr(l.loss)} {l.position.term}-term loss, worth up to {inr(l.taxShield)} in tax.
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Booked losses offset this year&rsquo;s gains (long-term losses only against long-term gains) and carry forward for 8 years if you file
              your return on time.
            </p>
          </Opportunity>
        </div>
      </StaggerItem>

      <StaggerItem className="mt-4">
        <Card className="overflow-x-auto p-6">
          <h2 className="text-lg font-semibold tracking-tight">Holding by holding</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tax shown is for selling that holding on its own today, with the full exemption available.</p>
          <table className="mt-4 w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Holding</th>
                <th className="py-2 font-medium">Bought</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Gain</th>
                <th className="py-2 font-medium pl-4">Rule</th>
                <th className="py-2 text-right font-medium">Tax if sold</th>
              </tr>
            </thead>
            <tbody>
              {[...positions].sort((a, b) => b.value - a.value).map((p) => (
                <Row key={p.id} p={p} asOf={data.asOf} tax={p.bucket ? computeTax([p], { slabRate, ltcgAlreadyBooked: booked }).totalTax : null} />
              ))}
            </tbody>
          </table>
          {data.unpriced.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">Not shown (no verified price yet): {data.unpriced.map((u) => u.symbol).join(', ')}.</p>
          )}
        </Card>
      </StaggerItem>

      <StaggerItem className="mt-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="text-lg font-semibold tracking-tight">If you sold everything</h2>
            <table className="mt-4 w-full text-sm">
              <tbody>
                {(Object.keys(BUCKET_LABELS) as Bucket[]).map((b) => (
                  <tr key={b} className="border-b border-border/60">
                    <td className="py-2 text-muted-foreground">{b === 'slab' ? `Taxed at your slab rate (${Math.round(slabRate * 100)}%)` : BUCKET_LABELS[b]}</td>
                    <td className="py-2 text-right tnum">{inr(tax.taxable[b])}</td>
                    <td className="py-2 text-right tnum font-medium">{inr(tax.tax[b])}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-medium">Total tax (incl. 4% cess)</td>
                  <td />
                  <td className="py-2 text-right tnum font-semibold">{inr(tax.totalTax)}</td>
                </tr>
              </tbody>
            </table>
            {(tax.carryForward.shortTerm > 0 || tax.carryForward.longTerm > 0) && (
              <p className="mt-3 text-xs text-muted-foreground">
                Losses left to carry forward: {inr(tax.carryForward.shortTerm)} short-term, {inr(tax.carryForward.longTerm)} long-term.
              </p>
            )}
          </Card>
          <Card className="p-6 text-sm leading-relaxed text-muted-foreground">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Rules used ({TAX_RULES.label})</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>Listed shares, equity funds and equity ETFs: 20% if held 12 months or less; 12.5% after that on gains above ₹1.25 lakh a year.</li>
              <li>Gold ETFs and Sovereign Gold Bonds sold on the exchange: 12.5% after 12 months, your slab rate before. Gold Bonds redeemed with RBI are tax-free.</li>
              <li>International fund-of-funds: 12.5% after 24 months, slab rate before. Debt funds bought from April 2023: always slab rate.</li>
              <li>Fixed-deposit interest is income, taxed at your slab every year, so it is not part of this estimate.</li>
              <li>4% cess is included; surcharge for incomes above ₹50 lakh and pre-2018 grandfathering are not. Holding periods use each holding&rsquo;s first purchase date.</li>
            </ul>
            <p className="mt-3 text-xs">An estimate for planning, not tax advice. Confirm with a chartered accountant before acting.</p>
          </Card>
        </div>
      </StaggerItem>
    </StaggerContainer>
  );
}

function Row({ p, asOf, tax }: { p: TaxPosition; asOf: string; tax: number | null }) {
  let status: ReactNode;
  if (p.excludedReason === 'Purchase date needed') status = <Badge tone="warn">Date needed</Badge>;
  else if (p.excludedReason) status = <Badge tone="muted">Not capital gains</Badge>;
  else if (p.term === 'long') status = <Badge tone="good">Long-term</Badge>;
  else if (p.bucket === 'slab' && p.category === 'debt_fund') status = <Badge tone="muted">Slab always</Badge>;
  else status = <Badge tone="warn">Short-term · {p.daysToLongTerm}d to go</Badge>;
  return (
    <tr className="border-b border-border/60 align-top">
      <td className="py-2.5">
        <span className="font-medium text-foreground">{p.symbol}</span>
        <span className="block text-xs text-muted-foreground">{CATEGORY_LABELS[p.category]}</span>
      </td>
      <td className="py-2.5 text-muted-foreground">
        {p.purchaseDate ? (
          <>
            {dateLabel(p.purchaseDate)}
            <span className="block text-xs">{heldFor(p.purchaseDate, asOf)}</span>
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="py-2.5">{status}</td>
      <td className={cn('py-2.5 text-right tnum', p.gain >= 0 ? 'text-success' : 'text-danger')}>{inr(p.gain)}</td>
      <td className="py-2.5 pl-4 text-xs text-muted-foreground">
        {p.bucket ? (p.bucket === 'slab' ? 'Slab rate' : BUCKET_LABELS[p.bucket]) : p.excludedReason}
        {p.category === 'sgb' && <span className="block text-success">Tax-free if redeemed with RBI</span>}
      </td>
      <td className="py-2.5 text-right tnum font-medium">{tax == null ? '—' : inr(tax)}</td>
    </tr>
  );
}

function MissingDates({ positions, asOf, total }: { positions: TaxPosition[]; asOf: string; total: number }) {
  return (
    <Card className="border-warning/40 p-6">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 size-5 text-warning" aria-hidden />
        <div className="flex-1">
          <h2 className="font-semibold">Add purchase dates to unlock the estimate</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {positions.length} of {total} holdings have no purchase date, so their holding period (and tax rate) is unknown. Dates also switch on XIRR
            and your Wealth Journey timeline. If you bought in instalments, use the date of your first purchase.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {positions.map((p) => (
              <DateRow key={p.id} p={p} asOf={asOf} />
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function DateRow({ p, asOf }: { p: TaxPosition; asOf: string }) {
  const router = useRouter();
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      setError(null);
      const res = await setPurchaseDateAction(p.id, date);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
      <span className="min-w-24 flex-1 text-sm font-medium" title={p.name}>{p.symbol}</span>
      <input
        type="date"
        max={asOf}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        aria-label={`Purchase date for ${p.name}`}
      />
      <button
        type="button"
        onClick={save}
        disabled={!date || pending}
        className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending && <Loader2 className="size-3 animate-spin" />}Save
      </button>
      {error && <span className="w-full text-xs text-danger">{error}</span>}
    </li>
  );
}

function Opportunity({ icon, title, empty, children }: { icon: ReactNode; title: string; empty: string | null; children: ReactNode }) {
  return (
    <Card className="p-5">
      <p className="flex items-center gap-2 font-semibold">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        {title}
      </p>
      <div className="mt-3">{empty ? <p className="text-sm text-muted-foreground">{empty}</p> : children}</div>
    </Card>
  );
}

function Kpi({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: string; hint: string; tone?: 'good' | 'bad' }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={cn('font-serif text-2xl tnum tracking-tight', tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-foreground')}>{value}</span>
      <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span>
    </Card>
  );
}

function Badge({ tone, children }: { tone: 'good' | 'warn' | 'muted'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        tone === 'good' && 'border-success/30 bg-success-muted/40 text-success',
        tone === 'warn' && 'border-warning/30 bg-warning-muted/40 text-warning-foreground',
        tone === 'muted' && 'border-border bg-muted text-muted-foreground'
      )}
    >
      {children}
    </span>
  );
}
