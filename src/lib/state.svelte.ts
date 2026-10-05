import type { CityRecord, Meta, Place, SpendingDeciles } from './types.ts';
import { buildCurve } from './math/percentile.ts';
import { equivAnnualUS } from './math/col.ts';
import { buildMonthly, buildSwrTable, mix, realCagr } from './math/swr.ts';
import type { Market } from './math/swr.ts';
import { affordableMonthly, need, project, yearsToRetireFrom, yearContribution, MAX_YEARS, CONTRIB_KEYS } from './math/plan.ts';
import type { Assumptions, Buckets, ContribKey, Contributions, Health, Limits, NeedBreakdown, ProjectionYear } from './math/plan.ts';
import { estimateSocialSecurity } from './math/socialSecurity.ts';
import { TIERS, tierIndex, localRatio, localReference, tierSpend } from './math/tiers.ts';
import type { Household } from './math/tiers.ts';
import { METRICS, passes } from './metrics.ts';
import type { MetricId, Units } from './metrics.ts';
import citiesJson from '../data/cities.json';
import metaJson from '../data/meta.json';
import decilesJson from '../data/spendingDeciles.json';
import marketJson from '../data/market.json';
import placesJson from '../data/places.json';
import defaultsJson from '../data/defaults.json';

export const cities = citiesJson as CityRecord[];
export const meta = metaJson as Meta;
export const deciles = decilesJson as SpendingDeciles;
export const places = placesJson as Place[];
export const placeById = new Map(places.map((p) => [p.id, p]));
export const defaults = defaultsJson;
export const curve = buildCurve(deciles.anchors);
export const cityById = new Map(cities.map((c) => [c.id, c]));

const monthly = buildMonthly(marketJson as Market);
/** Historical real return of 10-year Treasuries: what the bridge ladder earns. */
export const BRIDGE_RATE = realCagr(monthly.bond);

export type PersonaId = 'fire' | 'typical';
export type Persona = (typeof defaults.personas)[PersonaId];
export const PERSONAS: PersonaId[] = ['fire', 'typical'];
const byAge = (brackets: { maxAge: number; value: number }[], age: number) => brackets.find((b) => age <= b.maxAge)!.value;

export type Mode = 'at' | 'when';
export type TierWhen = 'now' | 'within' | 'by' | 'at';
export type FlightFilter = 'off' | 'any' | 'yr';
export const US_AIRPORTS = meta.flights?.usAirports ?? [];
const IN_US = new Set(['US', 'PR']);
export const inUS = (c: CityRecord) => IN_US.has(c.iso2);

/** US airports with nonstops near a city (year-round first); null for cities in the US. */
export function usAirportsFor(c: CityRecord, includeSeasonal = true): string[] | null {
  if (inUS(c)) return null;
  const f = c.usFlights;
  if (!f) return [];
  return includeSeasonal ? [...f.yearRound, ...f.seasonal] : f.yearRound;
}

/** Cities in the US always pass: you're already there. */
export function passesFlights(c: CityRecord, mode: FlightFilter, to: string | null): boolean {
  if (mode === 'off' || inUS(c)) return true;
  const list = usAirportsFor(c, mode === 'any')!;
  return to ? list.includes(to) : list.length > 0;
}
export type CostUnit = 'mo' | 'yr' | 'egg';
export const LIMITS: Limits = defaults.limits;
/** Map on wide screens, list on phones — until you pick one (remembered). */
export const DEFAULT_TAB: Tab =
  typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches ? 'list' : 'map';
export type Tab = 'map' | 'list';

/** Tier indices that have a "when could I…" answer (everything but "Not enough"). */
export const TARGET_TIERS = [1, 2, 3, 4, 5] as const;

export type CityResult = {
  health: Health; // household $/mo
  spendNow: number; // $/mo you could spend retiring today (excl. health)
  tierNow: number;
  spendAt: number; // $/mo you could spend retiring at the chosen age (excl. health)
  ratioAt: number; // spendAt vs the local reference, per adult-equivalent
  tierAt: number; // index into TIERS
  years: (number | null)[]; // by tier index: years from now until you could retire here at that tier
  costs: number[]; // by tier index: $/mo that reaches the tier here (excl. health)
  nestEggs: number[]; // by tier index: savings needed to retire here at that tier at your retirement age
  cls: number; // map class: 0 = gray, 1..5 = palette
  visible: boolean; // passes every filter
};

