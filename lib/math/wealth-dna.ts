import type { WealthDna, JourneyMilestone } from '@/lib/data';
import type { FinancialSnapshot } from '@/lib/ai/snapshot';

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const monthLabel = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

const EQUITY = new Set(['Indian Stocks', 'Mutual Funds', 'ETFs', 'International']);

/**
 * Wealth DNA computed from the user's own portfolio and profile. Every trait is a transparent
 * formula over verified data; nothing here is a psychological assessment.
 */
export function computeWealthDna(s: FinancialSnapshot): WealthDna {
  const holdings = s.summary.holdings;
  const value = (h: (typeof holdings)[number]) => h.currentValue ?? h.investedAmount;
  const total = holdings.reduce((a, h) => a + value(h), 0) || 1;
  const equityShare = holdings.filter((h) => EQUITY.has(h.assetClass)).reduce((a, h) => a + value(h), 0) / total;
  const classes = new Set(holdings.map((h) => h.assetClass)).size;
  const top = holdings.reduce((m, h) => Math.max(m, value(h) / total), 0);
  const hhi = s.xray?.concentration.hhi ?? null;

  const now = Date.now();
  const ages = holdings.map((h) => (now - new Date(h.firstPurchasedAt ?? h.createdAt).getTime()) / (365.25 * 86400000));
  const avgAge = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;

  const surplus = s.summary.cashFlow.netSurplus;
  const sip = s.summary.goalsSummary.totalMonthlyCommitment;
  const sipRatio = surplus && surplus > 0 ? sip / surplus : null;
  const efMonths = s.summary.emergencyFund.fundedMonths;

  const traits = {
    consistency: clamp(sipRatio != null ? Math.min(sipRatio, 1) * 100 : sip > 0 ? 60 : 30),
    patience: clamp((avgAge / 3) * 100),
    discipline: clamp(efMonths != null ? (Math.min(efMonths, 6) / 6) * 100 : 40),
    conviction: clamp(top * 200),
    adaptability: clamp((classes / 5) * 100),
  };

  const riskStyle = equityShare >= 0.8 ? 'Growth-seeking' : equityShare >= 0.55 ? 'Balanced growth' : equityShare >= 0.3 ? 'Moderate' : 'Capital-preserving';
  const archetype =
    traits.patience >= 70 && equityShare >= 0.6
      ? 'The Patient Compounder'
      : traits.conviction >= 60
        ? 'The Focused Conviction Investor'
        : classes >= 4
          ? 'The Diversified Builder'
          : equityShare < 0.4
            ? 'The Steady Preserver'
            : 'The Emerging Investor';
  const hhiLabel = s.xray?.concentration.hhiClassification;
  const diversificationStyle = `${classes} asset class${classes === 1 ? '' : 'es'}; ${hhiLabel ?? 'concentration not assessed'}${hhi != null ? ` (HHI ${Math.round(hhi)})` : ''}`;

  const strengths: string[] = [];
  const growthAreas: string[] = [];
  if (sip > 0) strengths.push(`You commit ${inr(sip)} every month towards goals.`);
  if (efMonths != null && efMonths >= 6) strengths.push(`Emergency fund covers ${efMonths.toFixed(1)} months of expenses.`);
  if (classes >= 3) strengths.push(`Spread across ${classes} asset classes.`);
  if (avgAge >= 2) strengths.push(`Average holding age is ${avgAge.toFixed(1)} years — time is working for you.`);
  if (top > 0.3) growthAreas.push(`Your largest holding is ${(top * 100).toFixed(0)}% of the portfolio.`);
  if (efMonths != null && efMonths < 6) growthAreas.push(`Emergency fund covers ${efMonths.toFixed(1)} months; 6 is the usual target.`);
  if (classes <= 2) growthAreas.push('Only one or two asset classes — consider whether gold or debt fits your goals.');
  if (s.summary.portfolioSummary.unpricedHoldingCount > 0)
    growthAreas.push(`${s.summary.portfolioSummary.unpricedHoldingCount} holding(s) lack a verified price, so analytics are partial.`);
  if (strengths.length === 0) strengths.push('You have started tracking your money in one place — the first step.');
  if (growthAreas.length === 0) growthAreas.push('No major gaps detected in the data you have shared.');

  const byMonth = new Map<string, { d: Date; names: string[] }>();
  for (const h of holdings) {
    const d = new Date(h.firstPurchasedAt ?? h.createdAt);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    const e = byMonth.get(k) ?? { d, names: [] };
    e.names.push(h.symbol);
    byMonth.set(k, e);
  }
  const monthlyEvolution = [...byMonth.values()]
    .sort((a, b) => a.d.getTime() - b.d.getTime())
    .slice(-4)
    .map((e) => ({ month: monthLabel(e.d), focus: `Added ${e.names.slice(0, 3).join(', ')}${e.names.length > 3 ? ` +${e.names.length - 3}` : ''}` }));

  return {
    archetype,
    riskStyle: `${riskStyle} (${Math.round(equityShare * 100)}% equity)`,
    decisionStyle: s.performance?.xirrPct != null ? `Earning ${s.performance.xirrPct.toFixed(1)}% XIRR` : 'Building a track record',
    diversificationStyle,
    learningStyle: 'Visual & narrative (dashboard, X-Ray, Copilot)',
    communicationStyle: 'Plain English with ₹ figures',
    traits,
    strengths: strengths.slice(0, 4),
    growthAreas: growthAreas.slice(0, 4),
    monthlyEvolution,
    aiReflection:
      `Computed from ${holdings.length} verified holdings: ${Math.round(equityShare * 100)}% in equity, largest position ${(top * 100).toFixed(0)}%, average holding age ${avgAge.toFixed(1)} years. ` +
      'Each trait is a transparent formula over your data (see the note below), not a personality test.',
  };
}

