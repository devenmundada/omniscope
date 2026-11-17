/**
 * Smart alerts: things in a user's own data that deserve attention now. Pure functions.
 *
 * Every alert is derived from figures the rest of the app already computes (tax lots, weights,
 * price history, goal simulations, the emergency fund), so each one links to the page that shows
 * the working. Ids are stable for the same situation, which lets a user dismiss an alert until the
 * situation changes (a new date, a new financial year, a new holding).
 */
import { TAX_RULES, financialYear, ltcgHarvestPlan, lossHarvest, waitToSave, type TaxOptions, type TaxPosition } from './tax';

export type AlertSeverity = 'act' | 'watch' | 'info';
export type AlertKind = 'tax' | 'risk' | 'goal' | 'safety' | 'data';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  kind: AlertKind;
  title: string;
  body: string;
  href: string;
  /** Rupee amount at stake, when there is one. */
  amountINR?: number;
  /** YYYY-MM-DD by which to act, when there is one. */
  dueDate?: string;
}

export interface AlertHolding {
  symbol: string;
  name: string;
  value: number;
  /** Share of the priced portfolio, 0..1. */
  weight: number;
  /** Latest close and the highest close of the last year, from price history. */
  last?: number | null;
  peak1y?: number | null;
  peakDate?: string | null;
}

export interface AlertGoal {
  name: string;
  /** Monte Carlo probability of reaching the target, 0..1. */
  probability: number | null;
  deadline: string;
}

/** A stock or ETF holding with the bonus- and split-adjusted close on its purchase date. */
export interface CostCheck {
  symbol: string;
  units: number;
  averageCost: number;
  purchaseDate: string;
  /** Adjusted close on (or just before) the purchase date. */
  adjustedClose: number;
  price: number;
}

/** Ratios of cost to adjusted price that a bonus or split leaves behind (1:1 bonus or 1:2 split = 2). */
const SPLIT_FACTORS = [1.5, 2, 3, 4, 5, 10];

/**
 * If the cost paid is a clean multiple of the adjusted price that day, the holding most likely
 * missed a bonus or split: the units are pre-action while today's price is post-action.
 */
export function unrecordedSplitFactor(averageCost: number, adjustedClose: number, tolerance = 0.08): number | null {
  if (!(averageCost > 0) || !(adjustedClose > 0)) return null;
  const r = averageCost / adjustedClose;
  return SPLIT_FACTORS.find((k) => Math.abs(r / k - 1) <= tolerance) ?? null;
}

function factorWords(k: number): string {
  if (k === 1.5) return 'a 1:2 bonus (one free share for every two)';
  if (Number.isInteger(k)) return `a ${k - 1}:1 bonus or a 1:${k} split`;
  return `a bonus or split (factor ${k})`;
}

export interface AlertInput {
  asOf: string;
  taxPositions: TaxPosition[];
  tax: TaxOptions;
  /** Tax already due on gains booked this year (makes loss harvesting worth doing now). */
  bookedTax: number;
  holdings: AlertHolding[];
  unpricedCount: number;
  latestPriceDate: string | null;
  goals: AlertGoal[];
  emergencyFundMonths: number | null;
  emergencyTargetMonths: number;
  costChecks?: CostCheck[];
}

export const ALERT_THRESHOLDS = {
  waitDays: 45,
  minWaitSaving: 500,
  minHarvestGain: 10_000,
  concentration: 0.25,
  drawdown: 0.2,
  goalAct: 0.5,
  goalWatch: 0.65,
  emergencyAct: 3,
  staleDays: 4,
} as const;

const SEVERITY_ORDER: Record<AlertSeverity, number> = { act: 0, watch: 1, info: 2 };
const rupees = (x: number) => `₹${Math.round(x).toLocaleString('en-IN')}`;
const pctText = (x: number) => `${Math.round(x * 100)}%`;
const dayMs = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** 31 March that ends the financial year containing `date`. */
export function financialYearEnd(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return `${m >= 4 ? y + 1 : y}-03-31`;
}

