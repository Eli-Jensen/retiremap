import type { CityRecord, Meta, Region, SpendingDeciles } from './types.ts';
import { REGIONS } from './types.ts';
import { buildCurve } from './math/percentile.ts';
import { equivAnnualUS } from './math/col.ts';
import { buildMonthly, buildSwrTable, mix, realCagr } from './math/swr.ts';
import type { Market } from './math/swr.ts';
import { affordableMonthly, need, yearsToRetire } from './math/plan.ts';
import type { Assumptions, Health, NeedBreakdown } from './math/plan.ts';
import { TIERS, tierIndex, localRatio, localReference, tierSpend } from './math/tiers.ts';
import type { Household } from './math/tiers.ts';
import citiesJson from '../data/cities.json';
import metaJson from '../data/meta.json';
import decilesJson from '../data/spendingDeciles.json';
import marketJson from '../data/market.json';
import defaultsJson from '../data/defaults.json';

export const cities = citiesJson as CityRecord[];
export const meta = metaJson as Meta;
export const deciles = decilesJson as SpendingDeciles;
export const defaults = defaultsJson;
export const curve = buildCurve(deciles.anchors);
export const cityById = new Map(cities.map((c) => [c.id, c]));

const monthly = buildMonthly(marketJson as Market);
/** Historical real return of 10-year Treasuries: what the bridge ladder earns. */
export const BRIDGE_RATE = realCagr(monthly.bond);

export function defaultPortfolio(age: number): number {
  return defaults.portfolioByAge.brackets.find((b) => age <= b.maxAge)!.value;
}

export type Mode = 'now' | 'when';
export type Tab = 'map' | 'list';
export type SortKey = 'best' | 'name' | 'qol' | 'salary';

export type CityResult = {
  health: Health; // household $/mo
  nowSpend: number; // $/mo the portfolio supports if you retire today (excl. health)
  nowRatio: number; // nowSpend vs local salary, per adult-equivalent
  nowTier: number; // index into TIERS
  targetSpend: number; // $/mo that reaches the target tier here
  years: number | null; // until you can retire here at the target tier
  cls: number; // map class: 0 = gray (not enough / never), 1..5 = light → dark
  visible: boolean; // passes the filters
};

/** When-mode buckets: years until retirement → map class (darker = sooner). */
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

class AppState {
  // --- your situation. null = follow the data-backed default ---
  age = $state(defaults.age);
  household = $state<Household>(defaults.household as Household);
  portfolioInput = $state<number | null>(null);
  savingsInput = $state<number | null>(null);
  ssInput = $state<number | null>(null);
  ssStartAge = $state(defaults.socialSecurity.startAge);
  otherIncome = $state(defaults.otherIncome.value);
  otherStartAge = $state(defaults.otherIncome.startAge);

  // --- assumptions ---
  stockPct = $state(defaults.stockPct);
  maxFailure = $state(defaults.maxFailure);
  planToAge = $state(defaults.planToAge.value);
  taxRate = $state(defaults.taxRate.value);
  healthOn = $state(true);
  swrFixed = $state<number | null>(null); // null = historical, by horizon
  returnFixed = $state<number | null>(null); // null = historical CAGR of the mix

  // --- view ---
  mode = $state<Mode>('now');
  targetTier = $state(2); // "Like a local"
  minQol = $state(0);
  region = $state<Region | 'all'>('all');
  tab = $state<Tab>('map');
  sort = $state<SortKey>('best');
  selectedCityId = $state<string | null>(null);
  methodsOpen = $state(false);

  // --- effective inputs ---
  portfolio = $derived(this.portfolioInput ?? defaultPortfolio(this.age));
  annualSavings = $derived(this.savingsInput ?? defaults.annualSavings.value);
  socialSecurity = $derived(this.ssInput ?? defaults.socialSecurity[this.household]);
  persons = $derived(this.household === 'couple' ? 2 : 1);

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

  healthUS: Health = $derived(this.scaleHealth(defaults.health.us));
  healthAbroad: Health = $derived(this.scaleHealth(defaults.health.abroad));

