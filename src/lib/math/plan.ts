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

export type Buckets = { cash: number; brokerage: number; traditional: number; roth: number; hsa: number };
export type BucketKey = keyof Buckets;

/** What you put in each year, by where it goes. */
export type ContribKey = 'k401' | 'roth401k' | 'match' | 'rothIra' | 'hsa' | 'brokerage' | 'cash';
export type Contributions = Record<ContribKey, number>;
export const CONTRIB_KEYS: ContribKey[] = ['k401', 'roth401k', 'match', 'rothIra', 'hsa', 'brokerage', 'cash'];

/** IRS annual limits (inflation-indexed, so flat in today's dollars). */
export type Limits = {
  k401: number; // employee deferral, traditional + Roth 401(k) combined
  k401CatchUp50: number;
  k401CatchUp60to63: number; // replaces the 50+ catch-up at 60–63
  total415c: number; // employee + employer, excluding catch-ups
  ira: number;
  iraCatchUp50: number;
  hsaSelf: number;
  hsaFamily: number;
  hsaCatchUp55: number;
};

export type AccountsPlan = {
  age: number;
  buckets: Buckets;
  contributions: Contributions; // this year's amounts, real $
  contributionGrowth: number; // real growth per year (raises), fraction
  adults: number; // 1 or 2: each adult gets their own 401(k)/IRA limit
  limits: Limits;
  realReturn: number; // invested accounts
  cashReturn: number; // checking & savings
  tax: { traditional: number; brokerage: number }; // effective rates on withdrawals; cash, Roth, HSA are 0
};

export type YearContribution = {
  add: Buckets;
  wanted: number; // total you'd like to put in this year
  overflow: number; // pushed from capped accounts into brokerage
  capped: ContribKey[];
};

/**
 * One year's contributions at `age`, `scale` × this year's amounts. Anything
 * above an IRS cap goes to the taxable brokerage account instead — what a
 * saver who maxes out actually does. Employer match above the §415(c) room
 * simply isn't paid.
 */
export function yearContribution(c: Contributions, scale: number, age: number, adults: number, L: Limits): YearContribution {
  const capped: ContribKey[] = [];
  let overflow = 0;

  const deferralCap = adults * (L.k401 + (age >= 60 && age <= 63 ? L.k401CatchUp60to63 : age >= 50 ? L.k401CatchUp50 : 0));
  const wantK = c.k401 * scale;
  const wantR = c.roth401k * scale;
  const f = wantK + wantR > deferralCap ? deferralCap / (wantK + wantR) : 1;
  if (f < 1) {
    capped.push('k401', 'roth401k');
    overflow += (wantK + wantR) * (1 - f);
  }
  const k401 = wantK * f;
  const roth401k = wantR * f;

  const matchRoom = Math.max(0, adults * L.total415c - (k401 + roth401k));
  const wantMatch = c.match * scale;
  const match = Math.min(wantMatch, matchRoom);
  if (match < wantMatch) capped.push('match');

  const iraCap = adults * (L.ira + (age >= 50 ? L.iraCatchUp50 : 0));
  const wantIra = c.rothIra * scale;
  const rothIra = Math.min(wantIra, iraCap);
  if (rothIra < wantIra) {
    capped.push('rothIra');
    overflow += wantIra - rothIra;
  }

  const hsaCap = (adults > 1 ? L.hsaFamily : L.hsaSelf) + (age >= 55 ? adults * L.hsaCatchUp55 : 0);
  const wantHsa = c.hsa * scale;
  const hsa = Math.min(wantHsa, hsaCap);
  if (hsa < wantHsa) {
    capped.push('hsa');
    overflow += wantHsa - hsa;
  }

  return {
    add: {
      traditional: k401 + match,
      roth: roth401k + rothIra,
      hsa,
      brokerage: c.brokerage * scale + overflow,
      cash: c.cash * scale,
    },
    wanted: CONTRIB_KEYS.reduce((sum, k) => sum + c[k] * scale, 0),
    overflow,
    capped,
  };
}

/** One row per whole year from now: what you'd have if you retired then. */
export type ProjectionYear = { age: number; buckets: Buckets; portfolio: number; taxRate: number; contributed: number };

export function total(b: Buckets): number {
  return b.cash + b.brokerage + b.traditional + b.roth + b.hsa;
}

/**
 * Effective withdrawal tax when every account is drawn down pro rata. HSA
 * money is assumed to go to qualified medical costs (tax-free).
 */
export function blendedTax(b: Buckets, tax: AccountsPlan['tax']): number {
  const t = total(b);
  return t > 0 ? (b.traditional * tax.traditional + b.brokerage * tax.brokerage) / t : tax.traditional;
}

export function project(p: AccountsPlan, years: number): ProjectionYear[] {
  const out: ProjectionYear[] = [];
  let b = { ...p.buckets };
  let contributed = 0;
  for (let n = 0; n <= years; n++) {
    out.push({ age: p.age + n, buckets: b, portfolio: total(b), taxRate: blendedTax(b, p.tax), contributed });
    const g = 1 + p.realReturn;
    const y = yearContribution(p.contributions, Math.pow(1 + p.contributionGrowth, n), p.age + n, p.adults, p.limits);
    b = {
      cash: b.cash * (1 + p.cashReturn) + y.add.cash,
      brokerage: b.brokerage * g + y.add.brokerage,
      traditional: b.traditional * g + y.add.traditional,
      roth: b.roth * g + y.add.roth,
      hsa: b.hsa * g + y.add.hsa,
    };
    contributed += total(y.add);
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
