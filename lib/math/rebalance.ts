/**
 * Tax-aware rebalancing. Pure functions: no I/O, safe on server and client.
 *
 * The problem: move a portfolio towards target weights while paying as little capital-gains tax and
 * trading cost as possible. Distance from the target is measured as active risk (tracking error),
 *   TE(w) = sqrt((w - w*)' Σ (w - w*)),
 * using the same shrunk, annualised covariance as the optimiser. A gap between two closely
 * correlated holdings therefore matters less than a gap between equity and gold.
 *
 * Indian rules respected:
 *  - Within one demat account, a sale uses up the oldest units first (FIFO). Across accounts the
 *    investor chooses which account to sell from, so the engine picks the cheapest one.
 *  - Tax is the extra tax that this year's sales add on top of gains already booked, from
 *    `computeTax`: optimal loss set-off, the Rs 1.25 lakh long-term exemption, and 4% cess.
 *
 * The method is a greedy marginal-cost path. New cash is invested first, since that costs no tax.
 * Then each step moves one chunk of money from an overweight holding to the holding where it cuts
 * active risk the most. The source chosen is the one with the most risk reduction per rupee of cost
 * (tax plus 0.1% per side of each trade). Loss-making lots and gains inside the exemption cost no
 * tax, so they are used first; short-term gains come last. Recording (cost, TE) after every step
 * traces the tax-versus-alignment frontier.
 *
 * The comparison is the naive approach: execute a fraction α of the full rebalance, selling the
 * oldest units first across all accounts.
 */
import { classifyPosition, computeTax, type Bucket, type TaxBreakdown, type TaxCategory, type TaxOptions, type TaxPosition } from './tax';
import type { Matrix } from './risk';

export interface RebalanceLot {
  id: string;
  /** Demat account (or folio) the lot sits in. FIFO applies within an account. */
  account: string;
  /** YYYY-MM-DD, or null if unknown (then treated as short-term, the conservative case). */
  purchaseDate: string | null;
  units: number;
  costPerUnit: number;
}

export interface RebalanceAsset {
  symbol: string;
  name: string;
  category: TaxCategory;
  price: number;
  value: number;
  lots: RebalanceLot[];
}

/** A gain already realised this financial year (only bucket, term and amount matter for set-off). */
export interface BookedGain {
  bucket: Bucket | null;
  term: 'short' | 'long' | null;
  gain: number;
}

export interface RebalanceInput {
  assets: RebalanceAsset[];
  /** Target weights, one per asset, summing to 1. */
  target: number[];
  /** Annualised covariance of the assets' returns. */
  cov: Matrix;
  /** New money to invest alongside the rebalance. */
  cash?: number;
  asOf: string;
  tax: TaxOptions;
  booked?: BookedGain[];
  /** Trading cost per side as a fraction of the amount traded (default 0.1%). */
  costRate?: number;
  /** The portfolio is moved in chunks of (total value / resolution); smaller chunks are tried at the end. */
  resolution?: number;
  /** Holdings the investor does not want to sell (they can still be bought). */
  locked?: boolean[];
}

export interface PathPoint {
  step: number;
  tax: number;
  tradingCost: number;
  cost: number;
  /** Active risk against the target, annualised (0.02 = 2%). */
  te: number;
  turnover: number;
}

interface Take {
  lot: number;
  units: number;
}

export interface Move {
  /** Source asset index, or -1 for new cash. */
  from: number;
  to: number;
  amount: number;
  takes: Take[];
}

export interface RebalanceResult {
  total: number;
  te0: number;
  smart: PathPoint[];
  moves: Move[];
  naive: Array<PathPoint & { alpha: number }>;
  /** Step on the smart path that captures 90% of the achievable risk alignment. */
  recommendedStep: number;
}

interface LotInfo {
  asset: number;
  lot: RebalanceLot;
  bucket: Bucket | null;
  term: 'short' | 'long' | null;
  gainPerUnit: number;
  longTermOn: string | null;
  daysToLongTerm: number | null;
  /** True when the purchase date was unknown and short-term was assumed. */
  assumed: boolean;
}

const DEFAULT_COST = 0.001;