  results = $derived.by(() => {
    const a = this.assumptions;
    const acc = { age: this.age, portfolio: this.portfolio, annualSavings: this.annualSavings, realReturn: this.realReturn };
    // Spend-now only depends on the health schedule, which is US-or-not.
    const nowUS = affordableMonthly(this.portfolio, this.healthUS, this.age, a);
    const nowAbroad = affordableMonthly(this.portfolio, this.healthAbroad, this.age, a);
    const out = new Map<string, CityResult>();
    for (const c of cities) {
      const us = c.iso2 === 'US';
      const health = us ? this.healthUS : this.healthAbroad;
      const nowSpend = us ? nowUS : nowAbroad;
      const ref = localReference(c);
      const nowRatio = localRatio(nowSpend, ref, this.household);
      const nowTier = tierIndex(nowRatio);
      const targetSpend = tierSpend(this.targetTier, ref, this.household);
      const years = yearsToRetire(targetSpend, health, acc, a);
      const visible =
        (this.region === 'all' || c.region === this.region) && (this.minQol <= 0 || (c.qol?.index ?? 0) >= this.minQol);
      out.set(c.id, {
        health,
        nowSpend,
        nowRatio,
        nowTier,
        targetSpend,
        years,
        cls: this.mode === 'now' ? nowTier : whenClass(years),
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
      byTier[r.nowTier]++;
      if (r.years !== null) {
        if (soonest === null || r.years < soonest) {
          soonest = r.years;
          soonestCount = 1;
        } else if (r.years === soonest) soonestCount++;
      }
    }
    return { shown, byTier, retirable: shown - byTier[0], soonest, soonestCount };
  });

  selectedCity = $derived(this.selectedCityId ? (cityById.get(this.selectedCityId) ?? null) : null);

  /** Full breakdown for the detail card (one city, so recomputing is fine). */
  breakdown(c: CityRecord): { now: NeedBreakdown; target: NeedBreakdown | null; retireAge: number | null } {
    const r = this.results.get(c.id)!;
    const retireAge = r.years === null ? null : this.age + r.years;
    return {
      now: need(r.nowSpend, r.health, this.age, this.assumptions),
      target: retireAge === null ? null : need(r.targetSpend, r.health, retireAge, this.assumptions),
      retireAge,
    };
  }

  /** Cost-adjusted US spending percentile of a monthly budget in a city. */
  usPercentile(monthlySpend: number, c: CityRecord): number {
    return curve.spendToPercentile(equivAnnualUS(monthlySpend, c.colRent, meta.usRefIndex.colRent));
  }

  private scaleHealth(h: { under65: number; over65: number }): Health {
    const k = this.healthOn ? this.persons : 0;
    return { under65: h.under65 * k, over65: h.over65 * k };
  }
}

export const app = new AppState();

// --- URL hash <-> state, so a plan is shareable. Only non-defaults are written;
// a hash that omits a key puts that field back to its default. ---

type Field = { key: string; get: () => unknown; isDefault: () => boolean; set: (raw: string) => void; reset: () => void };

function field<T>(key: string, get: () => T, assign: (v: T) => void, parse: (raw: string) => T, def: T): Field {
  return { key, get, isDefault: () => get() === def, set: (raw) => assign(parse(raw)), reset: () => assign(def) };
}

const num = (raw: string): number | null => {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) ? n : null;
};
const clamped = (lo: number, hi: number, fallback: number) => (raw: string) => {
  const n = num(raw);
  return n === null ? fallback : Math.max(lo, Math.min(hi, n));
};
const nullableNum = (raw: string) => num(raw);

const d = defaults;
const FIELDS: Field[] = [
  field('age', () => app.age, (v) => (app.age = Math.round(v)), clamped(18, 90, d.age), d.age),
  field('hh', () => app.household, (v) => (app.household = v), (r): Household => (r === 'couple' ? 'couple' : 'single'), d.household as Household),
  field('nw', () => app.portfolioInput, (v) => (app.portfolioInput = v), nullableNum, null),
  field('save', () => app.savingsInput, (v) => (app.savingsInput = v), nullableNum, null),
  field('ss', () => app.ssInput, (v) => (app.ssInput = v), nullableNum, null),
  field('ssAge', () => app.ssStartAge, (v) => (app.ssStartAge = v), clamped(50, 75, d.socialSecurity.startAge), d.socialSecurity.startAge),
  field('inc', () => app.otherIncome, (v) => (app.otherIncome = v), clamped(0, 1e7, 0), d.otherIncome.value),
  field('incAge', () => app.otherStartAge, (v) => (app.otherStartAge = v), clamped(18, 100, d.otherIncome.startAge), d.otherIncome.startAge),
  field('stocks', () => app.stockPct, (v) => (app.stockPct = v), clamped(0, 100, d.stockPct), d.stockPct),
  field('fail', () => app.maxFailure, (v) => (app.maxFailure = v), clamped(0, 0.5, d.maxFailure), d.maxFailure),
  field('to', () => app.planToAge, (v) => (app.planToAge = v), clamped(70, 110, d.planToAge.value), d.planToAge.value),
  field('tax', () => app.taxRate, (v) => (app.taxRate = v), clamped(0, 0.6, d.taxRate.value), d.taxRate.value),
  field('health', () => app.healthOn, (v) => (app.healthOn = v), (r) => r !== 'false' && r !== '0', true),
  field('swr', () => app.swrFixed, (v) => (app.swrFixed = v), nullableNum, null),
  field('ret', () => app.returnFixed, (v) => (app.returnFixed = v), nullableNum, null),
  field('mode', () => app.mode, (v) => (app.mode = v), (r): Mode => (r === 'when' ? 'when' : 'now'), 'now' as Mode),
  field('tier', () => app.targetTier, (v) => (app.targetTier = Math.round(v)), clamped(1, TIERS.length - 1, 2), 2),
  field('qol', () => app.minQol, (v) => (app.minQol = v), clamped(0, 250, 0), 0),
  field('region', () => app.region, (v) => (app.region = v), (r) => ((REGIONS as readonly string[]).includes(r) ? (r as Region) : 'all'), 'all' as Region | 'all'),
  field('city', () => app.selectedCityId, (v) => (app.selectedCityId = v), (r) => (cityById.has(r) ? r : null), null as string | null),
];

export function readHash(hash: string): void {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  for (const f of FIELDS) {
    const raw = params.get(f.key);
    if (raw !== null) f.set(raw);
    else if (!f.isDefault()) f.reset();
  }
}

export function writeHash(): string {
  const params = new URLSearchParams();
  for (const f of FIELDS) if (!f.isDefault()) params.set(f.key, String(f.get()));
  const s = params.toString();
  return s ? `#${s}` : '';
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

export const fmtUsd = (n: number) => usd0.format(n);
export const fmtUsdCompact = (n: number) => usdCompact.format(n);
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
