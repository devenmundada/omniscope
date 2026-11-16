import { describe, expect, it } from 'vitest';
import { buildFutureScenarios, project } from '@/lib/math/future-self';

describe('future self projections', () => {
  it('compound projection matches the closed-form SIP formula', () => {
    const r = 0.12, m = 120, sip = 10000;
    const v = project(0, m, () => sip, () => r).at(-1)!;
    const i = r / 12;
    expect(v).toBeCloseTo(sip * ((Math.pow(1 + i, m) - 1) / i), 0);
  });

  it('builds four scenarios ordered as expected against the base plan', () => {
    const s = buildFutureScenarios({ startCorpus: 500000, monthlyInvestment: 10000, annualReturn: 0.11, monthlySurplus: 30000, startYear: 2026 });
    expect(s.map((x) => x.id)).toEqual(['step-up', 'invest-more', 'conservative', 'pause']);
    const last = (id: string) => s.find((x) => x.id === id)!.data.at(-1)!;
    expect(last('step-up').alternativeStrategy).toBeGreaterThan(last('step-up').currentStrategy);
    expect(last('invest-more').alternativeStrategy).toBeGreaterThan(last('invest-more').currentStrategy);
    expect(last('conservative').alternativeStrategy).toBeLessThan(last('conservative').currentStrategy);
    expect(last('pause').alternativeStrategy).toBeLessThan(last('pause').currentStrategy);
    expect(last('pause').year).toBe(2046);
  });
});