/** When-mode buckets: years until retirement → map class (higher = sooner). */
export const WHEN_BUCKETS = [
  { cls: 5, label: 'Now', max: 0 },
  { cls: 4, label: '≤ 5 yrs', max: 5 },
  { cls: 3, label: '≤ 10 yrs', max: 10 },
  { cls: 2, label: '≤ 20 yrs', max: 20 },
  { cls: 1, label: '20+ yrs', max: Infinity },
] as const;

export function whenClass(years: number | null): number {
  if (years === null) return 0;
  return WHEN_BUCKETS.find((b) => years <= b.max)!.cls;
}

// --- list columns ---

export type ColumnId = 'now' | 'at' | `t${1 | 2 | 3 | 4 | 5}` | 'salary' | 'flights' | MetricId;
export const COLUMNS: { id: ColumnId; label: string; short?: string }[] = [
  { id: 'now', label: 'Retire today' },
  { id: 'at', label: 'At your retirement age' },
  ...TARGET_TIERS.map((t) => ({ id: `t${t}` as ColumnId, label: TIERS[t].label })),
  ...METRICS.map((m) => ({ id: m.id as ColumnId, label: m.label, short: m.short })),
  { id: 'salary', label: 'Local salary', short: 'Salary' },
  { id: 'flights', label: 'Nonstop US airports', short: 'US flights' },
];
export const DEFAULT_COLUMNS: ColumnId[] = ['now', 'at', 't1', 't2', 't3', 't4', 't5', 'qol', 'pop'];
export type SortKey = 'best' | 'name' | ColumnId;

class AppState {
  // --- you. null = follow the persona's data-backed default (which may depend on age) ---
  persona = $state<PersonaId>('fire');
  ageInput = $state<number | null>(null);
  householdInput = $state<Household | null>(null);
  retireAgeInput = $state<number | null>(null);

  // --- accounts ---
  checkingInput = $state<number | null>(null);
  savingsAcct = $state(0);
  brokerageInput = $state<number | null>(null);
  traditionalInput = $state<number | null>(null);
  roth = $state(0);
  hsaBalance = $state(0);
  contribInput = $state<Partial<Contributions>>({}); // missing = persona default (% of income)
  growthInput = $state<number | null>(null);

  // --- income (drives contribution defaults and the Social Security estimate) ---
  incomeInput = $state<number | null>(null);
  partnerIncomeInput = $state<number | null>(null);
  careerStartInput = $state<number | null>(null);

  // --- income ---
  ssInput = $state<number | null>(null);
  ssStartAge = $state(defaults.socialSecurity.startAge);
  otherIncome = $state(defaults.otherIncome.value);
  otherStartAge = $state(defaults.otherIncome.startAge);

  // --- assumptions ---
  stockInput = $state<number | null>(null);
  maxFailure = $state(defaults.maxFailure);
  planToAge = $state(defaults.planToAge.value);
  taxRate = $state(defaults.taxRate.value); // traditional withdrawals
  brokerageTax = $state(defaults.brokerageTax.value);
  healthOn = $state(true);
  swrFixed = $state<number | null>(null); // null = historical, by horizon
  returnFixed = $state<number | null>(null); // null = historical CAGR of the mix

  // --- filters ---
  only = $state<string[]>([]); // place ids; empty = everywhere
  never = $state<string[]>([]);
  metricLimits = $state<Partial<Record<MetricId, number>>>({}); // e.g. { safety: 60, rent: 40 }
  flights = $state<FlightFilter>('off'); // nonstop to the US: off | incl. seasonal | year-round
  flightTo = $state<string | null>(null); // a specific US airport (IATA), or any
  minTier = $state(0); // only cities where you could live at least this tier…
  minTierWhen = $state<TierWhen>('now'); // …today, at your retirement age, or by a given age
  minTierByAge = $state(55);
  minTierWithin = $state(5); // years

  // --- view ---
  mode = $state<Mode>('at');
  targetTier = $state(2); // "Like a local"
  tab = $state<Tab>(DEFAULT_TAB);
  columns = $state<ColumnId[]>([...DEFAULT_COLUMNS]);
  sort = $state<SortKey>('best');
  sortDesc = $state(false);
  costUnit = $state<CostUnit>('mo'); // how tier columns show a city's price
  units = $state<Units>('us'); // °F / inches vs °C / mm
  selectedCityId = $state<string | null>(null);
  methodsOpen = $state(false);
  sharedPlan = $state(false); // opened from someone's link; not saved until edited