function prepare(input: RebalanceInput) {
  const lots: LotInfo[] = [];
  const queues: Array<Map<string, number[]>> = [];
  input.assets.forEach((a, i) => {
    const own = [...a.lots];
    const covered = own.reduce((s, l) => s + l.units, 0) * a.price;
    // Value not covered by known lots (should not happen with clean data): cost unknown, treated as no gain.
    if (a.price > 0 && covered < a.value - Math.max(1, a.value * 1e-4)) {
      own.push({ id: `${a.symbol}:rest`, account: 'Unrecorded', purchaseDate: null, units: (a.value - covered) / a.price, costPerUnit: a.price });
    }
    const byAccount = new Map<string, number[]>();
    for (const lot of own) {
      if (!(lot.units > 0)) continue;
      const assumed = lot.purchaseDate == null;
      const pos = classifyPosition(
        { id: lot.id, symbol: a.symbol, name: a.name, category: a.category, purchaseDate: lot.purchaseDate ?? input.asOf, units: 1, costPerUnit: lot.costPerUnit, price: a.price },
        input.asOf
      );
      const idx = lots.length;
      lots.push({ asset: i, lot, bucket: pos.bucket, term: pos.term, gainPerUnit: a.price - lot.costPerUnit, longTermOn: pos.longTermOn, daysToLongTerm: pos.daysToLongTerm, assumed });
      const q = byAccount.get(lot.account) ?? [];
      q.push(idx);
      byAccount.set(lot.account, q);
    }
    for (const q of byAccount.values()) {
      q.sort((x, y) => (lots[x].lot.purchaseDate ?? '9999').localeCompare(lots[y].lot.purchaseDate ?? '9999'));
    }
    queues.push(byAccount);
  });
  const booked = (input.booked ?? []) as unknown as TaxPosition[];
  const baseline = computeTax(booked, input.tax).totalTax;
  return { lots, queues, booked, baseline };
}

type Prepared = ReturnType<typeof prepare>;

function positionsFor(prep: Prepared, sold: Map<number, number>, assets: RebalanceAsset[]): TaxPosition[] {
  const out: TaxPosition[] = [];
  for (const [idx, units] of sold) {
    if (units <= 0) continue;
    const l = prep.lots[idx];
    const a = assets[l.asset];
    out.push({
      id: l.lot.id,
      symbol: a.symbol,
      name: a.name,
      category: a.category,
      purchaseDate: l.lot.purchaseDate,
      units,
      costPerUnit: l.lot.costPerUnit,
      price: a.price,
      invested: units * l.lot.costPerUnit,
      value: units * a.price,
      gain: units * l.gainPerUnit,
      term: l.term,
      longTermOn: l.longTermOn,
      daysToLongTerm: l.daysToLongTerm,
      bucket: l.bucket,
      excludedReason: null,
    });
  }
  return out;
}

function taxBreakdown(prep: Prepared, sold: Map<number, number>, input: RebalanceInput): TaxBreakdown {
  return computeTax([...prep.booked, ...positionsFor(prep, sold, input.assets)], input.tax);
}

const extraTax = (prep: Prepared, sold: Map<number, number>, input: RebalanceInput) => taxBreakdown(prep, sold, input).totalTax - prep.baseline;

/** Units to take, oldest first, from the given lot indices. */
function takeUnits(order: number[], remaining: number[], units: number): Take[] | null {
  const takes: Take[] = [];
  let left = units;
  for (const idx of order) {
    if (left <= 1e-9) break;
    const avail = remaining[idx];
    if (avail <= 1e-9) continue;
    const u = Math.min(avail, left);
    takes.push({ lot: idx, units: u });
    left -= u;
  }
  return left > 1e-6 * Math.max(1, units) ? null : takes;
}

function withTakes(sold: Map<number, number>, takes: Take[]): Map<number, number> {
  const next = new Map(sold);
  for (const t of takes) next.set(t.lot, (next.get(t.lot) ?? 0) + t.units);
  return next;
}

const quad = (cov: Matrix, d: number[]) => d.reduce((s, di, i) => s + di * cov[i].reduce((t, c, j) => t + c * d[j], 0), 0);

