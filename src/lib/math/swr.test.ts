import { describe, expect, it } from 'vitest';
import marketJson from '../../data/market.json';
import ref from './swr.reference.json';
import * as swr from './swr.ts';
import type { Market } from './swr.ts';

const monthly = swr.buildMonthly(marketJson as Market);
type Cell = { cohorts: number; fail_4pct: number; thr_5pct: number; thr_0pct: number; crit_first5: number[] };
const cells = ref.updated as Record<string, Cell>;

describe('SWR engine parity with trinity-study swr.py', () => {
  for (const [key, r] of Object.entries(cells)) {
    const [w, h] = key.split('_').map(Number);
    it(`allocation ${w}, ${h}-year horizon`, () => {
      const c = swr.criticalRates(swr.mix(monthly.stock, monthly.bond, w), h * 12);
      expect(c.length).toBe(r.cohorts);
      for (let i = 0; i < 5; i++) expect(c[i]).toBeCloseTo(r.crit_first5[i], 10);
      expect(swr.failureRate(c, 0.04)).toBeCloseTo(r.fail_4pct, 12);
      expect(swr.threshold(c, 0.05)).toBeCloseTo(r.thr_5pct, 10);
      expect(swr.threshold(c, 0.0)).toBeCloseTo(r.thr_0pct, 10);
    });
  }
});

describe('buildSwrTable', () => {
  const t = swr.buildSwrTable(monthly, 0.75, 0.05);
  it('matches the direct threshold at a reference cell', () => {
    expect(t.rate(30)).toBeCloseTo(cells['0.75_30'].thr_5pct, 10);
    expect(t.failure(30, 0.04)).toBeCloseTo(cells['0.75_30'].fail_4pct, 12);
    expect(t.cohorts(40)).toBe(cells['0.75_40'].cohorts);
  });
  it('longer retirements never get a higher rate', () => {
    for (let y = swr.MIN_HORIZON + 1; y <= swr.MAX_HORIZON; y++) expect(t.rate(y)).toBeLessThanOrEqual(t.rate(y - 1) + 1e-12);
  });
  it('clamps horizons outside the table', () => {
    expect(t.rate(1)).toBe(t.rate(swr.MIN_HORIZON));
    expect(t.rate(200)).toBe(t.rate(swr.MAX_HORIZON));
  });
});

describe('realCagr', () => {
  it('is in a plausible range for US stocks and Treasuries since 1871', () => {
    const s = swr.realCagr(monthly.stock);
    const b = swr.realCagr(monthly.bond);
    expect(s).toBeGreaterThan(0.05);
    expect(s).toBeLessThan(0.08);
    expect(b).toBeGreaterThan(0.01);
    expect(b).toBeLessThan(0.04);
  });
});