  // --- effective inputs ---
  p: Persona = $derived(defaults.personas[this.persona]);
  age = $derived(this.ageInput ?? this.p.age);
  household: Household = $derived(this.householdInput ?? (this.p.household as Household));
  retireAge = $derived(Math.max(this.age, this.retireAgeInput ?? this.p.retireAge));
  checking = $derived(this.checkingInput ?? byAge(this.p.cashByAge, this.age));
  traditional = $derived(this.traditionalInput ?? byAge(this.p.retirementByAge, this.age));
  brokerage = $derived(this.brokerageInput ?? byAge(this.p.brokerageByAge, this.age));
  stockPct = $derived(this.stockInput ?? this.p.stockPct);
  persons = $derived(this.household === 'couple' ? 2 : 1);
  income = $derived(this.incomeInput ?? this.p.income.you);
  partnerIncome = $derived(this.household === 'couple' ? (this.partnerIncomeInput ?? this.p.income.partner) : 0);
  householdIncome = $derived(this.income + this.partnerIncome);
  careerStart = $derived(this.careerStartInput ?? defaults.careerStartAge.value);
  /** IRS caps at your current age (household totals). */
  caps = $derived.by(() => {
    const a = this.age;
    const n = this.persons;
    return {
      k401: n * (LIMITS.k401 + (a >= 60 && a <= 63 ? LIMITS.k401CatchUp60to63 : a >= 50 ? LIMITS.k401CatchUp50 : 0)),
      ira: n * (LIMITS.ira + (a >= 50 ? LIMITS.iraCatchUp50 : 0)),
      hsa: (n > 1 ? LIMITS.hsaFamily : LIMITS.hsaSelf) + (a >= 55 ? n * LIMITS.hsaCatchUp55 : 0),
    };
  });
  /** Your amounts where typed, else the persona's share of income — clipped to this year's caps so defaults never overflow. */
  contributions: Contributions = $derived.by(() => {
    const def = (k: ContribKey) => Math.round((this.p.contributionPct[k] * this.householdIncome) / 100) * 100;
    const c = Object.fromEntries(CONTRIB_KEYS.map((k) => [k, this.contribInput[k] ?? def(k)])) as Contributions;
    const typed = (k: ContribKey) => this.contribInput[k] !== undefined;
    if (!typed('rothIra')) c.rothIra = Math.min(c.rothIra, this.caps.ira);
    if (!typed('hsa')) c.hsa = Math.min(c.hsa, this.caps.hsa);
    if (!typed('k401')) c.k401 = Math.min(c.k401, Math.max(0, this.caps.k401 - c.roth401k));
    if (!typed('roth401k')) c.roth401k = Math.min(c.roth401k, Math.max(0, this.caps.k401 - c.k401));
    return c;
  });
  contributionGrowth = $derived(this.growthInput ?? defaults.contributionGrowth.value);
  /** This year's contributions after IRS caps (what actually lands where). */
  thisYear = $derived(yearContribution(this.contributions, 1, this.age, this.persons, LIMITS));
  socialSecurityEstimate = $derived(
    estimateSocialSecurity({
      earnings: this.household === 'couple' ? [this.income, this.partnerIncome] : [this.income],
      careerStartAge: this.careerStart,
      retireAge: this.retireAge,
      claimAge: this.ssStartAge,
    }),
  );
  socialSecurity = $derived(this.ssInput ?? Math.round(this.socialSecurityEstimate / 10) * 10);
  buckets: Buckets = $derived({
    cash: this.checking + this.savingsAcct,
    brokerage: this.brokerage,
    traditional: this.traditional,
    roth: this.roth,
    hsa: this.hsaBalance,
  });
  netWorth = $derived(this.buckets.cash + this.buckets.brokerage + this.buckets.traditional + this.buckets.roth + this.buckets.hsa);

  swrTable = $derived(buildSwrTable(monthly, this.stockPct / 100, this.maxFailure));
  historicalReturn = $derived(realCagr(mix(monthly.stock, monthly.bond, this.stockPct / 100)));
  realReturn = $derived(this.returnFixed ?? this.historicalReturn);