export function activeRisk(cov: Matrix, weights: number[], target: number[]): number {
  return Math.sqrt(Math.max(0, quad(cov, weights.map((w, i) => w - target[i]))));
}

/** Traces the tax-aware path and the naive path from today's holdings to the target. */
export function rebalancePath(input: RebalanceInput): RebalanceResult {
  const { assets, target, cov } = input;
  const n = assets.length;
  const cash0 = Math.max(0, input.cash ?? 0);
  const costRate = input.costRate ?? DEFAULT_COST;
  const total = assets.reduce((s, a) => s + a.value, 0) + cash0;
  const prep = prepare(input);

  const x = assets.map((a) => a.value);
  const remaining = prep.lots.map((l) => l.lot.units);
  let cash = cash0;
  let sold = new Map<number, number>();
  let tax = 0;
  let tradingCost = 0;
  let turnover = 0;

  const d = () => x.map((v, i) => v / total - target[i]);
  const te0 = Math.sqrt(Math.max(0, quad(cov, d())));
  const moves: Move[] = [];
  const smart: PathPoint[] = [{ step: 0, tax: 0, tradingCost: 0, cost: 0, te: te0, turnover: 0 }];

  // Change in TE^2 from moving delta (as a weight) from asset i (or cash, i = -1) to asset j.
  const deltaTe2 = (g: number[], i: number, j: number, delta: number) =>
    i < 0 ? 2 * delta * g[j] + delta * delta * cov[j][j] : 2 * delta * (g[j] - g[i]) + delta * delta * (cov[j][j] + cov[i][i] - 2 * cov[i][j]);

  const gradient = () => {
    const dv = d();
    return dv.map((_, i) => cov[i].reduce((s, c, j) => s + c * dv[j], 0));
  };

  const apply = (m: Move, newSold: Map<number, number>, newTax: number) => {
    if (m.from >= 0) {
      x[m.from] -= m.amount;
      for (const t of m.takes) remaining[t.lot] -= t.units;
      sold = newSold;
      tax = newTax;
      tradingCost += 2 * costRate * m.amount;
      turnover += 2 * m.amount;
    } else {
      cash -= m.amount;
      tradingCost += costRate * m.amount;
      turnover += m.amount;
    }
    x[m.to] += m.amount;
    moves.push(m);
    smart.push({ step: moves.length, tax, tradingCost, cost: tax + tradingCost, te: Math.sqrt(Math.max(0, quad(cov, d()))), turnover });
  };

  const baseChunk = total / Math.max(20, input.resolution ?? 200);

  // Phase 1: invest new cash where it lowers active risk most. No tax.
  while (cash > 1e-6) {
    const amount = Math.min(baseChunk, cash);
    const g = gradient();
    let best = 0;
    for (let j = 1; j < n; j++) if (deltaTe2(g, -1, j, amount / total) < deltaTe2(g, -1, best, amount / total)) best = j;
    apply({ from: -1, to: best, amount, takes: [] }, sold, tax);
  }

  // Phase 2: sell overweight holdings, cheapest risk reduction per rupee of cost first.
  let chunk = baseChunk;
  const minChunk = baseChunk / 16;
  const tol = Math.max(1e-14, te0 * te0 * 1e-7);
  for (let guard = 0; guard < 5000; guard++) {
    const g = gradient();
    let pick: { m: Move; sold: Map<number, number>; tax: number; score: number } | null = null;
    for (let i = 0; i < n; i++) {
      if (x[i] <= 1e-6 || assets[i].price <= 0 || input.locked?.[i]) continue;
      const amount = Math.min(chunk, x[i]);
      const delta = amount / total;
      let to = -1;
      let gain = tol;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const improvement = -deltaTe2(g, i, j, delta);
        if (improvement > gain) {
          gain = improvement;
          to = j;
        }
      }
      if (to < 0) continue;
      // Cheapest account to sell from (FIFO inside each account).
      // On equal tax, book the smaller gain: it keeps more of the exemption (and books losses) for later.
      let src: { takes: Take[]; sold: Map<number, number>; tax: number; gain: number } | null = null;
      for (const order of prep.queues[i].values()) {
        const takes = takeUnits(order, remaining, amount / assets[i].price);
        if (!takes) continue;
        const nextSold = withTakes(sold, takes);
        const nextTax = extraTax(prep, nextSold, input);
        const booked = takes.reduce((s, t) => s + t.units * prep.lots[t.lot].gainPerUnit, 0);
        if (!src || nextTax < src.tax - 1e-6 || (Math.abs(nextTax - src.tax) <= 1e-6 && booked < src.gain)) src = { takes, sold: nextSold, tax: nextTax, gain: booked };
      }
      if (!src) continue;
      const cost = src.tax - tax + 2 * costRate * amount;
      const score = cost <= 1e-9 ? 1e12 * gain : gain / cost;
      if (!pick || score > pick.score) pick = { m: { from: i, to, amount, takes: src.takes }, sold: src.sold, tax: src.tax, score };
    }
    if (!pick) {
      if (chunk / 2 < minChunk) break;
      chunk /= 2;
      continue;
    }
    apply(pick.m, pick.sold, pick.tax);
  }

  // Naive path: a fraction α of the full rebalance, oldest units first across all accounts.
  const fifoAll = assets.map((_, i) =>
    [...prep.queues[i].values()].flat().sort((p, q) => (prep.lots[p].lot.purchaseDate ?? '9999').localeCompare(prep.lots[q].lot.purchaseDate ?? '9999'))
  );
  // With locked holdings, the naive plan sells only unlocked overweights and buys pro rata with the proceeds.
  const full = naiveFullTrades(input, total);
  const fullSells = full.reduce((s, v) => s + Math.max(0, -v), 0);
  const fullBuys = full.reduce((s, v) => s + Math.max(0, v), 0);
  const naive: RebalanceResult['naive'] = [];
  for (let k = 0; k <= 20; k++) {
    const alpha = k / 20;
    const rem = prep.lots.map((l) => l.lot.units);
    let s = new Map<number, number>();
    full.forEach((v, i) => {
      if (v >= 0 || assets[i].price <= 0) return;
      const takes = takeUnits(fifoAll[i], rem, (alpha * -v) / assets[i].price) ?? [];
      s = withTakes(s, takes);
    });
    const t = extraTax(prep, s, input);
    const tc = costRate * alpha * (fullSells + fullBuys);
    const w = assets.map((a, i) => (a.value + alpha * full[i]) / total);
    naive.push({ alpha, step: k, tax: t, tradingCost: tc, cost: t + tc, te: activeRisk(cov, w, target), turnover: alpha * (fullSells + fullBuys) });
  }

  const teEnd = smart[smart.length - 1].te;
  const goal = te0 - 0.9 * (te0 - teEnd);
  const recommendedStep = smart.find((p) => p.te <= goal + 1e-12)?.step ?? smart.length - 1;

  return { total, te0, smart, moves, naive, recommendedStep };
}

