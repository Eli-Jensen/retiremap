// Fetch daily weather history for every city from Open-Meteo's Historical
// Weather API (ERA5 reanalysis, CC BY 4.0) and store it as monthly averages,
// one small file per city-year: pipeline/raw/climate/<cityId>/<year>.json.
//
//   npx tsx pipeline/fetch-climate.ts 2024            # one year
//   npx tsx pipeline/fetch-climate.ts 2015-2023       # a range
//   npx tsx pipeline/fetch-climate.ts 2015-2024 --budget 9000
//
// Resumable: existing files are skipped. Stays inside the free tier
// (open-meteo.com/en/terms: < 600 calls/min, 5,000/hour, 10,000/day, where a
// request costs variables/10 × days/14 calls, min 1) by pacing itself and
// keeping a per-UTC-day ledger; it stops when today's budget is spent and
// picks up again on the next run.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CityRecord } from '../src/lib/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'raw', 'climate');
const ledgerPath = join(outDir, '_ledger.json');
const cities: CityRecord[] = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'cities.json'), 'utf8'));

const VARS = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'sunshine_duration', 'relative_humidity_2m_mean'];
const HOURLY_CAP = 4500; // headroom under 5,000
const MINUTE_CAP = 500; // headroom under 600

// --- args ---
const args = process.argv.slice(2);
const range = args.find((a) => /^\d{4}(-\d{4})?$/.test(a)) ?? '2024';
const [y0, y1] = range.includes('-') ? range.split('-').map(Number) : [Number(range), Number(range)];
const budgetArg = args.indexOf('--budget');
const dailyBudget = budgetArg >= 0 ? Number(args[budgetArg + 1]) : 9000;
const years: number[] = [];
for (let y = y1; y >= y0; y--) years.push(y); // newest first

export type MonthClimate = {
  tmax: number; // mean daily high, °C
  tmin: number; // mean daily low, °C
  rain: number; // total precipitation, mm
  rainyDays: number; // days with ≥ 1 mm
  sun: number; // sunshine hours
  rh: number; // mean relative humidity, %
};
export type YearClimate = { year: number; lat: number; lng: number; elevation: number; months: MonthClimate[] };

const daysIn = (y: number) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);
const cost = (y: number) => Math.max(1, (VARS.length / 10) * (daysIn(y) / 14));

type Ledger = Record<string, number>; // UTC date -> calls spent
const today = () => new Date().toISOString().slice(0, 10);
const loadLedger = (): Ledger => (existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : {});
const saveLedger = (l: Ledger) => writeFileSync(ledgerPath, JSON.stringify(l, null, 2));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const window: { t: number; c: number }[] = []; // calls in the last hour
async function pace(c: number) {
  for (;;) {
    const now = Date.now();
    while (window.length && now - window[0].t > 3_600_000) window.shift();
    const hour = window.reduce((a, w) => a + w.c, 0);
    const minute = window.filter((w) => now - w.t < 60_000).reduce((a, w) => a + w.c, 0);
    if (hour + c <= HOURLY_CAP && minute + c <= MINUTE_CAP) break;
    await sleep(5_000);
  }
  window.push({ t: Date.now(), c });
}