  assumptions: Assumptions = $derived.by(() => {
    const table = this.swrTable;
    const fixed = this.swrFixed;
    return {
      incomes: [
        { annual: this.socialSecurity, startAge: this.ssStartAge },
        { annual: this.otherIncome, startAge: this.otherStartAge },
      ].filter((i) => i.annual > 0),
      taxRate: this.taxRate,
      planToAge: this.planToAge,
      swr: fixed === null ? table.rate : () => fixed,
      bridgeRate: BRIDGE_RATE,
    };
  });

  /** What you'd have, and its tax blend, if you retired 0..N years from now. */
  projection: ProjectionYear[] = $derived(
    project(
      {
        age: this.age,
        buckets: this.buckets,
        contributions: this.contributions,
        contributionGrowth: this.contributionGrowth,
        adults: this.persons,
        limits: LIMITS,
        realReturn: this.realReturn,
        cashReturn: defaults.cashReturn.value,
        tax: { traditional: this.taxRate, brokerage: this.brokerageTax },
      },
      Math.max(0, Math.min(MAX_YEARS, this.planToAge - this.age)),
    ),
  );
  atRetirement = $derived(this.projection[Math.min(this.retireAge - this.age, this.projection.length - 1)]);

  healthUS: Health = $derived(this.scaleHealth(defaults.health.us));
  healthAbroad: Health = $derived(this.scaleHealth(defaults.health.abroad));

  results = $derived.by(() => {
    const a = this.assumptions;
    const proj = this.projection;
    const at = this.atRetirement;
    // Spend at the retirement age only depends on the health schedule (US or not).
    const now = proj[0];
    const spendUS = affordableMonthly(at.portfolio, this.healthUS, at.age, a, at.taxRate);
    const spendAbroad = affordableMonthly(at.portfolio, this.healthAbroad, at.age, a, at.taxRate);
    const nowUS = affordableMonthly(now.portfolio, this.healthUS, now.age, a, now.taxRate);
    const nowAbroad = affordableMonthly(now.portfolio, this.healthAbroad, now.age, a, now.taxRate);
    const tierBy = this.tierDeadline;
    const only = new Set(this.only);
    const limits = this.metricLimits;
    const never = new Set(this.never);
    const out = new Map<string, CityResult>();
    for (const c of cities) {
      const us = c.iso2 === 'US';
      const health = us ? this.healthUS : this.healthAbroad;
      const spendAt = us ? spendUS : spendAbroad;
      const ref = localReference(c);
      const ratioAt = localRatio(spendAt, ref, this.household);
      const tierAt = tierIndex(ratioAt);
      const spendNow = us ? nowUS : nowAbroad;
      const tierNow = tierIndex(localRatio(spendNow, ref, this.household));
      const years: (number | null)[] = [null];
      const costs: number[] = [0];
      const nestEggs: number[] = [0];
      for (const t of TARGET_TIERS) {
        costs[t] = tierSpend(t, ref, this.household);
        years[t] = yearsToRetireFrom(costs[t], health, proj, a);
        nestEggs[t] = need(costs[t], health, at.age, a, at.taxRate).total;
      }
      const visible =
        (only.size === 0 || c.places.some((p) => only.has(p))) &&
        !c.places.some((p) => never.has(p)) &&
        METRICS.every((m) => passes(m, c, limits[m.id])) &&
        passesFlights(c, this.flights, this.flightTo) &&
        (this.minTier <= 0 || (years[this.minTier] !== null && this.age + years[this.minTier]! <= tierBy));
      out.set(c.id, {
        health,
        spendNow,
        tierNow,
        spendAt,
        ratioAt,
        tierAt,
        years,
        costs,
        nestEggs,
        cls: this.mode === 'at' ? tierAt : whenClass(years[this.targetTier]),
        visible,
      });
    }
    return out;
  });

  /** Headline numbers over the filtered cities. */
  summary = $derived.by(() => {
    const byTier = TIERS.map(() => 0);
    let shown = 0;
    let soonest: number | null = null;
    let soonestCount = 0;
    for (const c of cities) {
      const r = this.results.get(c.id)!;
      if (!r.visible) continue;
      shown++;
      byTier[r.tierAt]++;
      const y = r.years[this.targetTier];
      if (y !== null) {
        if (soonest === null || y < soonest) {
          soonest = y;
          soonestCount = 1;
        } else if (y === soonest) soonestCount++;
      }
    }
    return { shown, byTier, retirable: shown - byTier[0], soonest, soonestCount };
  });