export function buildAlerts(input: AlertInput): Alert[] {
  const out: Alert[] = [];
  const fy = financialYear(input.asOf);
  const fyEnd = financialYearEnd(input.asOf);
  const daysToFyEnd = days(input.asOf, fyEnd);

  // Tax: short-term gains that turn long-term soon.
  for (const w of waitToSave(input.taxPositions, input.tax, ALERT_THRESHOLDS.waitDays)) {
    if (w.saving < ALERT_THRESHOLDS.minWaitSaving) continue;
    const p = w.position;
    out.push({
      id: `wait:${p.id}:${p.longTermOn}`,
      severity: 'watch',
      kind: 'tax',
      title: `Hold ${p.symbol} until ${longDate(p.longTermOn as string)}`,
      body: `It turns long-term in ${w.days} days. Selling before then would cost about ${rupees(w.saving)} more tax.`,
      href: '/tax',
      amountINR: Math.round(w.saving),
      dueDate: p.longTermOn as string,
    });
  }

  // Tax: unused long-term exemption (it does not carry forward).
  const exemptionLeft = Math.max(0, TAX_RULES.ltcgExemption - (input.tax.ltcgAlreadyBooked ?? 0));
  const harvest = ltcgHarvestPlan(input.taxPositions, exemptionLeft);
  if (harvest.gainBooked >= ALERT_THRESHOLDS.minHarvestGain) {
    out.push({
      id: `harvest:${fy}`,
      severity: daysToFyEnd <= 90 ? 'act' : 'info',
      kind: 'tax',
      title: daysToFyEnd <= 90 ? `${daysToFyEnd} days left to use your tax-free ₹1.25 lakh` : 'Your tax-free ₹1.25 lakh is unused',
      body: `Selling and rebuying to book ${rupees(harvest.gainBooked)} of long-term gains before 31 March costs no tax and saves about ${rupees(harvest.futureTaxSaved)} on a future sale. Unused allowance does not carry forward.`,
      href: '/tax',
      amountINR: Math.round(harvest.futureTaxSaved),
      dueDate: fyEnd,
    });
  }

  // Tax: losses that could cancel tax already due this year.
  if (input.bookedTax > 1) {
    const losses = lossHarvest(input.taxPositions, input.tax).filter((l) => l.taxShield >= 1000);
    if (losses.length) {
      const shield = Math.min(input.bookedTax, losses.reduce((s, l) => s + l.taxShield, 0));
      out.push({
        id: `loss:${fy}:${losses.map((l) => l.position.id).join(',')}`,
        severity: 'watch',
        kind: 'tax',
        title: `Losses could cancel up to ${rupees(shield)} of this year's tax`,
        body: `You owe about ${rupees(input.bookedTax)} on gains booked in ${fy}. Unrealised losses on ${losses.map((l) => l.position.symbol).join(', ')} could be booked before 31 March to set against them.`,
        href: '/tax',
        amountINR: Math.round(shield),
        dueDate: fyEnd,
      });
    }
  }

  // Risk: one holding too large, and sharp falls from the 1-year high.
  for (const h of input.holdings) {
    if (h.weight > ALERT_THRESHOLDS.concentration) {
      out.push({
        id: `conc:${h.symbol}`,
        severity: 'watch',
        kind: 'risk',
        title: `${h.symbol} is ${pctText(h.weight)} of your portfolio`,
        body: `More than ${pctText(ALERT_THRESHOLDS.concentration)} in one holding ties a large share of your wealth to a single outcome. The Risk Lab shows how much of your total risk it drives.`,
        href: '/risk',
        amountINR: Math.round(h.value),
      });
    }
    if (h.last != null && h.peak1y != null && h.peak1y > 0) {
      const fall = 1 - h.last / h.peak1y;
      if (fall >= ALERT_THRESHOLDS.drawdown) {
        out.push({
          id: `dd:${h.symbol}:${h.peakDate ?? ''}`,
          severity: 'watch',
          kind: 'risk',
          title: `${h.symbol} is ${pctText(fall)} below its 1-year high`,
          body: `It closed at ${rupees(h.last)}, against ${rupees(h.peak1y)}${h.peakDate ? ` on ${longDate(h.peakDate)}` : ''}. Worth checking whether the reason you bought it still holds; a fall alone is not a reason to sell.`,
          href: '/portfolio',
        });
      }
    }
  }

  // Goals with a low chance of success.
  for (const g of input.goals) {
    if (g.probability == null) continue;
    if (g.probability < ALERT_THRESHOLDS.goalWatch) {
      const act = g.probability < ALERT_THRESHOLDS.goalAct;
      out.push({
        id: `goal:${g.name}:${act ? 'act' : 'watch'}`,
        severity: act ? 'act' : 'watch',
        kind: 'goal',
        title: `${g.name}: ${pctText(g.probability)} chance of being met`,
        body: `Across 10,000 simulated markets, the goal is reached by ${longDate(g.deadline)} in ${pctText(g.probability)} of them. The goal optimiser shows the mix and SIP that would raise it.`,
        href: '/goals/optimiser',
        dueDate: g.deadline,
      });
    }
  }

  // Safety net.
  if (input.emergencyFundMonths != null && input.emergencyFundMonths < input.emergencyTargetMonths) {
    const act = input.emergencyFundMonths < ALERT_THRESHOLDS.emergencyAct;
    out.push({
      id: `emergency:${act ? 'act' : 'watch'}`,
      severity: act ? 'act' : 'watch',
      kind: 'safety',
      title: `Emergency fund covers ${input.emergencyFundMonths.toFixed(1)} months of expenses`,
      body: `The usual target is ${input.emergencyTargetMonths} months, kept somewhere safe and quick to withdraw, so a job loss or hospital bill never forces you to sell investments at a bad time.`,
      href: '/health',
    });
  }

  // Data quality: a bonus or split that was never recorded makes a gain look like a loss.
  for (const c of input.costChecks ?? []) {
    const k = unrecordedSplitFactor(c.averageCost, c.adjustedClose);
    if (!k) continue;
    const unitsNow = c.units * k;
    const cost = c.units * c.averageCost;
    const shownGain = c.units * c.price - cost;
    const realGain = unitsNow * c.price - cost;
    out.push({
      id: `split:${c.symbol}:${c.units}:${c.averageCost}`,
      severity: 'act',
      kind: 'data',
      title: `${c.symbol} looks like it is missing ${k === 1.5 ? 'a bonus' : 'a bonus or split'}`,
      body: `You paid ${rupees(c.averageCost)} a share on ${longDate(c.purchaseDate)}, but the adjusted price that day was ${rupees(c.adjustedClose)}, ${k}× less. That is what ${factorWords(k)} since then leaves behind. If so, you hold ${unitsNow.toLocaleString('en-IN')} shares, not ${c.units.toLocaleString('en-IN')}, and the ${shownGain < 0 ? `loss of ${rupees(-shownGain)}` : `gain of ${rupees(shownGain)}`} shown is really ${realGain >= 0 ? 'a gain' : 'a loss'} of ${rupees(Math.abs(realGain))}. Record it in the ledger with the date from your broker statement.`,
      href: `/portfolio/ledger?symbol=${encodeURIComponent(c.symbol)}&type=${k === 1.5 || Number.isInteger(k) ? 'BONUS' : 'SPLIT'}&quantity=${unitsNow - c.units}`,
      amountINR: Math.round(realGain - shownGain),
    });
  }

  // Data quality.
  if (input.latestPriceDate && days(input.latestPriceDate, input.asOf) > ALERT_THRESHOLDS.staleDays) {
    out.push({
      id: `stale:${input.latestPriceDate}`,
      severity: 'info',
      kind: 'data',
      title: `Prices last updated on ${longDate(input.latestPriceDate)}`,
      body: 'Values, risk and tax figures use the most recent verified closing prices. Sync prices on the Portfolio page to refresh them.',
      href: '/portfolio',
    });
  }
  if (input.unpricedCount > 0) {
    out.push({
      id: `unpriced:${input.unpricedCount}`,
      severity: 'info',
      kind: 'data',
      title: `${input.unpricedCount} holding${input.unpricedCount > 1 ? 's have' : ' has'} no verified price`,
      body: 'They are left out of values, risk and tax until a verified price is found, so totals may be understated.',
      href: '/portfolio',
    });
  }
  const undated = input.taxPositions.filter((p) => p.excludedReason === 'Purchase date needed').length;
  if (undated > 0) {
    out.push({
      id: `undated:${undated}`,
      severity: 'info',
      kind: 'data',
      title: `${undated} holding${undated > 1 ? 's need' : ' needs'} a purchase date`,
      body: 'Without it, OmniScope cannot tell short-term from long-term gains, so those holdings are left out of the tax estimate.',
      href: '/tax',
    });
  }

  return out.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (b.amountINR ?? 0) - (a.amountINR ?? 0)
  );
}

/** Highest close in the window and the latest close, from a date-ordered price series. */
export function peakAndLast(points: Array<{ date: string; close: number }>): { last: number | null; peak: number | null; peakDate: string | null } {
  if (points.length === 0) return { last: null, peak: null, peakDate: null };
  let peak = points[0];
  for (const p of points) if (p.close > peak.close) peak = p;
  return { last: points[points.length - 1].close, peak: peak.close, peakDate: peak.date };
}
