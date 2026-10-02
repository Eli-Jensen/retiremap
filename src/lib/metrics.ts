// Every Numbeo index the app can filter, sort and show, in one place. A
// filter keeps cities at or above `limit` (or at or below, when lower is
// better); cities without a value drop out once the filter is set.
import type { CityRecord } from './types.ts';

export type MetricId =
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

export type Metric = {
  id: MetricId;
  label: string;
  short?: string;
  hashKey: string; // URL / saved-plan key for the filter
  get: (c: CityRecord) => number | null;
  higherIsBetter: boolean;
  min: number; // slider range
  max: number;
  step: number;
  group: 'Livability' | 'Prices (New York = 100)' | 'City';
  hint: string;
};

export const METRICS: Metric[] = [
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
    label: 'Climate',
    hashKey: 'clim',
    get: (c) => c.qol?.climate ?? null,
    higherIsBetter: true,
    min: 0,
    max: 100,
    step: 5,
    group: 'Livability',
    hint: 'Higher = milder. Chicago 66 · Lisbon 99',
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