  /** Latest age the lifestyle filter accepts. */
  tierDeadline = $derived(
    this.minTierWhen === 'now'
      ? this.age
      : this.minTierWhen === 'within'
        ? this.age + this.minTierWithin
        : this.minTierWhen === 'at'
          ? this.retireAge
          : this.minTierByAge,
  );

  filtersActive = $derived(
    this.only.length +
      this.never.length +
      Object.keys(this.metricLimits).length +
      Number(this.flights !== 'off') +
      Number(this.minTier > 0),
  );

  selectedCity = $derived(this.selectedCityId ? (cityById.get(this.selectedCityId) ?? null) : null);

  /** Full breakdown for the detail card (one city, so recomputing is fine). */
  breakdown(c: CityRecord): { at: NeedBreakdown; target: NeedBreakdown | null; targetAge: number | null } {
    const r = this.results.get(c.id)!;
    const at = this.atRetirement;
    const y = r.years[this.targetTier];
    const target = y === null ? null : this.projection[y];
    return {
      at: need(r.spendAt, r.health, at.age, this.assumptions, at.taxRate),
      target: target ? need(tierSpend(this.targetTier, localReference(c), this.household), r.health, target.age, this.assumptions, target.taxRate) : null,
      targetAge: target?.age ?? null,
    };
  }

  /** Cost-adjusted US spending percentile of a monthly budget in a city. */
  usPercentile(monthlySpend: number, c: CityRecord): number {
    return curve.spendToPercentile(equivAnnualUS(monthlySpend, c.colRent, meta.usRefIndex.colRent));
  }

  /** Set or clear (null) one index filter. */
  setLimit(id: MetricId, v: number | null) {
    const next = { ...this.metricLimits };
    if (v === null) delete next[id];
    else next[id] = v;
    this.metricLimits = next;
  }

  setPlace(id: string, list: 'only' | 'never' | null) {
    this.only = this.only.filter((p) => p !== id);
    this.never = this.never.filter((p) => p !== id);
    if (list === 'only') this.only = [...this.only, id];
    if (list === 'never') this.never = [...this.never, id];
  }

  clearFilters() {
    for (const f of FIELDS) if (FILTER_KEYS.has(f.key)) f.reset();
  }

  private scaleHealth(h: { under65: number; over65: number }): Health {
    const k = this.healthOn ? this.persons : 0;
    return { under65: h.under65 * k, over65: h.over65 * k };
  }
}

export const app = new AppState();

// --- URL hash / saved state <-> app. Only non-defaults are written; a hash
// that omits a key puts that field back to its default. ---

type Field = { key: string; get: () => string; isDefault: () => boolean; set: (raw: string) => void; reset: () => void };

function field<T>(key: string, get: () => T, assign: (v: T) => void, parse: (raw: string) => T, def: T): Field {
  return { key, get: () => String(get()), isDefault: () => get() === def, set: (raw) => assign(parse(raw)), reset: () => assign(def) };
}

function listField<T extends string>(key: string, get: () => T[], assign: (v: T[]) => void, valid: (s: string) => boolean, def: T[]): Field {
  const same = (a: T[]) => a.length === def.length && a.every((x, i) => x === def[i]);
  return {
    key,
    get: () => get().join(','),
    isDefault: () => same(get()),
    set: (raw) => assign(raw.split(',').filter((s) => s && valid(s)) as T[]),
    reset: () => assign([...def]),
  };
}

const num = (raw: string): number | null => {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) ? n : null;
};
const clamped = (lo: number, hi: number, fallback: number) => (raw: string) => {
  const n = num(raw);
  return n === null ? fallback : Math.max(lo, Math.min(hi, n));
};
const money = (raw: string) => {
  const n = num(raw);
  return n === null ? null : Math.max(0, n);
};
const d = defaults;

const nullableAge = (lo: number, hi: number) => (r: string) => {
  const n = num(r);
  return n === null ? null : Math.max(lo, Math.min(hi, Math.round(n)));
};