/** Milestones reconstructed from purchase dates, verified price history and goals. */
export function computeJourney(s: FinancialSnapshot): JourneyMilestone[] {
  const holdings = [...s.summary.holdings].sort(
    (a, b) => new Date(a.firstPurchasedAt ?? a.createdAt).getTime() - new Date(b.firstPurchasedAt ?? b.createdAt).getTime()
  );
  const out: JourneyMilestone[] = [];
  if (holdings.length === 0) return out;
  const dateOf = (h: (typeof holdings)[number]) => new Date(h.firstPurchasedAt ?? h.createdAt);

  const first = holdings[0];
  out.push({
    id: 'first',
    date: monthLabel(dateOf(first)),
    achievement: 'First investment',
    story: `You bought ${first.name} — the first holding in your tracked portfolio.`,
    financialImpact: `${inr(first.investedAmount)} invested`,
    lessonLearned: 'Starting matters more than starting perfectly.',
    aiReflection: 'Every later milestone compounds on this one.',
  });

  const seen = new Set<string>([first.assetClass]);
  for (const h of holdings.slice(1)) {
    if (seen.has(h.assetClass)) continue;
    seen.add(h.assetClass);
    out.push({
      id: `class-${h.assetClass}`,
      date: monthLabel(dateOf(h)),
      achievement: `Added ${h.assetClass}`,
      story: `${h.name} brought a new asset class into your portfolio.`,
      financialImpact: `${inr(h.investedAmount)} invested · now ${seen.size} asset classes`,
      lessonLearned: 'Different assets rarely fall together, which smooths the ride.',
      aiReflection: 'Diversification is the only free lunch in investing.',
    });
  }

  const growth = s.performance?.growth ?? [];
  for (const mark of [100000, 500000, 1000000, 2500000, 5000000, 10000000]) {
    const hit = growth.find((g) => g.value >= mark);
    if (hit && growth[0].value < mark) {
      out.push({
        id: `mark-${mark}`,
        date: monthLabel(new Date(hit.date)),
        achievement: `Crossed ${mark >= 1e7 ? `₹${mark / 1e7} Cr` : `₹${mark / 1e5} lakh`}`,
        story: 'Your verified portfolio value passed a round-number milestone.',
        financialImpact: `${inr(hit.value)} on ${new Date(hit.date).toLocaleDateString('en-IN')}`,
        lessonLearned: 'Milestones arrive faster as the base grows — that is compounding.',
        aiReflection: 'Measured at that day’s closing prices.',
      });
    }
  }

  for (const p of s.summary.goalsSummary.projections) {
    out.push({
      id: `goal-${p.goal.id}`,
      date: monthLabel(new Date(p.goal.createdAt)),
      achievement: `Set goal: ${p.goal.name}`,
      story: 'You gave your money a purpose and a deadline.',
      financialImpact: `Target ${inr(Number(p.goal.targetAmount))}`,
      lessonLearned: 'Named goals are easier to stick to than vague intentions.',
      aiReflection: 'Track its Monte Carlo probability on the Goals page.',
    });
  }

  const ps = s.summary.portfolioSummary;
  out.sort((a, b) => Date.parse(`1 ${a.date}`) - Date.parse(`1 ${b.date}`));
  out.push({
    id: 'today',
    date: 'Today',
    achievement: `${ps.holdingCount} holdings across ${ps.accountCount} account${ps.accountCount === 1 ? '' : 's'}`,
    story:
      ps.totalCurrentValue != null
        ? ps.isFullyPriced
          ? `Verified value ${inr(ps.totalCurrentValue)} against ${inr(ps.totalInvested)} invested.`
          : `Verified value ${inr(ps.totalCurrentValue)} against ${inr(ps.pricedInvested)} invested in the ${ps.pricedHoldingCount} priced holdings.`
        : `${inr(ps.totalInvested)} invested; prices are syncing.`,
    financialImpact:
      s.performance?.xirrPct != null ? `XIRR ${s.performance.xirrPct.toFixed(1)}% a year` : 'Add purchase dates to see your XIRR',
    lessonLearned: 'Consistency beats timing.',
    aiReflection: 'Ask the AI Copilot what your next milestone could be.',
  });
  return out;
}
