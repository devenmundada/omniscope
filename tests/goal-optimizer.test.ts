import { describe, expect, it } from 'vitest';
import { futureValue, goalPlan, goalProbability, requiredReturn, sipForProbability, type GoalInput } from '@/lib/math/goal-optimizer';

const frontier = [
  { expectedReturn: 0.07, volatility: 0.04 }, // calm
  { expectedReturn: 0.1, volatility: 0.12 },
  { expectedReturn: 0.13, volatility: 0.22 }, // aggressive
];

describe('goal-based optimiser', () => {
  it('finds the return a goal needs', () => {
    const target = futureValue(0, 10_000, 120, 0.12);
    expect(requiredReturn({ corpus: 0, monthly: 10_000, months: 120, target })).toBeCloseTo(0.12, 6);
    expect(requiredReturn({ corpus: 0, monthly: 1, months: 12, target: 1e9 })).toBeNull();
  });

  it('prefers a calm mix for a near, modest goal and a growth mix for a far, ambitious one', () => {
    // Needs about 5% a year over 5 years: certainty matters more than growth.
    const near: GoalInput = { id: 'near', name: 'Near', corpus: 200_000, monthly: 15_000, months: 60, target: futureValue(200_000, 15_000, 60, 0.05), seed: 1 };
    // Needs about 12% a year over 25 years: only the growth mix gets close.
    const far: GoalInput = { id: 'far', name: 'Far', corpus: 100_000, monthly: 10_000, months: 300, target: futureValue(100_000, 10_000, 300, 0.12), seed: 2 };
    const plan = goalPlan([near, far], frontier, 3000);
    expect(plan.curves[0].bestIndex).toBe(0);
    expect(plan.curves[1].bestIndex).toBe(2);
    expect(plan.curves[0].probabilities[0]).toBeGreaterThan(plan.curves[0].probabilities[2] + 0.1);
    expect(plan.average.probabilities[plan.average.bestIndex]).toBe(Math.max(...plan.average.probabilities));
    expect(plan.weakest.probabilities.every((w, i) => w <= plan.curves[0].probabilities[i] && w <= plan.curves[1].probabilities[i])).toBe(true);
  });

  it('uses common random numbers, so a portfolio always gets the same probability', () => {
    const g: GoalInput = { id: 'g', name: 'G', corpus: 0, monthly: 20_000, months: 120, target: 4_000_000, seed: 9 };
    expect(goalProbability(g, frontier[1], 2000)).toBe(goalProbability(g, frontier[1], 2000));
  });

  it('finds the SIP that reaches 80%', () => {
    const g: GoalInput = { id: 'g', name: 'G', corpus: 100_000, monthly: 10_000, months: 120, target: 3_500_000, seed: 4 };
    const sip = sipForProbability(g, frontier[1], 0.8, 2000)!;
    expect(sip).toBeGreaterThan(g.monthly);
    expect(goalProbability(g, frontier[1], 2000, sip)).toBeGreaterThanOrEqual(0.8);
    expect(goalProbability(g, frontier[1], 2000, sip - 1000)).toBeLessThan(0.8);
  });
});