const FIELDS: Field[] = [
  field('p', () => app.persona, (v) => (app.persona = v), (r): PersonaId => (r === 'typical' ? 'typical' : 'fire'), 'fire' as PersonaId),
  field('age', () => app.ageInput, (v) => (app.ageInput = v), nullableAge(18, 90), null),
  field('hh', () => app.householdInput, (v) => (app.householdInput = v), (r): Household | null => (r === 'couple' || r === 'single' ? r : null), null as Household | null),
  field('at', () => app.retireAgeInput, (v) => (app.retireAgeInput = v), nullableAge(18, 100), null),
  field('chk', () => app.checkingInput, (v) => (app.checkingInput = v), money, null),
  field('sav', () => app.savingsAcct, (v) => (app.savingsAcct = v), (r) => money(r) ?? 0, 0),
  field('brk', () => app.brokerageInput, (v) => (app.brokerageInput = v), money, null),
  field('nw', () => app.traditionalInput, (v) => (app.traditionalInput = v), money, null),
  field('roth', () => app.roth, (v) => (app.roth = v), (r) => money(r) ?? 0, 0),
  field('hsab', () => app.hsaBalance, (v) => (app.hsaBalance = v), (r) => money(r) ?? 0, 0),
  ...CONTRIB_KEYS.map((k) =>
    field(`c-${k}`, () => app.contribInput[k] ?? null, (v) => {
      const next = { ...app.contribInput };
      if (v === null) delete next[k];
      else next[k] = v;
      app.contribInput = next;
    }, money, null as number | null),
  ),
  field('cg', () => app.growthInput, (v) => (app.growthInput = v), (r) => { const n = num(r); return n === null ? null : Math.max(-0.05, Math.min(0.1, n)); }, null),
  field('inc1', () => app.incomeInput, (v) => (app.incomeInput = v), money, null),
  field('inc2', () => app.partnerIncomeInput, (v) => (app.partnerIncomeInput = v), money, null),
  field('work', () => app.careerStartInput, (v) => (app.careerStartInput = v), nullableAge(14, 70), null),
  field('ss', () => app.ssInput, (v) => (app.ssInput = v), money, null),
  field('ssAge', () => app.ssStartAge, (v) => (app.ssStartAge = v), clamped(50, 75, d.socialSecurity.startAge), d.socialSecurity.startAge),
  field('inc', () => app.otherIncome, (v) => (app.otherIncome = v), clamped(0, 1e7, 0), d.otherIncome.value),
  field('incAge', () => app.otherStartAge, (v) => (app.otherStartAge = v), clamped(18, 100, d.otherIncome.startAge), d.otherIncome.startAge),
  field('stocks', () => app.stockInput, (v) => (app.stockInput = v), (r) => { const n = num(r); return n === null ? null : Math.max(0, Math.min(100, n)); }, null),
  field('fail', () => app.maxFailure, (v) => (app.maxFailure = v), clamped(0, 0.5, d.maxFailure), d.maxFailure),
  field('to', () => app.planToAge, (v) => (app.planToAge = v), clamped(70, 110, d.planToAge.value), d.planToAge.value),
  field('tax', () => app.taxRate, (v) => (app.taxRate = v), clamped(0, 0.6, d.taxRate.value), d.taxRate.value),
  field('btax', () => app.brokerageTax, (v) => (app.brokerageTax = v), clamped(0, 0.4, d.brokerageTax.value), d.brokerageTax.value),
  field('health', () => app.healthOn, (v) => (app.healthOn = v), (r) => r !== 'false' && r !== '0', true),
  field('swr', () => app.swrFixed, (v) => (app.swrFixed = v), num, null),
  field('ret', () => app.returnFixed, (v) => (app.returnFixed = v), num, null),
  // 'now' is the v2.0 name for retiring at your current age.
  field('mode', () => app.mode, (v) => (app.mode = v), (r): Mode => (r === 'when' ? 'when' : 'at'), 'at' as Mode),
  field('tier', () => app.targetTier, (v) => (app.targetTier = Math.round(v)), clamped(1, TIERS.length - 1, 2), 2),
  field('fly', () => app.flights, (v) => (app.flights = v), (r): FlightFilter => (r === 'any' || r === 'yr' ? r : 'off'), 'off' as FlightFilter),
  field('flyto', () => app.flightTo, (v) => (app.flightTo = v), (r) => (US_AIRPORTS.some((a) => a.iata === r) ? r : null), null as string | null),
  listField('only', () => app.only, (v) => (app.only = v), (s) => placeById.has(s), []),
  listField('never', () => app.never, (v) => (app.never = v), (s) => placeById.has(s), []),
  ...METRICS.map((m) =>
    field(m.hashKey, () => app.metricLimits[m.id] ?? null, (v) => app.setLimit(m.id, v), (r) => num(r), null as number | null),
  ),
  field('mintier', () => app.minTier, (v) => (app.minTier = Math.round(v)), clamped(0, TIERS.length - 1, 0), 0),
  field('tierwhen', () => app.minTierWhen, (v) => (app.minTierWhen = v), (r): TierWhen => (r === 'at' || r === 'by' || r === 'within' ? r : 'now'), 'now' as TierWhen),
  field('tierin', () => app.minTierWithin, (v) => (app.minTierWithin = Math.round(v)), clamped(0, 80, 5), 5),
  field('tierby', () => app.minTierByAge, (v) => (app.minTierByAge = Math.round(v)), clamped(18, 100, 55), 55),
  listField('cols', () => app.columns, (v) => (app.columns = v), (s) => COLUMNS.some((c) => c.id === s), DEFAULT_COLUMNS),
  field('view', () => app.tab, (v) => (app.tab = v), (r): Tab => (r === 'list' ? 'list' : 'map'), DEFAULT_TAB),
  field('sort', () => app.sort, (v) => (app.sort = v), (r): SortKey => (r === 'best' || r === 'name' || COLUMNS.some((c) => c.id === r) ? (r as SortKey) : 'best'), 'best' as SortKey),
  field('desc', () => app.sortDesc, (v) => (app.sortDesc = v), (r) => r === 'true', false),
  field('units', () => app.units, (v) => (app.units = v), (r): Units => (r === 'metric' ? 'metric' : 'us'), 'us' as Units),
  field('unit', () => app.costUnit, (v) => (app.costUnit = v), (r): CostUnit => (r === 'yr' || r === 'egg' ? r : 'mo'), 'mo' as CostUnit),
  field('city', () => app.selectedCityId, (v) => (app.selectedCityId = v), (r) => (cityById.has(r) ? r : null), null as string | null),
];

