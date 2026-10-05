// Climate averages per city from the monthly files written by
// fetch-climate.ts. Months are averaged across the fetched years first
// ("normals"), then summarized.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Climate } from '../src/lib/types.ts';
import type { YearClimate } from './fetch-climate.ts';

/** Years fetched for a city. */
export function climateYears(dir: string, cityId: string): number[] {
  const cityDir = join(dir, cityId);
  if (!existsSync(cityDir)) return [];
  return readdirSync(cityDir)
    .filter((f) => /^\d{4}\.json$/.test(f))
    .map((f) => Number(f.slice(0, 4)));
}

/**
 * Climate normals for a city. Pass `onlyYears` (the years every city has) so
 * cities are compared over the same period while a multi-year fetch is
 * still in progress.
 */
export function loadClimate(dir: string, cityId: string, onlyYears?: Set<number>): { climate: Climate; years: number[] } | undefined {
  const cityDir = join(dir, cityId);
  if (!existsSync(cityDir)) return undefined;
  const files = readdirSync(cityDir).filter((f) => /^\d{4}\.json$/.test(f) && (!onlyYears || onlyYears.has(Number(f.slice(0, 4)))));
  if (files.length === 0) return undefined;
  const ys: YearClimate[] = files.map((f) => JSON.parse(readFileSync(join(cityDir, f), 'utf8')));
  const n = ys.length;
  const avg = (pick: (y: YearClimate, m: number) => number) =>
    Array.from({ length: 12 }, (_, m) => ys.reduce((a, y) => a + pick(y, m), 0) / n);
  const hi = avg((y, m) => y.months[m].tmax);
  const lo = avg((y, m) => y.months[m].tmin);
  const rain = avg((y, m) => y.months[m].rain);
  const rainyDays = avg((y, m) => y.months[m].rainyDays);
  const sun = avg((y, m) => y.months[m].sun);
  const rh = avg((y, m) => y.months[m].rh);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    years: ys.map((y) => y.year).sort(),
    climate: {
      years: n,
      summerHigh: r1(Math.max(...hi)),
      winterLow: r1(Math.min(...lo)),
      sunHours: Math.round(sum(sun)),
      rain: Math.round(sum(rain)),
      rainyDays: Math.round(sum(rainyDays)),
      humidity: Math.round(sum(rh) / 12),
      months: hi.map((h, m) => ({ hi: r1(h), lo: r1(lo[m]), rain: Math.round(rain[m]) })),
    },
  };
}

// --- sunshine calibration ---
// ERA5/Open-Meteo sunshine reads high under clouds (+3% in Phoenix, +56% in
// London, +70% in Singapore, +150% in Bogotá vs station normals) but ranks
// cities well. A least-squares fit of measured station normals
// (pipeline/sunshine-reference.json) on the model value and on rainy days —
// a cloudiness proxy that captures most of the tropical inflation — fixes
// most of the level; we report its leave-one-out error.

export type SunCalibration = { coef: [number, number, number]; n: number; rawMae: number; looMae: number; looMedian: number };
type SunPoint = { model: number; rainyDays: number; measured: number };

const features = (p: { model: number; rainyDays: number }) => [1, p.model, p.rainyDays];

/** Ordinary least squares via the normal equations (3 unknowns). */
function ols(pts: SunPoint[]): number[] {
  const X = pts.map(features);
  const k = X[0].length;
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)));
  const B = Array.from({ length: k }, (_, i) => X.reduce((s, r, n) => s + r[i] * pts[n].measured, 0));
  for (let i = 0; i < k; i++) {
    let piv = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    [A[i], A[piv]] = [A[piv], A[i]];
    [B[i], B[piv]] = [B[piv], B[i]];
    for (let r = 0; r < k; r++) {
      if (r === i) continue;
      const f = A[r][i] / A[i][i];
      for (let c = i; c < k; c++) A[r][c] -= f * A[i][c];
      B[r] -= f * B[i];
    }
  }
  return B.map((b, i) => b / A[i][i]);
}

const predict = (w: number[], p: { model: number; rainyDays: number }) => features(p).reduce((s, x, i) => s + x * w[i], 0);

/** Fit measured = a + b · model + c · rainyDays over reference cities that have climate data. */
export function calibrateSunshine(
  cities: Map<string, { model: number; rainyDays: number }>,
  reference: Record<string, { hours: number }>,
): SunCalibration | null {
  const pts: SunPoint[] = Object.entries(reference)
    .filter(([id]) => !id.startsWith('_') && cities.has(id))
    .map(([id, r]) => ({ ...cities.get(id)!, measured: r.hours }));
  if (pts.length < 8) return null;
  const w = ols(pts);
  const loo = pts.map((p, i) => Math.abs(predict(ols(pts.filter((_, j) => j !== i)), p) - p.measured));
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const sorted = [...loo].sort((x, y) => x - y);
  return {
    coef: [w[0], w[1], w[2]],
    n: pts.length,
    rawMae: mean(pts.map((p) => Math.abs(p.model - p.measured))),
    looMae: mean(loo),
    looMedian: sorted.length % 2 ? sorted[sorted.length >> 1] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
  };
}

export const applySun = (cal: SunCalibration, p: { model: number; rainyDays: number }) =>
  Math.max(800, Math.round(predict(cal.coef, p)));
