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

import { project, blendedTax, yearsToRetireFrom, total, yearContribution } from './plan.ts';
import type { AccountsPlan, Contributions, Limits } from './plan.ts';

const L2026: Limits = {
  k401: 24_500,
  k401CatchUp50: 8_000,
  k401CatchUp60to63: 11_250,
  total415c: 72_000,
  ira: 7_500,
  iraCatchUp50: 1_100,
  hsaSelf: 4_400,
  hsaFamily: 8_750,
  hsaCatchUp55: 1_000,
};
const none: Contributions = { k401: 0, roth401k: 0, match: 0, rothIra: 0, hsa: 0, brokerage: 0, cash: 0 };
const zeroBuckets = { cash: 0, brokerage: 0, traditional: 0, roth: 0, hsa: 0 };

describe('contribution caps', () => {
  it('passes everything through under the caps', () => {
    const y = yearContribution({ ...none, k401: 10_000, match: 4_000, rothIra: 7_000, hsa: 4_000, brokerage: 5_000, cash: 1_000 }, 1, 35, 1, L2026);
    expect(y.add).toEqual({ traditional: 14_000, roth: 7_000, hsa: 4_000, brokerage: 5_000, cash: 1_000 });
    expect(y.overflow).toBe(0);
    expect(y.capped).toEqual([]);
  });
  it('shares the 401(k) deferral cap between traditional and Roth, spilling the rest to brokerage', () => {
    const y = yearContribution({ ...none, k401: 30_000, roth401k: 10_000 }, 1, 35, 1, L2026);
    expect(y.add.traditional + y.add.roth).toBeCloseTo(24_500, 9);
    expect(y.add.traditional / y.add.roth).toBeCloseTo(3, 9); // keeps your mix
    expect(y.add.brokerage).toBeCloseTo(15_500, 9);
    expect(y.capped).toContain('k401');
  });
  it('doubles personal limits for a couple; HSA uses the family limit', () => {
    const y = yearContribution({ ...none, k401: 60_000, rothIra: 20_000, hsa: 10_000 }, 1, 35, 2, L2026);
    expect(y.add.traditional).toBeCloseTo(49_000, 9);
    expect(y.add.roth).toBe(15_000);
    expect(y.add.hsa).toBe(8_750);
    expect(y.overflow).toBeCloseTo(11_000 + 5_000 + 1_250, 9);
  });
  it('adds catch-ups at 50, the bigger 401(k) catch-up at 60–63, and the HSA catch-up at 55', () => {
    const want = { ...none, k401: 50_000, rothIra: 10_000, hsa: 10_000 };
    expect(yearContribution(want, 1, 49, 1, L2026).add.traditional).toBe(24_500);
    expect(yearContribution(want, 1, 50, 1, L2026).add.traditional).toBe(32_500);
    expect(yearContribution(want, 1, 61, 1, L2026).add.traditional).toBe(35_750);
    expect(yearContribution(want, 1, 64, 1, L2026).add.traditional).toBe(32_500);
    expect(yearContribution(want, 1, 50, 1, L2026).add.roth).toBe(8_600);
    expect(yearContribution(want, 1, 54, 1, L2026).add.hsa).toBe(4_400);
    expect(yearContribution(want, 1, 55, 1, L2026).add.hsa).toBe(5_400);
  });
  it('caps the employer match at the §415(c) room left after your deferrals', () => {
    const y = yearContribution({ ...none, k401: 24_500, match: 60_000 }, 1, 35, 1, L2026);
    expect(y.add.traditional).toBe(72_000);
    expect(y.capped).toContain('match');
    expect(y.add.brokerage).toBe(0); // unpaid match isn't your money
  });
  it('scales every line by the growth factor before capping', () => {
    const y = yearContribution({ ...none, k401: 20_000, brokerage: 10_000 }, 1.5, 35, 1, L2026);
    expect(y.add.traditional).toBe(24_500);
    expect(y.add.brokerage).toBe(15_000 + 5_500);
    expect(y.wanted).toBe(45_000);
  });
});

describe('accounts', () => {
  const plan: AccountsPlan = {
    age: 40,
    buckets: { cash: 10_000, brokerage: 50_000, traditional: 100_000, roth: 40_000, hsa: 0 },
    contributions: { ...none, k401: 10_000 },
    contributionGrowth: 0,
    adults: 1,
    limits: L2026,
    realReturn: 0.05,
    cashReturn: 0,
    tax: { traditional: 0.1, brokerage: 0.02 },
  };
  it('blends tax by balance; cash, Roth and HSA are untaxed', () => {
    expect(blendedTax(plan.buckets, plan.tax)).toBeCloseTo((100_000 * 0.1 + 50_000 * 0.02) / 200_000, 12);
    expect(blendedTax(zeroBuckets, plan.tax)).toBe(0.1);
    expect(blendedTax({ ...zeroBuckets, hsa: 100, traditional: 100 }, plan.tax)).toBeCloseTo(0.05, 12);
  });
  it('grows invested accounts at the real return, cash at the cash return, and adds contributions at year end', () => {
    const p = project(plan, 2);
    expect(p[0].portfolio).toBe(200_000);
    expect(p[1].buckets.cash).toBe(10_000);
    expect(p[1].buckets.roth).toBeCloseTo(42_000, 9);
    expect(p[1].buckets.traditional).toBeCloseTo(115_000, 9);
    expect(p[1].contributed).toBe(10_000);
    expect(p[2].age).toBe(42);
  });
  it('matches the single-portfolio projection when everything is invested and flat', () => {
    const simple: AccountsPlan = { ...plan, buckets: { ...zeroBuckets, traditional: 200_000 } };
    expect(project(simple, 10)[10].portfolio).toBeCloseTo(portfolioAfter({ age: 40, portfolio: 200_000, annualSavings: 10_000, realReturn: 0.05 }, 10), 6);
  });
  it('raises contributions each year until they hit the cap', () => {
    const growing: AccountsPlan = { ...plan, buckets: zeroBuckets, contributions: { ...none, k401: 20_000 }, contributionGrowth: 0.1, realReturn: 0 };
    const p = project(growing, 4);
    expect(p[1].contributed).toBe(20_000);
    expect(p[2].contributed).toBeCloseTo(42_000, 9);
    expect(p[3].buckets.traditional).toBeCloseTo(20_000 + 22_000 + 24_200, 9);
    expect(p[4].buckets.traditional).toBeCloseTo(20_000 + 22_000 + 24_200 + 24_500, 9); // 26,620 capped
    expect(p[4].buckets.brokerage).toBeCloseTo(2_120, 9);
  });
  it('yearsToRetireFrom uses each year’s own tax blend', () => {
    const roth: AccountsPlan = { ...plan, buckets: { ...zeroBuckets, roth: 500_000 }, contributions: none };
    const trad: AccountsPlan = { ...roth, buckets: { ...zeroBuckets, traditional: 500_000 } };
    const a = flat4();
    const yr = yearsToRetireFrom(1700, noHealth, project(roth, 30), a)!;
    const yt = yearsToRetireFrom(1700, noHealth, project(trad, 30), a)!;
    expect(yr).toBeLessThan(yt); // same balance, taxed money buys less
  });
});