const FILTER_KEYS = new Set(['fly', 'flyto', 'only', 'never', 'mintier', 'tierwhen', 'tierby', 'tierin', ...METRICS.map((m) => m.hashKey)]);

const LEGACY_INTO: Record<string, ContribKey> = { traditional: 'k401', roth: 'rothIra', brokerage: 'brokerage', cash: 'cash' };

export function readHash(hash: string): void {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  // v2.1 had one "adding per year" number going into one account.
  const save = params.get('save');
  if (save !== null && !CONTRIB_KEYS.some((k) => params.has(`c-${k}`))) {
    const into = LEGACY_INTO[params.get('into') ?? 'traditional'] ?? 'k401';
    for (const k of CONTRIB_KEYS) params.set(`c-${k}`, k === into ? save : '0');
  }
  for (const f of FIELDS) {
    const raw = params.get(f.key);
    if (raw !== null) f.set(raw);
    else if (!f.isDefault()) f.reset();
  }
}

export function writeHash(): string {
  const params = new URLSearchParams();
  for (const f of FIELDS) if (!f.isDefault()) params.set(f.key, f.get());
  // Keep list separators readable in shared links.
  const s = params.toString().replace(/%2C/g, ',');
  return s ? `#${s}` : '';
}

// --- remembering your plan between visits (this browser only) ---

const STORAGE_KEY = 'retiremap.plan.v1';

export function loadSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function save(hash: string): void {
  try {
    if (hash) localStorage.setItem(STORAGE_KEY, hash);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode / storage blocked: the URL still carries the plan.
  }
}

// --- formatting ---

export function cityLabel(c: CityRecord): string {
  return c.admin ? `${c.name}, ${c.admin}, ${c.country}` : `${c.name}, ${c.country}`;
}

export function flagEmoji(iso2: string): string {
  if (iso2.length !== 2 || iso2 === 'XK') return '';
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumSignificantDigits: 3 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 });

export const fmtUsd = (n: number) => usd0.format(n);
export const fmtUsdCompact = (n: number) => usdCompact.format(n);
export const fmtCompact = (n: number) => compact.format(n);
export const fmtPct = (f: number, digits = 1) => `${(f * 100).toFixed(digits)}%`;

export function ordinal(n: number): string {
  const r = Math.round(n);
  const s = ['th', 'st', 'nd', 'rd'][r % 100 > 10 && r % 100 < 14 ? 0 : Math.min(r % 10, 4) % 4] ?? 'th';
  return `${r}${s}`;
}

export function fmtPercentile(p: number): string {
  if (p <= 1) return '< 1st';
  if (p >= 99) return '> 99th';
  return ordinal(p);
}
