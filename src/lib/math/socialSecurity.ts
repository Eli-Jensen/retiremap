// Social Security estimate from earnings, using SSA's own benefit formula in
// today's dollars. Bend points and the taxable maximum are wage-indexed, so
// someone whose pay keeps pace with the national average wage has the same
// benefit in today's terms as if they claimed now.
//
// Simplification: every year from your career start to your retirement age
// counts at your current real earnings; years after that count as zero in the
// 35-year average (which is what bites early retirees). Your SSA statement
// (ssa.gov/myaccount) is the real number — type it over the estimate.

export const SS_2026 = {
  bend1: 1286, // $/mo, 2026 (ssa.gov/oact/cola/bendpoints.html)
  bend2: 7749,
  taxMax: 184_500, // $/yr, 2026 contribution and benefit base
  fullRetirementAge: 67, // born 1960 or later
  averagingYears: 35,
};

/** Average indexed monthly earnings for `years` of work at `annual` real earnings. */
export function aime(annual: number, years: number, p = SS_2026): number {
  const counted = Math.max(0, Math.min(years, p.averagingYears));
  return (Math.min(Math.max(0, annual), p.taxMax) * counted) / p.averagingYears / 12;
}

/** Primary insurance amount ($/mo at full retirement age): 90% / 32% / 15% of AIME across the bend points. */
export function pia(monthlyEarnings: number, p = SS_2026): number {
  const a = Math.max(0, monthlyEarnings);
  return 0.9 * Math.min(a, p.bend1) + 0.32 * Math.max(0, Math.min(a, p.bend2) - p.bend1) + 0.15 * Math.max(0, a - p.bend2);
}

/** Worker benefit as a fraction of PIA when claiming at `age` (62–70). */
export function claimFactor(age: number, p = SS_2026): number {
  const months = Math.round((Math.max(62, Math.min(70, age)) - p.fullRetirementAge) * 12);
  if (months >= 0) return 1 + (months / 12) * 0.08; // delayed retirement credits
  const early = -months;
  return 1 - (Math.min(early, 36) * 5) / 900 - (Math.max(0, early - 36) * 5) / 1200;
}

/** Spousal benefit as a fraction of the other spouse's PIA (no delayed credits). */
export function spousalFactor(age: number, p = SS_2026): number {
  const early = Math.max(0, Math.round((p.fullRetirementAge - Math.max(62, age)) * 12));
  return 0.5 * (1 - (Math.min(early, 36) * 25) / 3600 - (Math.max(0, early - 36) * 5) / 1200);
}

export type SsInput = {
  earnings: number[]; // current annual earnings per adult (1 or 2 entries)
  careerStartAge: number;
  retireAge: number; // earnings stop here
  claimAge: number;
};

/** Household Social Security, real $/yr, claimed at `claimAge` by everyone. */
export function estimateSocialSecurity(s: SsInput, p = SS_2026): number {
  const years = Math.max(0, s.retireAge - s.careerStartAge);
  const pias = s.earnings.map((e) => pia(aime(e, years, p), p));
  const own = claimFactor(s.claimAge, p);
  const spouse = spousalFactor(s.claimAge, p);
  let monthly = 0;
  pias.forEach((x, i) => {
    const other = pias.length === 2 ? pias[1 - i] : 0;
    monthly += Math.max(x * own, other * spouse);
  });
  return monthly * 12;
}
