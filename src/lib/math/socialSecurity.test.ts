import { describe, expect, it } from 'vitest';
import { aime, pia, claimFactor, spousalFactor, estimateSocialSecurity, SS_2026 } from './socialSecurity.ts';

describe('Social Security formula (2026 parameters)', () => {
  it('PIA is 90% / 32% / 15% across the bend points', () => {
    expect(pia(1000)).toBeCloseTo(900, 9);
    expect(pia(SS_2026.bend1)).toBeCloseTo(0.9 * 1286, 9);
    expect(pia(5000)).toBeCloseTo(0.9 * 1286 + 0.32 * (5000 - 1286), 9);
    expect(pia(10_000)).toBeCloseTo(0.9 * 1286 + 0.32 * (7749 - 1286) + 0.15 * (10_000 - 7749), 9);
  });
  it('AIME averages 35 years, caps at the taxable maximum, and counts missing years as zero', () => {
    expect(aime(120_000, 35)).toBeCloseTo(10_000, 9);
    expect(aime(500_000, 35)).toBeCloseTo(184_500 / 12, 9);
    expect(aime(120_000, 26)).toBeCloseTo((10_000 * 26) / 35, 9);
    expect(aime(120_000, 40)).toBeCloseTo(10_000, 9);
  });
  it('claiming adjustments match SSA: 70% at 62, 100% at 67, 124% at 70; spouse 32.5% at 62, 50% at 67', () => {
    expect(claimFactor(62)).toBeCloseTo(0.7, 9);
    expect(claimFactor(67)).toBe(1);
    expect(claimFactor(70)).toBeCloseTo(1.24, 9);
    expect(spousalFactor(62)).toBeCloseTo(0.325, 9);
    expect(spousalFactor(67)).toBe(0.5);
    expect(spousalFactor(70)).toBe(0.5);
  });
  it('a couple gets the larger of own or spousal benefit each', () => {
    const one = estimateSocialSecurity({ earnings: [150_000, 0], careerStartAge: 22, retireAge: 57, claimAge: 67 });
    const p = pia(aime(150_000, 35));
    expect(one).toBeCloseTo(12 * (p + 0.5 * p), 6);
  });
  it('retiring early lowers the benefit through zero years', () => {
    const early = estimateSocialSecurity({ earnings: [110_000], careerStartAge: 22, retireAge: 48, claimAge: 67 });
    const late = estimateSocialSecurity({ earnings: [110_000], careerStartAge: 22, retireAge: 65, claimAge: 67 });
    expect(early).toBeLessThan(late);
    expect(early).toBeCloseTo(12 * pia(aime(110_000, 26)), 6);
  });
});