function naiveFullTrades(input: RebalanceInput, total: number): number[] {
  const raw = input.assets.map((a, i) => input.target[i] * total - a.value);
  if (!input.locked?.some(Boolean)) return raw;
  const sells = raw.map((v, i) => (v < 0 && !input.locked?.[i] ? v : 0));
  const budget = -sells.reduce((s, v) => s + v, 0) + Math.max(0, input.cash ?? 0);
  const wants = raw.map((v) => Math.max(0, v));
  const want = wants.reduce((s, v) => s + v, 0);
  return raw.map((_, i) => sells[i] + (want > 0 ? (wants[i] / want) * budget : 0));
}

/**
 * Naive tax and cost at the same active risk as a given point: interpolated along α at the first
 * point where the naive path is that close to the target. Null if the naive path never gets there.
 */
export function naiveCostAt(result: RebalanceResult, te: number): { tax: number; cost: number; alpha: number } | null {
  const pts = result.naive;
  if (pts[0].te <= te) return { tax: 0, cost: 0, alpha: 0 };
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    if (b.te <= te + 1e-12) {
      const f = a.te === b.te ? 1 : (a.te - te) / (a.te - b.te);
      return { tax: a.tax + f * (b.tax - a.tax), cost: a.cost + f * (b.cost - a.cost), alpha: a.alpha + f * (b.alpha - a.alpha) };
    }
  }
  return null;
}

