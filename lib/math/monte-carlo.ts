/**
 * Monte Carlo goal simulation.
 *
 * Each path compounds the current corpus and a fixed monthly SIP through monthly returns drawn
 * from a lognormal distribution with the given annual expected return (arithmetic) and volatility.
 * A seeded generator makes results reproducible for the same inputs.
 */

export interface MonteCarloInput {
  currentCorpus: number;
  monthlyContribution: number;
  months: number;
  target: number;
  annualReturn: number; // e.g. 0.11
  annualVolatility: number; // e.g. 0.16
  paths?: number;
  seed?: number;
}

export interface MonteCarloResult {
  paths: number;
  probabilityOfSuccess: number; // 0..1
  p10: number;
  p50: number;
  p90: number;
  /** Yearly percentile bands for a fan chart: year index (0..years) */
  fan: Array<{ month: number; p10: number; p50: number; p90: number }>;
  assumptions: { annualReturn: number; annualVolatility: number; months: number };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function simulateGoal(input: MonteCarloInput): MonteCarloResult {
  const paths = input.paths ?? 10000;
  const months = Math.max(0, Math.round(input.months));
  const rand = mulberry32(input.seed ?? 20261115);

  // Convert annual arithmetic mean/vol to monthly lognormal parameters
  const mu = Math.log(1 + input.annualReturn);
  const sigmaA = input.annualVolatility;
  const sigmaM = sigmaA / Math.sqrt(12);
  // Monthly log drift; the -σ²/2 term below makes E[monthly growth] = (1 + r)^(1/12)
  const driftM = mu / 12;

  const checkpoints: number[] = [];
  const step = months > 120 ? 12 : months > 36 ? 6 : 3;
  for (let m = 0; m <= months; m += step) checkpoints.push(m);
  if (checkpoints[checkpoints.length - 1] !== months) checkpoints.push(months);
  const cpValues = checkpoints.map(() => new Float64Array(paths));
  const finals = new Float64Array(paths);

  let spare: number | null = null;
  const gauss = () => {
    if (spare != null) { const s = spare; spare = null; return s; }
    let u = 0;
    let v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };

  for (let p = 0; p < paths; p++) {
    let value = input.currentCorpus;
    let cp = 0;
    if (checkpoints[0] === 0) { cpValues[0][p] = value; cp = 1; }
    for (let m = 1; m <= months; m++) {
      const growth = Math.exp(driftM - (sigmaM * sigmaM) / 2 + sigmaM * gauss());
      value = value * growth + input.monthlyContribution;
      if (cp < checkpoints.length && checkpoints[cp] === m) { cpValues[cp][p] = value; cp++; }
    }
    finals[p] = value;
  }

  let success = 0;
  for (let p = 0; p < paths; p++) if (finals[p] >= input.target) success++;
  const sortedFinals = Float64Array.from(finals).sort();

  const fan = checkpoints.map((m, i) => {
    const s = Float64Array.from(cpValues[i]).sort();
    return { month: m, p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9) };
  });

  return {
    paths,
    probabilityOfSuccess: months === 0 ? (input.currentCorpus >= input.target ? 1 : 0) : success / paths,
    p10: quantile(sortedFinals, 0.1),
    p50: quantile(sortedFinals, 0.5),
    p90: quantile(sortedFinals, 0.9),
    fan,
    assumptions: { annualReturn: input.annualReturn, annualVolatility: input.annualVolatility, months },
  };
}

/**
 * Blends asset-class statistics into a portfolio-level expected return and volatility.
 * Uses a constant cross-asset correlation (rho) as a transparent simplifying assumption.
 */
export function blendPortfolioStats(
  weights: Array<{ weight: number; annualReturn: number; annualVolatility: number }>,
  rho = 0.3
): { annualReturn: number; annualVolatility: number } {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  if (total <= 0) return { annualReturn: 0.1, annualVolatility: 0.15 };
  const ws = weights.map((w) => ({ ...w, weight: w.weight / total }));
  const r = ws.reduce((s, w) => s + w.weight * w.annualReturn, 0);
  let variance = 0;
  for (let i = 0; i < ws.length; i++) {
    for (let j = 0; j < ws.length; j++) {
      const c = i === j ? 1 : rho;
      variance += ws[i].weight * ws[j].weight * ws[i].annualVolatility * ws[j].annualVolatility * c;
    }
  }
  return { annualReturn: r, annualVolatility: Math.sqrt(variance) };
}
