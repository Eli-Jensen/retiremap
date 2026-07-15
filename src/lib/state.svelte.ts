import type { CityRecord, IndexKind, Meta, SpendingDeciles } from './types.ts';
import { buildCurve } from './math/percentile.ts';
import { requiredMonthly, portfolioNeeded, withdrawalMonthly, equivAnnualUS, monthlyFromEquivAnnualUS } from './math/col.ts';
import { tRatio } from './math/color.ts';
import citiesJson from '../data/cities.json';
import metaJson from '../data/meta.json';
import decilesJson from '../data/spendingDeciles.json';

export const cities = citiesJson as CityRecord[];
export const meta = metaJson as Meta;
export const deciles = decilesJson as SpendingDeciles;
export const curve = buildCurve(deciles.anchors);

const cityById = new Map(cities.map((c) => [c.id, c]));

export type View = 'monthly' | 'portfolio' | 'reverse';

export type CityValue = {
  required: number; // $/mo to match the user's lifestyle here
  portfolio: number; // portfolio sustaining that at the current SWR
  percentile: number; // lifestyle percentile the reverse-mode portfolio buys here
  affordable: boolean; // reverse mode: withdrawal covers `required`
  t: number; // color position for the active view
};

class AppState {
  // Inputs. monthlySpend is the single source of truth behind the
  // percentile slider (which displays a derived value and writes via
  // setPercentile) — keeps the two-way link acyclic.
  homeCityId = $state<string | null>(null);
  monthlySpend = $state(4000);
  swr = $state(0.04);
  useRent = $state(true);
  view = $state<View>('monthly');
  portfolio = $state(1_200_000);
  selectedCityId = $state<string | null>(null);

  indexKind: IndexKind = $derived(this.useRent ? 'colRent' : 'col');
  usRef = $derived(meta.usRefIndex[this.indexKind]);
  homeCity = $derived(this.homeCityId ? (cityById.get(this.homeCityId) ?? null) : null);
  // No home selected = "US average" home; the map is useful immediately.
  homeIdx = $derived(this.homeCity ? this.homeCity[this.indexKind] : this.usRef);
  selectedCity = $derived(this.selectedCityId ? (cityById.get(this.selectedCityId) ?? null) : null);

  userAnnualUS = $derived(equivAnnualUS(this.monthlySpend, this.homeIdx, this.usRef));
  userPercentile = $derived(curve.spendToPercentile(this.userAnnualUS));
  withdrawal = $derived(withdrawalMonthly(this.portfolio, this.swr));

  cityValues = $derived.by(() => {
    const kind = this.indexKind;
    const values = new Map<string, CityValue>();
    for (const c of cities) {
      const idx = c[kind];
      const required = requiredMonthly(this.monthlySpend, idx, this.homeIdx);
      values.set(c.id, {
        required,
        portfolio: portfolioNeeded(required, this.swr),
        percentile: curve.spendToPercentile(equivAnnualUS(this.withdrawal, idx, this.usRef)),
        affordable: this.withdrawal >= required,
        t: this.view === 'reverse' ? tRatio(required, this.withdrawal) : tRatio(idx, this.homeIdx),
      });
    }
    return values;
  });

  setPercentile(p: number) {
    const annual = curve.percentileToSpend(p);
    const monthly = monthlyFromEquivAnnualUS(annual, this.homeIdx, this.usRef);
    this.monthlySpend = Math.round(monthly / 10) * 10;
  }
}

export const app = new AppState();

export function cityLabel(c: CityRecord): string {
  return c.admin ? `${c.name}, ${c.admin}, ${c.country}` : `${c.name}, ${c.country}`;
}

export function flagEmoji(iso2: string): string {
  if (iso2.length !== 2 || iso2 === 'XK') return '';
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 });

export const fmtUsd = (n: number) => usd0.format(n);
export const fmtUsdCompact = (n: number) => usdCompact.format(n);

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
