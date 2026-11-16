import type { FutureScenario } from '@/lib/data';

export interface FutureSelfInputs {
  startCorpus: number;
  monthlyInvestment: number;
  annualReturn: number; // decimal, e.g. 0.11
  monthlySurplus: number | null;
  years?: number;
  startYear?: number;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const crore = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`);

/**
 * Deterministic month-by-month projection. `sipAt(month)` gives the contribution in that month,
 * `rateAt(month)` the annual return applying in that month.
 */
export function project(
  start: number,
  months: number,
  sipAt: (m: number) => number,
  rateAt: (m: number) => number
): number[] {
  const yearly: number[] = [start];
  let v = start;
  for (let m = 0; m < months; m++) {
    v = v * (1 + rateAt(m) / 12) + sipAt(m);
    if ((m + 1) % 12 === 0) yearly.push(v);
  }
  return yearly;
}

/** Builds four "what-if" paths from the user's own corpus, SIP and portfolio return assumption. */
export function buildFutureScenarios(i: FutureSelfInputs): FutureScenario[] {
  const years = i.years ?? 20;
  const months = years * 12;
  const y0 = i.startYear ?? new Date().getFullYear();
  const r = Math.min(Math.max(i.annualReturn, 0.04), 0.16);
  const sip = Math.max(0, i.monthlyInvestment);
  const base = project(i.startCorpus, months, () => sip, () => r);
  const extra = Math.max(2000, Math.round(((i.monthlySurplus ?? 0) > sip ? ((i.monthlySurplus ?? 0) - sip) * 0.25 : sip * 0.2) / 500) * 500);

  const toData = (alt: number[]) =>
    base
      .map((v, k) => ({ year: y0 + k, currentStrategy: Math.round(v), alternativeStrategy: Math.round(alt[k]) }))
      .filter((_, k) => k % 5 === 0 || k === years);

  const end = (a: number[]) => a[a.length - 1];
  const baseEnd = end(base);
  const diff = (a: number[]) => {
    const d = end(a) - baseEnd;
    return `${d >= 0 ? '+' : '−'}${crore(Math.abs(d))}`;
  };
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const common = [
    `Starts from your verified portfolio value of ${inr(i.startCorpus)}.`,
    `Current plan: ${inr(sip)} invested every month at ${pct(r)} a year (your portfolio's estimated return).`,
    `Projection horizon: ${years} years, nominal rupees (not inflation-adjusted).`,
  ];

  const stepUp = project(i.startCorpus, months, (m) => sip * Math.pow(1.1, Math.floor(m / 12)), () => r);
  const more = project(i.startCorpus, months, () => sip + extra, () => r);
  const safer = project(i.startCorpus, months, () => sip, () => Math.max(r - 0.03, 0.05));
  const pause = project(i.startCorpus, months, (m) => (m < 24 ? 0 : sip), () => r);

  return [
    {
      id: 'step-up',
      title: '10% yearly step-up SIP',
      description: 'Raise your monthly investment by 10% each year as income grows.',
      assumptions: [...common, 'SIP grows 10% every 12 months.'],
      confidence: 'Medium',
      tradeOffs: ['Needs income growth to keep pace.', `Ends ${diff(stepUp)} versus today's plan after ${years} years.`],
      educationalInsight:
        'Contributions that grow with your salary keep lifestyle inflation in check. Because early increases compound longest, a modest step-up beats a large one-off top-up later.',
      aiReflection: `Your current path reaches about ${crore(baseEnd)} in ${years} years. A 10% annual step-up takes that to about ${crore(end(stepUp))}.`,
      data: toData(stepUp),
    },
    {
      id: 'invest-more',
      title: `Invest ${inr(extra)} more a month`,
      description: 'Redirect part of your monthly surplus into the same portfolio.',
      assumptions: [...common, `An extra ${inr(extra)} each month from your surplus.`],
      confidence: 'High',
      tradeOffs: ['Less spending money today.', `Ends ${diff(more)} versus today's plan.`],
      educationalInsight: 'A fixed extra amount each month adds the same rupees every year, but the earliest instalments do the most work because they compound for the full horizon.',
      aiReflection: `Adding ${inr(extra)} a month changes your ${years}-year outcome by ${diff(more)}, ending near ${crore(end(more))}.`,
      data: toData(more),
    },
    {
      id: 'conservative',
      title: 'Move to a conservative mix',
      description: 'Shift towards debt and gold, accepting about 3 points lower return for a smoother ride.',
      assumptions: [...common, `Return falls to ${pct(Math.max(r - 0.03, 0.05))} a year.`],
      confidence: 'Medium',
      tradeOffs: ['Smaller drawdowns in bad years.', `Ends ${diff(safer)} versus today's plan.`],
      educationalInsight: 'Lower volatility has a price: over long horizons a few percentage points of return compound into a very large gap. It suits goals that are close, not decades away.',
      aiReflection: `A safer mix would leave you near ${crore(end(safer))} instead of ${crore(baseEnd)}. That trade-off makes more sense for money you need within 3–5 years.`,
      data: toData(safer),
    },
    {
      id: 'pause',
      title: 'Pause SIPs for 2 years',
      description: 'What if you stopped investing for two years, then resumed at the same amount?',
      assumptions: [...common, 'No contributions in years 1–2, then the usual SIP.'],
      confidence: 'High',
      tradeOffs: ['Frees cash short term.', `Costs ${diff(pause).replace('−', '')} by the end of the horizon.`],
      educationalInsight: 'The cost of a pause is not just the missed instalments; it is all the growth those instalments would have earned. Time in the market is the cheapest return you can get.',
      aiReflection: `Skipping two years of ${inr(sip)} SIPs (${inr(sip * 24)}) costs about ${crore(baseEnd - end(pause))} by year ${years}.`,
      data: toData(pause),
    },
  ];
}
