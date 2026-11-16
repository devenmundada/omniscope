/**
 * Goal-based portfolio choice. Pure functions: no I/O, safe on server and client.
 *
 * Mean-variance optimisation finds the most return for each level of risk, but a goal does not
 * need the most return: it needs enough, reliably, by a deadline. For every portfolio on the
 * efficient frontier we estimate each goal's probability of success by Monte Carlo and choose the
 * portfolio that maximises it. Too little risk cannot grow fast enough; too much risk widens the
 * chance of falling short, so the probability curve usually peaks somewhere in between, and the
 * peak moves with the goal's horizon and how ambitious its target is.
 *
 * Every portfolio is simulated with the same seed (common random numbers), so differences
 * between portfolios are not noise.
 */
import { simulateGoal } from './monte-carlo';

export interface GoalInput {
  id: string;
  name: string;
  corpus: number;
  monthly: number;
  months: number;
  target: number;
  seed: number;
}

export interface PortfolioPoint {
  expectedReturn: number;
  volatility: number;
}

export function goalProbability(goal: GoalInput, p: PortfolioPoint, paths = 2000, monthly = goal.monthly): number {
  if (goal.months <= 0) return goal.corpus >= goal.target ? 1 : 0;
  return simulateGoal({
    currentCorpus: goal.corpus,
    monthlyContribution: monthly,
    months: goal.months,
    target: goal.target,
    annualReturn: p.expectedReturn,
    annualVolatility: p.volatility,
    paths,
    seed: goal.seed,
  }).probabilityOfSuccess;
}

/** Future value with monthly compounding at an annual rate r. */
export function futureValue(corpus: number, monthly: number, months: number, r: number): number {
  const i = r / 12;
  if (Math.abs(i) < 1e-12) return corpus + monthly * months;
  const g = (1 + i) ** months;
  return corpus * g + monthly * ((g - 1) / i);
}

/** The steady annual return that would reach the target exactly (null if none in −50%..+100%). */
export function requiredReturn(goal: Pick<GoalInput, 'corpus' | 'monthly' | 'months' | 'target'>): number | null {
  if (goal.months <= 0) return null;
  let lo = -0.5;
  let hi = 1;
  if (futureValue(goal.corpus, goal.monthly, goal.months, hi) < goal.target) return null;
  if (futureValue(goal.corpus, goal.monthly, goal.months, lo) >= goal.target) return lo;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (futureValue(goal.corpus, goal.monthly, goal.months, mid) >= goal.target) hi = mid;
    else lo = mid;
  }
  return hi;
}

export interface GoalCurve {
  goalId: string;
  name: string;
  /** Probability of success at each portfolio, in the order given. */
  probabilities: number[];
  bestIndex: number;
  requiredReturn: number | null;
}

export interface GoalPlan {
  curves: GoalCurve[];
  /** Average probability across goals at each portfolio, and the portfolio that maximises it. */
  average: { probabilities: number[]; bestIndex: number };
  /** Lowest goal probability at each portfolio, and the portfolio that maximises it. */
  weakest: { probabilities: number[]; bestIndex: number };
}

const argmax = (xs: number[]) => xs.reduce((best, x, i) => (x > xs[best] + 1e-9 ? i : best), 0);

/** Probability curves for every goal across the given portfolios (e.g. the efficient frontier). */
export function goalPlan(goals: GoalInput[], portfolios: PortfolioPoint[], paths = 2000): GoalPlan {
  const curves = goals.map((g) => {
    const probabilities = portfolios.map((p) => goalProbability(g, p, paths));
    return { goalId: g.id, name: g.name, probabilities, bestIndex: argmax(probabilities), requiredReturn: requiredReturn(g) };
  });
  const average = portfolios.map((_, i) => (curves.length ? curves.reduce((s, c) => s + c.probabilities[i], 0) / curves.length : 0));
  const weakest = portfolios.map((_, i) => (curves.length ? Math.min(...curves.map((c) => c.probabilities[i])) : 0));
  return { curves, average: { probabilities: average, bestIndex: argmax(average) }, weakest: { probabilities: weakest, bestIndex: argmax(weakest) } };
}

/**
 * Smallest monthly SIP that reaches `targetProbability` with the given portfolio, by bisection.
 * Returns null if even ten times the money needed at a 0% return would not get there.
 */
export function sipForProbability(goal: GoalInput, p: PortfolioPoint, targetProbability = 0.8, paths = 2000): number | null {
  if (goal.months <= 0) return null;
  if (goalProbability(goal, p, paths) >= targetProbability) return goal.monthly;
  let lo = goal.monthly;
  let hi = Math.max(goal.monthly * 2, (10 * Math.max(goal.target - goal.corpus, 0)) / goal.months);
  if (goalProbability(goal, p, paths, hi) < targetProbability) return null;
  for (let k = 0; k < 22; k++) {
    const mid = (lo + hi) / 2;
    if (goalProbability(goal, p, paths, mid) >= targetProbability) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi / 100) * 100;
}
