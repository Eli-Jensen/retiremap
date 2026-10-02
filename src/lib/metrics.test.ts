import { describe, expect, it } from 'vitest';
import { METRIC_BY_ID, toDisplay, fromDisplay, fmtMetric, displayRange, passes } from './metrics.ts';
import type { CityRecord } from './types.ts';

const temp = METRIC_BY_ID.get('summerHigh')!;
const rain = METRIC_BY_ID.get('rain')!;

describe('metric units', () => {
  it('converts °C ↔ °F and mm ↔ inches, round-trip', () => {
    expect(toDisplay(temp, 30, 'us')).toBeCloseTo(86, 9);
    expect(toDisplay(temp, -10, 'us')).toBeCloseTo(14, 9);
    expect(fromDisplay(temp, toDisplay(temp, 23.4, 'us'), 'us')).toBeCloseTo(23.4, 9);
    expect(toDisplay(rain, 254, 'us')).toBeCloseTo(10, 9);
    expect(toDisplay(temp, 30, 'metric')).toBe(30);
  });
  it('formats with units', () => {
    expect(fmtMetric(temp, 30, 'us')).toBe('86°F');
    expect(fmtMetric(temp, 30, 'metric')).toBe('30°C');
    expect(fmtMetric(rain, 1270, 'us')).toBe('50 in');
    expect(fmtMetric(rain, 1270, 'metric')).toBe('1,270 mm');
  });
  it('US slider ranges cover the same span as the metric ones', () => {
    for (const m of [temp, rain, METRIC_BY_ID.get('winterLow')!]) {
      const [lo, hi] = displayRange(m, 'us');
      expect(fromDisplay(m, lo, 'us')).toBeLessThanOrEqual(m.min + 1e-9);
      expect(fromDisplay(m, hi, 'us')).toBeGreaterThanOrEqual(m.max - 1e-9);
    }
  });
  it('a summer-high limit keeps cooler cities; cities without climate data drop out', () => {
    const city = (summerHigh?: number) => ({ climate: summerHigh === undefined ? undefined : { summerHigh } }) as unknown as CityRecord;
    expect(passes(temp, city(28), 30)).toBe(true);
    expect(passes(temp, city(33), 30)).toBe(false);
    expect(passes(temp, city(), 30)).toBe(false);
    expect(passes(temp, city(), undefined)).toBe(true);
  });
});
