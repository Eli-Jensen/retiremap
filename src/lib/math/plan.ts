// Retirement planner, all in real (today's) dollars.
//
// The portfolio is split in two:
//  - a perpetual part sized by the safe withdrawal rate for the full
//    retirement horizon, covering the long-run gap between spending and
//    income once every income stream has started and health care has
//    settled at its 65+ cost;
//  - a bridge covering the extra early-year shortfall (income not started
//    yet, pre-65 health care), priced like a bond ladder: each year's
//    shortfall discounted at a real bond return (0 = cash under the mattress).
// Every portfolio withdrawal is grossed up by a tax rate — blended across
// account types by their balances at retirement (pro-rata withdrawals).

export type Income = { annual: number; startAge: number };

export type Health = { under65: number; over65: number }; // $/mo

export const MEDICARE_AGE = 65;

export type Assumptions = {
  incomes: Income[];
  taxRate: number; // effective rate on portfolio withdrawals, fraction
  planToAge: number;
  swr: (years: number) => number; // annual rate for a retirement of `years`
  bridgeRate: number; // real annual return earned by the bridge ladder
};

export type NeedBreakdown = {
  total: number;
  perpetual: number; // sized by the SWR
  bridge: number; // present value of the early-year shortfall
  swr: number;
  horizon: number; // years
  longRunGap: number; // $/yr the perpetual part must cover, after tax gross-up
};

function incomeAt(incomes: Income[], age: number): number {
  let s = 0;
  for (const i of incomes) if (age >= i.startAge) s += i.annual;
  return s;
}

function healthAt(h: Health, age: number): number {
  return age >= MEDICARE_AGE ? h.over65 : h.under65;
}

/** Portfolio needed to spend `monthly` (+ health) from `retireAge` to the plan-to age. */
export function need(monthly: number, health: Health, retireAge: number, a: Assumptions, taxRate = a.taxRate): NeedBreakdown {
  const gross = 1 / (1 - taxRate);
  const horizon = Math.max(1, a.planToAge - retireAge);
  const swr = a.swr(horizon);

  // Long run: everything has started, health at its 65+ level.
  const lastChange = Math.max(MEDICARE_AGE, ...a.incomes.map((i) => i.startAge));
  const fullIncome = incomeAt(a.incomes, Infinity);
  const longRun = Math.max(0, 12 * (monthly + health.over65) - fullIncome);

  // Bridge years: the shortfall above the long-run gap until the last change.
  // Start-of-year withdrawals, so year 0 is undiscounted.
  let bridge = 0;
  let disc = 1;
  for (let age = retireAge; age < Math.min(lastChange, a.planToAge); age++) {
    const shortfall = Math.max(0, 12 * (monthly + healthAt(health, age)) - incomeAt(a.incomes, age));
    bridge += Math.max(0, shortfall - longRun) * disc;
    disc /= 1 + a.bridgeRate;
  }

  const perpetual = (longRun * gross) / swr;
  return {
    total: perpetual + bridge * gross,
    perpetual,
    bridge: bridge * gross,
    swr,
    horizon,
    longRunGap: longRun * gross,
  };
}

/**
 * Largest monthly spend a portfolio supports when retiring at `retireAge`.
 * need() is continuous and non-decreasing in spend, so bisection is exact
 * to the cent.
 */
export function affordableMonthly(
  portfolio: number,
  health: Health,
  retireAge: number,
  a: Assumptions,
  taxRate = a.taxRate,
): number {
  const total = (m: number) => need(m, health, retireAge, a, taxRate).total;
  if (total(0) > portfolio) return 0;
  let lo = 0;
  let hi = 1000;
  while (total(hi) <= portfolio) {
    lo = hi;
    hi *= 2;
    if (hi > 1e9) return hi;
  }
  for (let i = 0; i < 50 && hi - lo > 0.01; i++) {
    const mid = (lo + hi) / 2;
    if (total(mid) <= portfolio) lo = mid;
    else hi = mid;
  }
  return lo;
}

// --- accounts ---

export type Buckets = { cash: number; brokerage: number; traditional: number; roth: number };
export type BucketKey = keyof Buckets;

export type AccountsPlan = {
  age: number;
  buckets: Buckets;
  annualSavings: number; // real $/yr added at each year end until retirement
  savingsTo: BucketKey;
  realReturn: number; // invested accounts
  cashReturn: number; // checking & savings
  tax: { traditional: number; brokerage: number }; // effective rates on withdrawals; cash and Roth are 0
};

/** One row per whole year from now: what you'd have if you retired then. */
export type ProjectionYear = { age: number; buckets: Buckets; portfolio: number; taxRate: number };

export function total(b: Buckets): number {
  return b.cash + b.brokerage + b.traditional + b.roth;
}

/** Effective withdrawal tax when every account is drawn down pro rata. */
export function blendedTax(b: Buckets, tax: AccountsPlan['tax']): number {
  const t = total(b);
  return t > 0 ? (b.traditional * tax.traditional + b.brokerage * tax.brokerage) / t : tax.traditional;
}

export function project(p: AccountsPlan, years: number): ProjectionYear[] {
  const out: ProjectionYear[] = [];
  let b = { ...p.buckets };
  for (let n = 0; n <= years; n++) {
    out.push({ age: p.age + n, buckets: b, portfolio: total(b), taxRate: blendedTax(b, p.tax) });
    const g = 1 + p.realReturn;
    b = {
      cash: b.cash * (1 + p.cashReturn),
      brokerage: b.brokerage * g,
      traditional: b.traditional * g,
      roth: b.roth * g,
    };
    b[p.savingsTo] += p.annualSavings;
  }
  return out;
}

/**
 * First whole number of years from now at which the projected savings cover
 * need(monthly) for a retirement starting then; null if never within the
 * projection or before the plan-to age.
 */
export function yearsToRetireFrom(monthly: number, health: Health, proj: ProjectionYear[], a: Assumptions): number | null {
  for (let n = 0; n < proj.length && proj[n].age < a.planToAge; n++) {
    const y = proj[n];
    if (y.portfolio >= need(monthly, health, y.age, a, y.taxRate).total) return n;
  }
  return null;
}

export type Accumulation = {
  age: number;
  portfolio: number;
  annualSavings: number; // real $/yr added at each year end until retirement
  realReturn: number; // fraction
};

export function portfolioAfter(acc: Accumulation, years: number): number {
  const g = acc.realReturn;
  const f = Math.pow(1 + g, years);
  return acc.portfolio * f + (g === 0 ? acc.annualSavings * years : (acc.annualSavings * (f - 1)) / g);
}

export const MAX_YEARS = 60;

/**
 * First whole number of years from now at which the growing portfolio covers
 * need(monthly) for a retirement starting then; null if it never does before
 * MAX_YEARS or the plan-to age.
 */
export function yearsToRetire(monthly: number, health: Health, acc: Accumulation, a: Assumptions): number | null {
  const maxN = Math.min(MAX_YEARS, a.planToAge - acc.age - 1);
  for (let n = 0; n <= maxN; n++) {
    if (portfolioAfter(acc, n) >= need(monthly, health, acc.age + n, a).total) return n;
  }
  return null;
}
