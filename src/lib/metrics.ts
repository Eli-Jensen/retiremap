// Every Numbeo index the app can filter, sort and show, in one place. A
// filter keeps cities at or above `limit` (or at or below, when lower is
// better); cities without a value drop out once the filter is set.
import type { CityRecord } from './types.ts';

export type MetricId =
  | 'summerHigh'
  | 'winterLow'
  | 'sunHours'
  | 'rain'
  | 'rainyDays'
  | 'humidity'
  | 'qol'
  | 'safety'
  | 'healthCare'
  | 'climate'
  | 'pollution'
  | 'rent'
  | 'groceries'
  | 'restaurant'
  | 'purchasingPower'
  | 'pop';

export type Units = 'us' | 'metric';
type Range = [min: number, max: number, step: number];

export type Metric = {
  id: MetricId;
  label: string;
  short?: string;
  hashKey: string; // URL / saved-plan key for the filter
  get: (c: CityRecord) => number | null;
  higherIsBetter: boolean;
  min: number; // slider range, in the metric's own units (°C, mm, …)
  max: number;
  step: number;
  usRange?: Range; // slider range in US units, when they differ
  kind?: 'temp' | 'rain' | 'hours' | 'pct' | 'days';
  group: 'Climate' | 'Livability' | 'Prices (New York = 100)' | 'City';
  hint: string;
};

const climateHint = 'Open-Meteo (ERA5) daily weather, averaged';

export const METRICS: Metric[] = [
  {
    id: 'summerHigh',
    label: 'Summer highs',
    hashKey: 'hot',
    get: (c) => c.climate?.summerHigh ?? null,
    higherIsBetter: false,
    min: 15,
    max: 45,
    step: 1,
    usRange: [59, 113, 2],
    kind: 'temp',
    group: 'Climate',
    hint: 'Average daily high in the hottest month',
  },
  {
    id: 'winterLow',
    label: 'Winter lows',
    hashKey: 'cold',
    get: (c) => c.climate?.winterLow ?? null,
    higherIsBetter: true,
    min: -25,
    max: 25,
    step: 1,
    usRange: [-13, 77, 2],
    kind: 'temp',
    group: 'Climate',
    hint: 'Average nightly low in the coldest month',
  },
  {
    id: 'sunHours',
    label: 'Sunshine',
    hashKey: 'sun',
    get: (c) => c.climate?.sunHours ?? null,
    higherIsBetter: true,
    min: 1000,
    max: 4000,
    step: 100,
    kind: 'hours',
    group: 'Climate',
    hint: 'Sunny hours per year — weather-model estimate calibrated to station records (typically within ~300 h); reads too sunny in coastal-fog cities like Lima',
  },
  {
    id: 'rain',
    label: 'Rainfall',
    hashKey: 'wet',
    get: (c) => c.climate?.rain ?? null,
    higherIsBetter: false,
    min: 0,
    max: 3000,
    step: 50,
    usRange: [0, 120, 2],
    kind: 'rain',
    group: 'Climate',
    hint: 'Per year',
  },
  {
    id: 'rainyDays',
    label: 'Rainy days',
    hashKey: 'wetdays',
    get: (c) => c.climate?.rainyDays ?? null,
    higherIsBetter: false,
    min: 0,
    max: 250,
    step: 10,
    kind: 'days',
    group: 'Climate',
    hint: 'Days per year with at least 1 mm (0.04 in)',
  },
  {
    id: 'humidity',
    label: 'Humidity',
    hashKey: 'humid',
    get: (c) => c.climate?.humidity ?? null,
    higherIsBetter: false,
    min: 30,
    max: 90,
    step: 5,
    kind: 'pct',
    group: 'Climate',
    hint: 'Average relative humidity',
  },
  {
    id: 'qol',
    label: 'Quality of life',
    short: 'QoL',
    hashKey: 'qol',
    get: (c) => c.qol?.index ?? null,
    higherIsBetter: true,
    min: 0,
    max: 220,
    step: 10,
    group: 'Livability',
    hint: 'Numbeo’s composite. New York 136 · Lisbon 156 · Vienna 207',
  },
  {
    id: 'safety',
    label: 'Safety',
    hashKey: 'safe',
    get: (c) => c.safety ?? null,
    higherIsBetter: true,
    min: 0,
    max: 90,
    step: 5,
    group: 'Livability',
    hint: '100 − crime index. New York 49 · Lisbon 67 · Tokyo 76',
  },
  {
    id: 'healthCare',
    label: 'Health care',
    short: 'Health',
    hashKey: 'hc',
    get: (c) => c.healthCare ?? null,
    higherIsBetter: true,
    min: 0,
    max: 90,
    step: 5,
    group: 'Livability',
    hint: 'Residents’ ratings of care quality. New York 63 · Lisbon 72 · Taipei 87',
  },
  {
    id: 'climate',
    label: 'Climate score (Numbeo)',
    short: 'Climate score',
    hashKey: 'clim',
    get: (c) => c.qol?.climate ?? null,
    higherIsBetter: true,
    min: 0,
    max: 100,
    step: 5,
    group: 'Climate',
    hint: 'Residents’ ratings; higher = milder. Chicago 66 · Lisbon 99',
  },
  {
    id: 'pollution',
    label: 'Pollution',
    hashKey: 'poll',
    get: (c) => c.qol?.pollution ?? null,
    higherIsBetter: false,
    min: 10,
    max: 100,
    step: 5,
    group: 'Livability',
    hint: 'Lower = cleaner. Helsinki 13 · Lisbon 37 · Delhi 90',
  },
  {
    id: 'rent',
    label: 'Rent',
    hashKey: 'rent',
    get: (c) => c.rent,
    higherIsBetter: false,
    min: 0,
    max: 100,
    step: 5,
    group: 'Prices (New York = 100)',
    hint: 'Apartment rents. Lisbon 35 · Bangkok 17',
  },
  {
    id: 'groceries',
    label: 'Groceries',
    hashKey: 'groc',
    get: (c) => c.groceries,
    higherIsBetter: false,
    min: 0,
    max: 130,
    step: 5,
    group: 'Prices (New York = 100)',
    hint: 'Lisbon 51 · Bangkok 49',
  },
  {
    id: 'restaurant',
    label: 'Restaurants',
    hashKey: 'rest',
    get: (c) => c.restaurant,
    higherIsBetter: false,
    min: 0,
    max: 130,
    step: 5,
    group: 'Prices (New York = 100)',
    hint: 'Eating out. Lisbon 59 · Bangkok 29',
  },
  {
    id: 'purchasingPower',
    label: 'Local purchasing power',
    short: 'Purch. power',
    hashKey: 'pp',
    get: (c) => c.purchasingPower,
    higherIsBetter: true,
    min: 0,
    max: 180,
    step: 10,
    group: 'Prices (New York = 100)',
    hint: 'What a local salary buys locally — a proxy for local prosperity',
  },
  {
    id: 'pop',
    label: 'Population',
    short: 'Pop.',
    hashKey: 'pop',
    get: (c) => c.pop ?? null,
    higherIsBetter: true,
    min: 0,
    max: 1_000_000,
    step: 100_000,
    group: 'City',
    hint: 'City proper (GeoNames), not the metro area',
  },
];

