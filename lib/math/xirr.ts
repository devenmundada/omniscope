/**
 * XIRR: the annualised internal rate of return for irregular cash flows.
 * Convention: investments are negative, current value / redemptions are positive.
 * Solved with Newton–Raphson, falling back to bisection for robustness.
 */
export interface CashFlow {
  amount: number;
  date: Date;
}

const DAY_MS = 86400000;

function npv(rate: number, flows: CashFlow[], t0: number): number {
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, (f.date.getTime() - t0) / (365 * DAY_MS)), 0);
}

function dNpv(rate: number, flows: CashFlow[], t0: number): number {
  return flows.reduce((s, f) => {
    const y = (f.date.getTime() - t0) / (365 * DAY_MS);
    return s - (y * f.amount) / Math.pow(1 + rate, y + 1);
  }, 0);
}

/** Returns XIRR as a fraction (0.12 = 12%), or null when it cannot be determined. */
export function xirr(flows: CashFlow[]): number | null {
  const valid = flows.filter((f) => Number.isFinite(f.amount) && f.amount !== 0);
  if (valid.length < 2) return null;
  if (!valid.some((f) => f.amount > 0) || !valid.some((f) => f.amount < 0)) return null;
  const t0 = Math.min(...valid.map((f) => f.date.getTime()));
  const spanDays = (Math.max(...valid.map((f) => f.date.getTime())) - t0) / DAY_MS;
  if (spanDays < 1) return null;

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const v = npv(rate, valid, t0);
    const d = dNpv(rate, valid, t0);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
    const next = rate - v / d;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - rate) < 1e-9) return next;
    rate = next;
  }

  // Bisection fallback on [-0.99, 10]
  let lo = -0.99;
  let hi = 10;
  let fLo = npv(lo, valid, t0);
  const fHi = npv(hi, valid, t0);
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, valid, t0);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) hi = mid;
    else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}
