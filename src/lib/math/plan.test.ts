import { describe, expect, it } from 'vitest';
import { need, affordableMonthly, yearsToRetire, portfolioAfter } from './plan.ts';
import type { Assumptions, Health } from './plan.ts';
import { TIERS, tierIndex, localRatio, localReference, tierSpend } from './tiers.ts';

const noHealth: Health = { under65: 0, over65: 0 };
const flat4 = (over: Partial<Assumptions> = {}): Assumptions => ({
  incomes: [],
  taxRate: 0,
  planToAge: 95,
  swr: () => 0.04,
  bridgeRate: 0,
  ...over,
});

describe('need', () => {
  it('reduces to the 4% rule with no income, health, or tax', () => {
    expect(need(4000, noHealth, 65, flat4()).total).toBeCloseTo(1_200_000, 6);
  });
  it('$1M at 4%, nothing else, buys $3,333/mo', () => {
    expect(affordableMonthly(1_000_000, noHealth, 65, flat4())).toBeCloseTo(3333.33, 1);
  });
  it('grosses withdrawals up for tax', () => {
    expect(need(4000, noHealth, 65, flat4({ taxRate: 0.2 })).total).toBeCloseTo(1_500_000, 6);
  });
  it('income already flowing just shrinks the gap', () => {
    const a = flat4({ incomes: [{ annual: 24_000, startAge: 60 }] });
    expect(need(4000, noHealth, 65, a).total).toBeCloseTo(600_000, 6);
    expect(need(4000, noHealth, 65, a).bridge).toBe(0);
  });
  it('income starting later adds an undiscounted bridge', () => {
    const a = flat4({ incomes: [{ annual: 24_000, startAge: 67 }] });
    const n = need(4000, noHealth, 62, a);
    expect(n.perpetual).toBeCloseTo(600_000, 6);
    expect(n.bridge).toBeCloseTo(5 * 24_000, 6);
  });
  it('discounts bridge years at the bridge rate', () => {
    const a = flat4({ incomes: [{ annual: 24_000, startAge: 64 }], bridgeRate: 0.02 });
    const n = need(4000, noHealth, 62, a);
    expect(n.bridge).toBeCloseTo(24_000 + 24_000 / 1.02, 6);
  });
  it('income bigger than spending needs no portfolio once started, but still a bridge', () => {
    const a = flat4({ incomes: [{ annual: 60_000, startAge: 67 }] });
    const n = need(2000, noHealth, 65, a);
    expect(n.perpetual).toBe(0);
    expect(n.bridge).toBeCloseTo(2 * 24_000, 6);
  });
  it('pre-65 health care is a bridge, 65+ health care is perpetual', () => {
    const h = { under65: 1000, over65: 400 };
    const n = need(3000, h, 60, flat4());
    expect(n.perpetual).toBeCloseTo((12 * 3400) / 0.04, 6);
    expect(n.bridge).toBeCloseTo(5 * 12 * 600, 6);
  });
  it('uses the SWR for the remaining horizon', () => {
    const seen: number[] = [];
    need(1000, noHealth, 40, flat4({ swr: (y) => (seen.push(y), 0.035) }));
    expect(seen).toEqual([55]);
  });
});

describe('affordableMonthly', () => {
  it('inverts need()', () => {
    const a = flat4({ incomes: [{ annual: 20_000, startAge: 67 }], taxRate: 0.12 });
    const h = { under65: 800, over65: 300 };
    const s = affordableMonthly(900_000, h, 58, a);
    expect(need(s, h, 58, a).total).toBeLessThanOrEqual(900_000);
    expect(need(s + 1, h, 58, a).total).toBeGreaterThan(900_000);
  });
  it('is 0 when even the bridge for health care is unaffordable', () => {
    expect(affordableMonthly(1000, { under65: 1000, over65: 1000 }, 50, flat4())).toBe(0);
  });
});

describe('yearsToRetire', () => {
  const acc = { age: 40, portfolio: 300_000, annualSavings: 20_000, realReturn: 0.05 };
  it('is 0 when already enough', () => {
    expect(yearsToRetire(500, noHealth, { ...acc, portfolio: 1e7 }, flat4())).toBe(0);
  });
  it('matches the first year the projection crosses the need', () => {
    const n = yearsToRetire(4000, noHealth, acc, flat4())!;
    expect(portfolioAfter(acc, n)).toBeGreaterThanOrEqual(1_200_000);
    expect(portfolioAfter(acc, n - 1)).toBeLessThan(1_200_000);
  });
  it('more savings never retires you later; more spending never earlier', () => {
    const base = yearsToRetire(5000, noHealth, acc, flat4())!;
    expect(yearsToRetire(5000, noHealth, { ...acc, annualSavings: 40_000 }, flat4())!).toBeLessThanOrEqual(base);
    expect(yearsToRetire(6000, noHealth, acc, flat4())!).toBeGreaterThanOrEqual(base);
  });
  it('returns null when it never works', () => {
    expect(yearsToRetire(1e6, noHealth, acc, flat4())).toBeNull();
  });
  it('handles a zero real return', () => {
    expect(portfolioAfter({ ...acc, realReturn: 0 }, 10)).toBe(500_000);
  });
});

describe('tiers', () => {
  it('ladder is strictly increasing', () => {
    for (let i = 1; i < TIERS.length; i++) expect(TIERS[i].min).toBeGreaterThan(TIERS[i - 1].min);
  });
  it('boundaries land in the upper tier', () => {
    for (let i = 0; i < TIERS.length; i++) {
      expect(tierIndex(TIERS[i].min)).toBe(i);
      if (i > 0) expect(tierIndex(TIERS[i].min - 1e-9)).toBe(i - 1);
    }
  });
  it('floors the local reference at non-rent basics', () => {
    expect(localReference({ salary: 1500, basics: 900 })).toBe(1500);
    expect(localReference({ salary: 75, basics: 566 })).toBe(566);
    // $72/mo in a city where locals earn $75 but basics cost $566 is not "like a local".
    expect(tierIndex(localRatio(72, localReference({ salary: 75, basics: 566 }), 'single'))).toBe(0);
  });
  it('couples need 1.5x for the same tier', () => {
    expect(localRatio(1500, 1000, 'couple')).toBeCloseTo(1, 12);
    expect(tierSpend(2, 1000, 'couple')).toBeCloseTo(1125, 12);
    expect(tierIndex(localRatio(tierSpend(4, 800, 'single'), 800, 'single'))).toBe(4);
  });
});