export const METRIC_BY_ID = new Map(METRICS.map((m) => [m.id, m]));

/** Does a city pass a metric limit? Missing values fail once a limit is set. */
export function passes(m: Metric, c: CityRecord, limit: number | undefined): boolean {
  if (limit === undefined) return true;
  const v = m.get(c);
  if (v === null) return false;
  return m.higherIsBetter ? v >= limit : v <= limit;
}

// --- units ---

const toUs = (m: Metric, v: number) => (m.kind === 'temp' ? (v * 9) / 5 + 32 : m.kind === 'rain' ? v / 25.4 : v);
const fromUs = (m: Metric, v: number) => (m.kind === 'temp' ? ((v - 32) * 5) / 9 : m.kind === 'rain' ? v * 25.4 : v);

/** A stored (metric-unit) value as shown to the user. */
export function toDisplay(m: Metric, v: number, units: Units): number {
  return units === 'us' ? toUs(m, v) : v;
}
export function fromDisplay(m: Metric, v: number, units: Units): number {
  return units === 'us' ? fromUs(m, v) : v;
}
/** Slider [min, max, step] in display units. */
export function displayRange(m: Metric, units: Units): Range {
  return units === 'us' && m.usRange ? m.usRange : [m.min, m.max, m.step];
}
export function unitSuffix(m: Metric, units: Units): string {
  switch (m.kind) {
    case 'temp':
      return units === 'us' ? '°F' : '°C';
    case 'rain':
      return units === 'us' ? ' in' : ' mm';
    case 'hours':
      return ' h';
    case 'pct':
      return '%';
    case 'days':
      return ' days';
    default:
      return '';
  }
}
export function fmtMetric(m: Metric, v: number, units: Units): string {
  const d = toDisplay(m, v, units);
  const digits = m.kind === 'rain' && units === 'us' ? 0 : 0;
  return `${d.toLocaleString('en-US', { maximumFractionDigits: digits })}${unitSuffix(m, units)}`;
}
