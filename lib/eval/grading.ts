/**
 * Grading helpers for the AI benchmarks. Pure functions so they can be unit-tested.
 */

export interface ExtractedNumber {
  value: number;
  percent: boolean;
  /** Written as money (₹/Rs/INR prefix, or a lakh/crore/thousand suffix). */
  money: boolean;
}

const NUMBER_RE =
  /(₹|rs\.?|inr)?\s*([-−]\s*)?(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?\s*(%|per\s?cent|lakhs?|lacs?|crores?|cr\b|l\b|k\b|thousand)?/gi;

/** Every number in a piece of text, with Indian units (lakh, crore) expanded. */
export function extractNumbers(text: string): ExtractedNumber[] {
  const out: ExtractedNumber[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const [, currency, , int, frac, unitRaw] = m;
    let value = Number(int.replace(/,/g, '') + (frac ?? ''));
    if (!Number.isFinite(value)) continue;
    const unit = (unitRaw ?? '').toLowerCase().replace(/\s/g, '');
    let money = Boolean(currency);
    if (/^lakh|^lac|^l$/.test(unit)) {
      value *= 1e5;
      money = true;
    } else if (/^crore|^cr$/.test(unit)) {
      value *= 1e7;
      money = true;
    } else if (unit === 'k' || unit === 'thousand') {
      value *= 1e3;
      money = true;
    }
    out.push({ value, percent: unit === '%' || unit.startsWith('per'), money });
  }
  return out;
}

export type FactUnit = 'inr' | 'pct' | 'number';

export interface ExpectedFact {
  label: string;
  /** Rupees for "inr", percentage points for "pct" (13.5 means 13.5%). Signs are ignored. */
  value: number;
  unit: FactUnit;
  /** Relative tolerance for inr (default 2%), absolute for pct (default 0.6 points) and number. */
  tolerance?: number;
}

/** Whether `text` states the expected figure, allowing for normal rounding. */
export function factPresent(text: string, fact: ExpectedFact): boolean {
  const target = Math.abs(fact.value);
  return extractNumbers(text).some((n) => {
    const v = Math.abs(n.value);
    if (fact.unit === 'pct') return n.percent && Math.abs(v - target) <= (fact.tolerance ?? 0.6);
    if (fact.unit === 'inr') {
      if (n.percent || (!n.money && v < 1000)) return false;
      return Math.abs(v - target) <= Math.max((fact.tolerance ?? 0.02) * target, 1);
    }
    return !n.percent && Math.abs(v - target) <= (fact.tolerance ?? Math.max(0.02, 0.02 * target));
  });
}

export interface TextCheck {
  label: string;
  /** The answer must match this. */
  must?: RegExp;
  /** The answer must not match this. */
  mustNot?: RegExp;
}

export function checkPasses(text: string, check: TextCheck): boolean {
  return (!check.must || check.must.test(text)) && (!check.mustNot || !check.mustNot.test(text));
}

/** Median and 95th percentile of a sample. */
export function latencyStats(ms: number[]): { median: number; p95: number } {
  if (ms.length === 0) return { median: 0, p95: 0 };
  const s = [...ms].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
  return { median: s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2, p95: at(0.95) };
}

// ---------- statement extraction ----------

export interface TruthHolding {
  name: string;
  isin: string | null;
  quantity: number;
  averageCost: number | null;
  totalCost: number | null;
}

export interface ExtractedHoldingLike {
  securityName: string;
  isin: string | null;
  quantity: number;
  averageCost: number | null;
  totalCost: number | null;
}

const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !['ltd', 'limited', 'the', 'fund', 'plan', 'direct', 'growth', 'option', 'of', 'and'].includes(t))
  );

export function nameSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

const close = (a: number | null, b: number | null, rel: number) =>
  a != null && b != null && Math.abs(a - b) <= Math.max(rel * Math.abs(b), 0.005);

export interface FieldScore {
  correct: number;
  total: number;
}

export interface StatementScore {
  truthCount: number;
  extractedCount: number;
  matched: number;
  precision: number;
  recall: number;
  fields: { name: FieldScore; isin: FieldScore; quantity: FieldScore; averageCost: FieldScore; totalCost: FieldScore };
  errors: string[];
}

/**
 * Pairs extracted holdings with the truth (by ISIN, else by name) and scores every field that the
 * statement actually printed. Quantities must match to 0.01%, costs to 0.5%.
 */
export function scoreStatement(truth: TruthHolding[], extracted: ExtractedHoldingLike[]): StatementScore {
  const used = new Set<number>();
  const fields = {
    name: { correct: 0, total: 0 },
    isin: { correct: 0, total: 0 },
    quantity: { correct: 0, total: 0 },
    averageCost: { correct: 0, total: 0 },
    totalCost: { correct: 0, total: 0 },
  };
  const errors: string[] = [];
  let matched = 0;
  for (const t of truth) {
    let idx = extracted.findIndex((e, i) => !used.has(i) && t.isin && e.isin && e.isin.toUpperCase() === t.isin.toUpperCase());
    if (idx < 0) {
      let best = -1;
      let bestSim = 0.5;
      extracted.forEach((e, i) => {
        const sim = nameSimilarity(e.securityName, t.name);
        if (!used.has(i) && sim >= bestSim) {
          best = i;
          bestSim = sim;
        }
      });
      idx = best;
    }
    if (idx < 0) {
      errors.push(`Missed ${t.name}`);
      continue;
    }
    used.add(idx);
    matched++;
    const e = extracted[idx];
    fields.name.total++;
    if (nameSimilarity(e.securityName, t.name) >= 0.6) fields.name.correct++;
    else errors.push(`Name "${e.securityName}" for ${t.name}`);
    if (t.isin) {
      fields.isin.total++;
      if (e.isin?.toUpperCase() === t.isin.toUpperCase()) fields.isin.correct++;
      else errors.push(`ISIN ${e.isin ?? 'missing'} for ${t.name}`);
    }
    fields.quantity.total++;
    if (close(e.quantity, t.quantity, 0.0001)) fields.quantity.correct++;
    else errors.push(`Quantity ${e.quantity} vs ${t.quantity} for ${t.name}`);
    if (t.averageCost != null) {
      fields.averageCost.total++;
      if (close(e.averageCost, t.averageCost, 0.005)) fields.averageCost.correct++;
      else errors.push(`Average cost ${e.averageCost ?? 'missing'} vs ${t.averageCost} for ${t.name}`);
    }
    if (t.totalCost != null) {
      fields.totalCost.total++;
      if (close(e.totalCost, t.totalCost, 0.005)) fields.totalCost.correct++;
      else errors.push(`Total cost ${e.totalCost ?? 'missing'} vs ${t.totalCost} for ${t.name}`);
    }
  }
  extracted.forEach((e, i) => {
    if (!used.has(i)) errors.push(`Extra holding "${e.securityName}"`);
  });
  return {
    truthCount: truth.length,
    extractedCount: extracted.length,
    matched,
    precision: extracted.length ? matched / extracted.length : truth.length === 0 ? 1 : 0,
    recall: truth.length ? matched / truth.length : 1,
    fields,
    errors,
  };
}

export interface StatementBenchmarkResult {
  id: string;
  title: string;
  format: string;
  challenge: string;
  score: StatementScore | null;
  catalogueMatched: number;
  latencyMs: number;
  model: string | null;
  error: string | null;
}
