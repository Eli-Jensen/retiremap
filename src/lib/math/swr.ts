// Safe-withdrawal-rate engine — the subset of trinity-study's swr.js (itself a
// line-for-line port of swr.py) this app needs. Parity is pinned by
// swr.test.ts against the Python reference cells.
//
// Closed form: with constant real withdrawal w and growth factors g_t, a
// cohort survives an H-period horizon iff w * S_{H-1} < P0 where
// S_t = sum_{u<=t} 1/G_u. Its *critical rate* is c = periodsPerYear / S, and
// the historical failure rate at rate r is mean(c <= r).

export type Market = {
  start: string; // "YYYY-MM"
  price: number[];
  dividend: number[];
  cpi: number[];
  gs10: number[]; // 10-year Treasury yield, %
};

export type Monthly = { stock: Float64Array; bond: Float64Array };

export function stockFactors(price: number[], dividend: number[]): Float64Array {
  const n = price.length - 1;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = price[i + 1] / price[i] + dividend[i] / 12 / price[i];
  return out;
}

export function bondFactors(yieldsPct: number[], maturityYears = 10, periodsPerYear = 12): Float64Array {
  const n = yieldsPct.length - 1;
  const out = new Float64Array(n);
  const m = maturityYears - 1 / periodsPerYear;
  for (let i = 0; i < n; i++) {
    const y0 = yieldsPct[i] / 100;
    const y1 = yieldsPct[i + 1] / 100;
    const c = y0; // bought at par
    const disc = Math.pow(1 + y1, -m);
    const price = (c * (1 - disc)) / y1 + disc;
    const buy = (c * (1 - Math.pow(1 + y0, -maturityYears))) / y0 + Math.pow(1 + y0, -maturityYears);
    out[i] = (price + c / periodsPerYear) / buy;
  }
  return out;
}

export function realFactors(nominal: Float64Array, cpi: number[]): Float64Array {
  const out = new Float64Array(nominal.length);
  for (let i = 0; i < nominal.length; i++) out[i] = (nominal[i] * cpi[i]) / cpi[i + 1];
  return out;
}

/** Monthly-rebalanced mix; w = stock fraction. */
export function mix(stock: Float64Array, bond: Float64Array, w: number): Float64Array {
  const out = new Float64Array(stock.length);
  for (let i = 0; i < stock.length; i++) out[i] = w * stock[i] + (1 - w) * bond[i];
  return out;
}

/** Real monthly stock and 10-year-Treasury factors over the whole record. */
export function buildMonthly(market: Market): Monthly {
  return {
    stock: realFactors(stockFactors(market.price, market.dividend), market.cpi),
    bond: realFactors(bondFactors(market.gs10), market.cpi),
  };
}

/** Annual withdrawal rate at which each overlapping monthly cohort just fails (start-of-period withdrawals). */
export function criticalRates(factors: Float64Array, horizon: number, periodsPerYear = 12): Float64Array {
  const n = factors.length;
  if (horizon > n) return new Float64Array(0);
  const logG = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) logG[i + 1] = logG[i] + Math.log(factors[i]);
  const d = new Float64Array(n + 2); // D_k = sum_{u<k} 1/G_u
  for (let i = 0; i <= n; i++) d[i + 1] = d[i] + Math.exp(-logG[i]);
  const cohorts = n - horizon + 1;
  const out = new Float64Array(cohorts);
  for (let s = 0; s < cohorts; s++) out[s] = periodsPerYear / (Math.exp(logG[s]) * (d[s + horizon] - d[s]));
  return out;
}

export function sorted(arr: Float64Array): Float64Array {
  return Float64Array.from(arr).sort();
}

/** Number of elements <= x in a sorted array. */
function countLE(sortedArr: Float64Array, x: number): number {
  let lo = 0;
  let hi = sortedArr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedArr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Fraction of cohorts failing at `rate`. `crit` may be unsorted. */
export function failureRate(crit: Float64Array, rate: number): number {
  const c = sorted(crit);
  return countLE(c, rate) / c.length;
}

/** Highest withdrawal rate with failure fraction <= maxFailure (a quantile of c). */
export function threshold(crit: Float64Array, maxFailure: number): number {
  const c = sorted(crit);
  const k = Math.floor(maxFailure * c.length);
  return c[Math.min(k, c.length - 1)];
}

/** Historical real geometric mean annual return of a monthly factor series. */
export function realCagr(factors: Float64Array): number {
  let s = 0;
  for (let i = 0; i < factors.length; i++) s += Math.log(factors[i]);
  return Math.exp((s / factors.length) * 12) - 1;
}

export const MIN_HORIZON = 5;
export const MAX_HORIZON = 70;

export type SwrTable = {
  /** SWR for a retirement lasting `years` (clamped to the table's range). */
  rate(years: number): number;
  /** Historical failure rate of `rate` over `years`. */
  failure(years: number, rate: number): number;
  /** Number of overlapping monthly cohorts behind `years`. */
  cohorts(years: number): number;
};

/**
 * Precomputes the sorted critical-rate distribution for every whole-year
 * horizon, so the per-city lookup in the planner is O(1) / O(log n).
 *
 * The raw 5th-percentile rate turns back *up* past ~57 years: those horizons
 * run out of data before the 1960s-70s cohorts start, so the worst starts
 * drop out. A longer retirement can't safely support a higher rate than a
 * shorter one, so rate() is the running minimum over shorter horizons.
 */
export function buildSwrTable(monthly: Monthly, stockWeight: number, maxFailure: number): SwrTable {
  const f = mix(monthly.stock, monthly.bond, stockWeight);
  const byYears: Float64Array[] = [];
  const rates: number[] = [];
  for (let h = MIN_HORIZON; h <= MAX_HORIZON; h++) {
    const c = sorted(criticalRates(f, h * 12));
    byYears[h] = c;
    const raw = c[Math.min(Math.floor(maxFailure * c.length), c.length - 1)];
    rates[h] = h === MIN_HORIZON ? raw : Math.min(raw, rates[h - 1]);
  }
  const clampH = (y: number) => Math.max(MIN_HORIZON, Math.min(MAX_HORIZON, Math.round(y)));
  return {
    rate: (y) => rates[clampH(y)],
    failure: (y, r) => {
      const c = byYears[clampH(y)];
      return countLE(c, r) / c.length;
    },
    cohorts: (y) => byYears[clampH(y)].length,
  };
}