export interface PlanSale {
  symbol: string;
  name: string;
  account: string;
  purchaseDate: string | null;
  assumedDate: boolean;
  units: number;
  saleValue: number;
  gain: number;
  term: 'short' | 'long' | null;
  bucket: Bucket | null;
  longTermOn: string | null;
  daysToLongTerm: number | null;
}

export interface RebalancePlan {
  step: number;
  te: number;
  /** Share of today's active risk removed (0..1). */
  captured: number;
  tax: TaxBreakdown;
  extraTax: number;
  tradingCost: number;
  turnover: number;
  weights: number[];
  /** Positive = buy, negative = sell, in rupees, per asset. */
  trades: number[];
  sales: PlanSale[];
  /** Short-term gains in the plan that turn long-term within 60 days, and what waiting would save. */
  waits: Array<{ symbol: string; account: string; longTermOn: string; days: number; saving: number }>;
}

/** The trades, lot-level sales and tax of the smart path after `step` moves. */
export function rebalancePlan(input: RebalanceInput, result: RebalanceResult, step: number): RebalancePlan {
  const prep = prepare(input);
  const n = input.assets.length;
  const trades = new Array(n).fill(0);
  let sold = new Map<number, number>();
  const moves = result.moves.slice(0, Math.max(0, Math.min(step, result.moves.length)));
  for (const m of moves) {
    if (m.from >= 0) trades[m.from] -= m.amount;
    trades[m.to] += m.amount;
    if (m.from >= 0) sold = withTakes(sold, m.takes);
  }
  const point = result.smart[moves.length];
  const breakdown = taxBreakdown(prep, sold, input);
  const values = input.assets.map((a, i) => a.value + trades[i]);
  const totalNow = values.reduce((s, v) => s + v, 0);

  const sales: PlanSale[] = [...sold.entries()]
    .filter(([, u]) => u > 1e-9)
    .map(([idx, units]) => {
      const l = prep.lots[idx];
      const a = input.assets[l.asset];
      return {
        symbol: a.symbol,
        name: a.name,
        account: l.lot.account,
        purchaseDate: l.lot.purchaseDate,
        assumedDate: l.assumed,
        units,
        saleValue: units * a.price,
        gain: units * l.gainPerUnit,
        term: l.term,
        bucket: l.bucket,
        longTermOn: l.longTermOn,
        daysToLongTerm: l.daysToLongTerm,
      };
    })
    .sort((p, q) => p.symbol.localeCompare(q.symbol) || (p.purchaseDate ?? '').localeCompare(q.purchaseDate ?? ''));

  const waits = sales
    .filter((s) => s.term === 'short' && s.gain > 0 && !s.assumedDate && s.longTermOn && s.daysToLongTerm != null && s.daysToLongTerm > 0 && s.daysToLongTerm <= 60)
    .map((s) => {
      const asShort = computeTax([...prep.booked, { bucket: s.bucket, term: 'short', gain: s.gain } as TaxPosition], input.tax).totalTax;
      const longBucket: Bucket = s.bucket === 'stcgEquity' ? 'ltcgEquity' : 'ltcgOther';
      const asLong = computeTax([...prep.booked, { bucket: longBucket, term: 'long', gain: s.gain } as TaxPosition], input.tax).totalTax;
      return { symbol: s.symbol, account: s.account, longTermOn: s.longTermOn as string, days: s.daysToLongTerm as number, saving: asShort - asLong };
    })
    .filter((w) => w.saving > 1);

  return {
    step: moves.length,
    te: point?.te ?? result.te0,
    captured: result.te0 > 0 ? 1 - (point?.te ?? result.te0) / result.te0 : 1,
    tax: breakdown,
    extraTax: breakdown.totalTax - prep.baseline,
    tradingCost: point?.tradingCost ?? 0,
    turnover: point?.turnover ?? 0,
    weights: values.map((v) => (totalNow > 0 ? v / totalNow : 0)),
    trades,
    sales,
    waits,
  };
}
