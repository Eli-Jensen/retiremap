// Lifestyle tiers, measured against locals: the ratio of your monthly spend
// (per OECD-equivalent adult) to the city's local reference — the average
// monthly net salary, floored at one person's typical non-rent costs so
// cities where pay doesn't cover the basket (Damascus, Lagos) don't call a
// $70 budget "like a local".

export type TierId = 'short' | 'scraping' | 'local' | 'comfortable' | 'well' | 'king';

export type Tier = { id: TierId; label: string; verb: string; min: number; blurb: string };

/**
 * Lower bound of each tier as a multiple of the local average net salary.
 * 0.43 is the median minimum-to-average wage ratio across 33 OECD
 * countries in 2024 (OECD MIN2AVE, full-time workers, gross); below it, even
 * a minimum-wage local out-earns you. Above that the ladder roughly doubles
 * at each step — a judgment call, shown on the Methods page.
 */
export const TIERS: readonly Tier[] = [
  { id: 'short', label: 'Not enough', verb: 'fall short', min: 0, blurb: 'Below what a minimum-wage local earns' },
  { id: 'scraping', label: 'Scraping by', verb: 'scrape by', min: 0.43, blurb: 'Less than a typical local salary' },
  { id: 'local', label: 'Like a local', verb: 'live like a local', min: 0.75, blurb: 'About what an average local earns' },
  { id: 'comfortable', label: 'Comfortable', verb: 'live comfortably', min: 1.5, blurb: 'Well above a typical local' },
  { id: 'well', label: 'Living well', verb: 'live well', min: 3, blurb: 'What the local upper-middle class spends' },
  { id: 'king', label: 'Like a king', verb: 'live like a king', min: 6, blurb: 'Six times the average local salary' },
];

export type Household = 'single' | 'couple';

/** OECD-modified equivalence scale: first adult 1.0, second adult 0.5. */
export const HOUSEHOLD_SCALE: Record<Household, number> = { single: 1, couple: 1.5 };

/** What one local adult lives on: max(average net salary, non-rent basics). */
export function localReference(c: { salary: number; basics: number }): number {
  return Math.max(c.salary, c.basics);
}

export function localRatio(monthlySpend: number, reference: number, household: Household): number {
  return monthlySpend / HOUSEHOLD_SCALE[household] / reference;
}

/** Index into TIERS for a local ratio. */
export function tierIndex(ratio: number): number {
  let i = 0;
  while (i + 1 < TIERS.length && ratio >= TIERS[i + 1].min) i++;
  return i;
}

/** Monthly spend that just reaches tier `i` in a city. */
export function tierSpend(i: number, reference: number, household: Household): number {
  return TIERS[i].min * reference * HOUSEHOLD_SCALE[household];
}
