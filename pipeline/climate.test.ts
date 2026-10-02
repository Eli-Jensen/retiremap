import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadClimate } from './build-climate.ts';

const year = (y: number, shift: number) => ({
  year: y,
  lat: 0,
  lng: 0,
  elevation: 0,
  months: Array.from({ length: 12 }, (_, m) => ({
    tmax: 10 + m + shift, // hottest = December
    tmin: m - 5 + shift, // coldest = January
    rain: 100,
    rainyDays: 10,
    sun: 200,
    rh: 70,
  })),
});

describe('loadClimate', () => {
  it('averages months across years, then summarizes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clim-'));
    mkdirSync(join(dir, 'x'));
    writeFileSync(join(dir, 'x', '2023.json'), JSON.stringify(year(2023, 0)));
    writeFileSync(join(dir, 'x', '2024.json'), JSON.stringify(year(2024, 2)));
    const r = loadClimate(dir, 'x')!;
    expect(r.years).toEqual([2023, 2024]);
    expect(r.climate.years).toBe(2);
    expect(r.climate.summerHigh).toBe(22); // (21 + 23) / 2
    expect(r.climate.winterLow).toBe(-4); // (-5 + -3) / 2
    expect(r.climate.rain).toBe(1200);
    expect(r.climate.rainyDays).toBe(120);
    expect(r.climate.sunHours).toBe(2400);
    expect(r.climate.humidity).toBe(70);
    expect(r.climate.months).toHaveLength(12);
  });
  it('is undefined for a city with no files', () => {
    expect(loadClimate(mkdtempSync(join(tmpdir(), 'clim-')), 'nope')).toBeUndefined();
  });
});

import { calibrateSunshine, applySun } from './build-climate.ts';

describe('calibrateSunshine', () => {
  it('recovers a known bias that grows with rainy days, and reports leave-one-out error', () => {
    const cities = new Map<string, { model: number; rainyDays: number }>();
    const ref: Record<string, { hours: number }> = {};
    for (let i = 0; i < 10; i++) {
      const rainyDays = 40 + ((i * 37) % 120);
      const measured = 1500 + i * 250;
      // model = measured inflated by rainy-day cloudiness
      cities.set(`c${i}`, { model: (measured + 900 + 6 * rainyDays) / 1.2, rainyDays });
      ref[`c${i}`] = { hours: measured };
    }
    const cal = calibrateSunshine(cities, ref)!;
    expect(cal.coef[0]).toBeCloseTo(-900, 4);
    expect(cal.coef[1]).toBeCloseTo(1.2, 9);
    expect(cal.coef[2]).toBeCloseTo(-6, 6);
    expect(cal.looMae).toBeLessThan(1e-4);
    expect(applySun(cal, cities.get('c3')!)).toBe(2250);
  });
  it('needs at least 8 reference cities', () => {
    expect(calibrateSunshine(new Map([['a', { model: 2000, rainyDays: 100 }]]), { a: { hours: 1500 } })).toBeNull();
  });
});