function monthly(y: number, d: Record<string, (number | null)[]> & { time: string[] }): MonthClimate[] {
  const acc = Array.from({ length: 12 }, () => ({ tmax: 0, tmin: 0, rain: 0, rainyDays: 0, sun: 0, rh: 0, n: 0, nrh: 0 }));
  d.time.forEach((day, i) => {
    const m = Number(day.slice(5, 7)) - 1;
    const a = acc[m];
    const tmax = d.temperature_2m_max[i];
    const tmin = d.temperature_2m_min[i];
    if (tmax === null || tmin === null) return;
    a.n++;
    a.tmax += tmax;
    a.tmin += tmin;
    const p = d.precipitation_sum[i] ?? 0;
    a.rain += p;
    if (p >= 1) a.rainyDays++;
    a.sun += (d.sunshine_duration[i] ?? 0) / 3600;
    const rh = d.relative_humidity_2m_mean[i];
    if (rh !== null) {
      a.rh += rh;
      a.nrh++;
    }
  });
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return acc.map((a) => {
    if (a.n < 20) throw new Error(`${y}: only ${a.n} valid days in a month`);
    return { tmax: r1(a.tmax / a.n), tmin: r1(a.tmin / a.n), rain: r1(a.rain), rainyDays: a.rainyDays, sun: Math.round(a.sun), rh: Math.round(a.nrh ? a.rh / a.nrh : NaN) };
  });
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const ledger = loadLedger();
  const todo = years.flatMap((y) => cities.map((c) => ({ c, y }))).filter(({ c, y }) => !existsSync(join(outDir, c.id, `${y}.json`)));
  console.log(`${todo.length} city-years to fetch (${years.join(', ')}); spent today: ${(ledger[today()] ?? 0).toFixed(0)} / ${dailyBudget}`);
  let done = 0;
  let skipped = 0;
  let consecutiveFailures = 0;
  for (const { c, y } of todo) {
    const price = cost(y);
    if ((ledger[today()] ?? 0) + price > dailyBudget) {
      console.log(`Daily budget reached after ${done} requests — run again tomorrow to continue.`);
      break;
    }
    await pace(price);
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${c.lat}&longitude=${c.lng}` +
      `&start_date=${y}-01-01&end_date=${y}-12-31&daily=${VARS.join(',')}&timezone=auto`;
    // Transient failures (429, 5xx, a network error, or a 200 whose body isn't
    // the expected JSON — Open-Meteo occasionally answers "Unexpected …" as
    // plain text) are retried with backoff; every attempt is charged to the
    // ledger. A city-year that still fails is skipped (a later run retries it)
    // so one bad response can't throw away the rest of the day's budget.
    let out: YearClimate | null = null;
    let status = 0;
    let why = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        console.warn(`  ${why} for ${c.id} ${y}; backing off`);
        await sleep(60_000 * attempt);
        await pace(price);
      }
      let body = '';
      try {
        const res = await fetch(url);
        status = res.status;
        body = await res.text();
      } catch (e) {
        status = 0;
        why = `network error (${(e as Error).message})`;
      }
      ledger[today()] = (ledger[today()] ?? 0) + price;
      saveLedger(ledger);
      if (status === 0) continue;
      if (status !== 200) {
        why = `HTTP ${status} ${body.slice(0, 200)}`;
        if (status === 429 || status >= 500) continue;
        break; // 4xx other than 429: retrying won't help
      }
      try {
        const j = JSON.parse(body) as { latitude: number; longitude: number; elevation: number; daily: Record<string, (number | null)[]> & { time: string[] } };
        out = { year: y, lat: j.latitude, lng: j.longitude, elevation: j.elevation, months: monthly(y, j.daily) };
        break;
      } catch (e) {
        why = `bad response (${(e as Error).message}; body: ${body.slice(0, 120)})`;
      }
    }
    if (!out) {
      if (status === 429) {
        console.error(`Rate limited (${why}). Stopping; rerun later.`);
        process.exit(2);
      }
      skipped++;
      console.warn(`  skipping ${c.id} ${y}: ${why}`);
      if (++consecutiveFailures >= 5) {
        console.error(`5 city-years in a row failed — Open-Meteo looks unhealthy. Stopping; rerun later.`);
        break;
      }
      continue;
    }
    consecutiveFailures = 0;
    mkdirSync(join(outDir, c.id), { recursive: true });
    writeFileSync(join(outDir, c.id, `${y}.json`), JSON.stringify(out));
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${todo.length} · spent today ${ledger[today()].toFixed(0)}`);
  }
  const remaining = years.flatMap((y) => cities.map((c) => ({ c, y }))).filter(({ c, y }) => !existsSync(join(outDir, c.id, `${y}.json`))).length;
  if (skipped) console.log(`Skipped ${skipped} after repeated failures (will retry next run).`);
  console.log(`Fetched ${done}. Remaining: ${remaining}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
