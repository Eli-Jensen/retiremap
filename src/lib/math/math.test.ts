import { describe, expect, it } from 'vitest';
import { requiredMonthly, portfolioNeeded, withdrawalMonthly, equivAnnualUS, monthlyFromEquivAnnualUS } from './col.ts';
import { buildCurve, P_MIN, P_MAX } from './percentile.ts';
import deciles from '../../data/spendingDeciles.json';

describe('col math', () => {
  it('scales required spend by index ratio; home city is identity', () => {
    expect(requiredMonthly(4000, 50, 100)).toBe(2000);
    expect(requiredMonthly(4000, 80, 80)).toBe(4000);
  });
  it('4% rule: portfolio = 300x monthly', () => {
    expect(portfolioNeeded(4000, 0.04)).toBe(1_200_000);
    expect(withdrawalMonthly(1_200_000, 0.04)).toBe(4000);
  });
  it('forward/reverse consistency: portfolioNeeded at home makes home exactly break-even', () => {
    const monthly = 3500;
    const p = portfolioNeeded(monthly, 0.035);
    expect(withdrawalMonthly(p, 0.035)).toBeCloseTo(monthly, 10);
  });
  it('equivAnnualUS round-trips', () => {
    const annual = equivAnnualUS(4000, 68.47, 68.47);
    expect(annual).toBe(48000); // at US-average prices, equivalence is identity
    expect(monthlyFromEquivAnnualUS(annual, 40, 68.47)).toBeCloseTo(4000 * (40 / 68.47), 10);
  });
});

describe('percentile curve (real BLS anchors)', () => {
  const curve = buildCurve(deciles.anchors);

  it('reproduces every anchor exactly', () => {
    for (const { p, annual } of deciles.anchors) {
      expect(curve.percentileToSpend(p)).toBeCloseTo(annual, 6);
    }
  });

  it('is strictly monotone on a dense sweep', () => {
    let prev = -Infinity;
    for (let p = P_MIN; p <= P_MAX; p += 0.25) {
      const y = curve.percentileToSpend(p);
      expect(y).toBeGreaterThan(prev);
      prev = y;
    }
  });

  it('round-trips spend → percentile → spend (within the invertible [p1, p99] range)', () => {
    for (const annual of [30_000, 35_000, 55_000, 78_535, 120_000, 200_000]) {
      const p = curve.spendToPercentile(annual);
      expect(curve.percentileToSpend(p)).toBeCloseTo(annual, 1);
    }
  });

  it('clamps tails to [1, 99]', () => {
    expect(curve.spendToPercentile(1)).toBe(P_MIN);
    expect(curve.spendToPercentile(10_000_000)).toBe(P_MAX);
    expect(curve.percentileToSpend(-50)).toBe(curve.percentileToSpend(P_MIN));
    expect(curve.percentileToSpend(200)).toBe(curve.percentileToSpend(P_MAX));
  });

  it('median household spends less than the mean (right skew)', () => {
    expect(curve.percentileToSpend(50)).toBeLessThan(78_535);
  });

  it('rejects non-monotone anchors', () => {
    expect(() => buildCurve([{ p: 5, annual: 100 }, { p: 15, annual: 90 }])).toThrow();
  });
});
