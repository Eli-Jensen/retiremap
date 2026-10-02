// Pipeline entry: npm run pipeline
// Reads manually downloaded raw files, joins Numbeo cities to GeoNames
// coordinates, and emits the committed JSON snapshots the app builds from.
import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CityRecord, Meta, Place } from '../src/lib/types.ts';
import { parseM49, placesFor } from './places.ts';
import type { PlaceDef } from './places.ts';
import { parseNumbeo, parseNumbeoQol } from './parse-numbeo.ts';
import { parseGeoNames, parseCountryInfo, resolveCountry, CityMatcher } from './match-cities.ts';
import type { MatchResult, Override } from './match-cities.ts';
import { norm } from './normalize.ts';
import { buildDeciles } from './build-deciles.ts';

const here = dirname(fileURLToPath(import.meta.url));
const raw = (f: string) => join(here, 'raw', f);
const dataDir = join(here, '..', 'src', 'data');
const outDir = join(here, 'out');

// --- load inputs ---
const numbeoPath = existsSync(raw('numbeo.csv')) ? raw('numbeo.csv') : raw('numbeo.html');
if (!existsSync(numbeoPath)) {
  console.error('Missing pipeline/raw/numbeo.csv or numbeo.html — save the table from https://www.numbeo.com/cost-of-living/rankings_current.jsp');
  process.exit(1);
}
const numbeoRows = parseNumbeo(readFileSync(numbeoPath, 'utf8'));
const geoRows = parseGeoNames(readFileSync(raw('cities15000.txt'), 'utf8'));
const countryInfoText = readFileSync(raw('countryInfo.txt'), 'utf8');
const countryToIso = parseCountryInfo(countryInfoText);
const m49Path = raw('m49.csv');
if (!existsSync(m49Path)) {
  console.error('Missing pipeline/raw/m49.csv — save the table from https://unstats.un.org/unsd/methodology/m49/overview/');
  process.exit(1);
}
const m49 = parseM49(readFileSync(m49Path, 'utf8'));
const placeDefs = new Map<string, PlaceDef>();
const overrides: Record<string, Override> = JSON.parse(readFileSync(join(here, 'overrides.json'), 'utf8'));
const snapshotDate = statSync(numbeoPath).mtime.toISOString().slice(0, 10);
const qolPath = raw('numbeo-qol.csv');
if (!existsSync(qolPath)) {
  console.error('Missing pipeline/raw/numbeo-qol.csv — save the table from https://www.numbeo.com/quality-of-life/rankings_current.jsp');
  process.exit(1);
}
const qolByName = parseNumbeoQol(readFileSync(qolPath, 'utf8'));
// Per-topic rankings (name|index), read from the same manual page views.
const topic = (file: string): Map<string, number> => {
  const path = raw(file);
  if (!existsSync(path)) {
    console.warn(`(optional) ${file} missing — falling back to the Quality of Life table`);
    return new Map();
  }
  const out = new Map<string, number>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const [name, v] = line.split('|');
    const n = Number.parseFloat(v);
    if (name && Number.isFinite(n)) out.set(name.trim(), n);
  }
  return out;
};
const safetyByName = topic('numbeo-crime.psv'); // Safety Index column
const healthByName = topic('numbeo-health.psv'); // Health Care Index column
const anchor: {
  date: string;
  nycNet: number;
  validation: Record<string, number>;
  nycBasics: number;
  basicsValidation: Record<string, number>;
} = JSON.parse(
  readFileSync(join(here, 'salary-anchor.json'), 'utf8'),
);

// --- local salary: Numbeo's purchasing power is (salary / COL+rent basket)
// relative to NYC, so salary_c = nycNet x PP/100 x colRent/100. Calibrate the
// anchor with the median ratio against hand-read published salaries. ---
const uncalibrated = (pp: number, colRent: number) => (anchor.nycNet * pp * colRent) / 1e4;
const rowByName = new Map(numbeoRows.map((r) => [r.rawName, r]));
const ratios = Object.entries(anchor.validation).map(([name, published]) => {
  const r = rowByName.get(name);
  if (!r) throw new Error(`salary-anchor.json validation city "${name}" not in the Numbeo table`);
  return published / uncalibrated(r.purchasingPower, r.colRent);
});
const calibration = median(ratios);
const salaryOf = (pp: number, colRent: number) => Math.round(calibration * uncalibrated(pp, colRent));
const salaryErrors = Object.entries(anchor.validation).map(([name, published]) => {
  const r = rowByName.get(name)!;
  return { name, published, derived: salaryOf(r.purchasingPower, r.colRent), err: salaryOf(r.purchasingPower, r.colRent) / published - 1 };
});
const meanAbsError = salaryErrors.reduce((a, e) => a + Math.abs(e.err), 0) / salaryErrors.length;

// --- one person's non-rent costs: Numbeo's estimator scales with the COL index ---
const basicsRaw = (col: number) => (anchor.nycBasics * col) / 100;
const basicsK = median(
  Object.entries(anchor.basicsValidation).map(([name, published]) => {
    const r = rowByName.get(name);
    if (!r) throw new Error(`salary-anchor.json basics city "${name}" not in the Numbeo table`);
    return published / basicsRaw(r.col);
  }),
);
const basicsOf = (col: number) => Math.round(basicsK * basicsRaw(col));
const basicsErrors = Object.entries(anchor.basicsValidation).map(
  ([name, published]) => basicsOf(rowByName.get(name)!.col) / published - 1,
);
const basicsMeanAbsError = basicsErrors.reduce((a, e) => a + Math.abs(e), 0) / basicsErrors.length;

// --- match ---
const matcher = new CityMatcher(geoRows);
const results: MatchResult[] = [];
const unknownCountries = new Set<string>();
for (const row of numbeoRows) {
  const override = overrides[row.rawName];
  if (typeof override === 'object' && override !== null && !Array.isArray(override)) {
    results.push(matcher.match(row, '', override));
    continue;
  }
  const iso2 = resolveCountry(row.country, countryToIso);
  if (!iso2) {
    unknownCountries.add(row.country);
    results.push({ status: 'unmatched', row });
    continue;
  }
  results.push(matcher.match(row, iso2));
}

// --- assemble city records ---
const slugify = (s: string) => norm(s).replace(/\s+/g, '-');
const cities: CityRecord[] = [];
for (const r of results) {
  if (r.status === 'unmatched') continue;
  if (r.status === 'override' && 'skip' in r.override) continue;
  const geo = r.geo;
  const literal = r.status === 'override' && !geo ? (r.override as { lat: number; lng: number; iso2: string; pop?: number }) : null;
  const iso2 = geo?.iso2 ?? literal!.iso2;
  const record: CityRecord = {
    id: [slugify(r.row.city), r.row.adminHint && iso2 === 'US' ? r.row.adminHint.toLowerCase() : '', iso2.toLowerCase()]
      .filter(Boolean)
      .join('-'),
    name: r.row.city,
    ...(r.row.adminHint ? { admin: r.row.adminHint } : {}),
    country: r.row.country,
    iso2,
    places: placesFor(iso2, r.row.country, m49, placeDefs),
    lat: geo?.lat ?? literal!.lat,
    lng: geo?.lng ?? literal!.lng,
    ...(geo?.population ? { pop: geo.population } : literal?.pop ? { pop: literal.pop } : {}),
    col: r.row.col,
    rent: r.row.rent,
    colRent: r.row.colRent,
    groceries: r.row.groceries,
    restaurant: r.row.restaurant,
    purchasingPower: r.row.purchasingPower,
    salary: salaryOf(r.row.purchasingPower, r.row.colRent),
    basics: basicsOf(r.row.col),
  };
  const safety = safetyByName.get(r.row.rawName);
  const health = healthByName.get(r.row.rawName);
  const q = qolByName.get(r.row.rawName);
  if (q) {
    record.qol = {
      index: q.index,
      safety: q.safety,
      healthCare: q.healthCare,
      pollution: q.pollution,
      ...(q.climate !== undefined ? { climate: q.climate } : {}),
    };
  }
  const bestSafety = safety ?? q?.safety;
  const bestHealth = health ?? q?.healthCare;
  if (bestSafety !== undefined) record.safety = bestSafety;
  if (bestHealth !== undefined) record.healthCare = bestHealth;
  cities.push(record);
}

// slug collision guard
const seen = new Map<string, string>();
for (const c of cities) {
  const prev = seen.get(c.id);
  if (prev) {
    console.error(`FATAL: duplicate city id "${c.id}" (${prev} vs ${c.name}, ${c.country}) — add an override`);
    process.exit(1);
  }
  seen.set(c.id, `${c.name}, ${c.country}`);
}

// --- US reference index (population-weighted mean over US cities) ---
const usCities = cities.filter((c) => c.iso2 === 'US' && c.pop);
const wSum = usCities.reduce((a, c) => a + c.pop!, 0);
const usRefIndex = {
  col: round2(usCities.reduce((a, c) => a + c.col * c.pop!, 0) / wSum),
  colRent: round2(usCities.reduce((a, c) => a + c.colRent * c.pop!, 0) / wSum),
};

const meta: Meta = {
  edition: 'Numbeo Cost of Living Index (current)',
  snapshotDate,
  cityCount: cities.length,
  usRefIndex,
  salaryAnchor: {
    date: anchor.date,
    nycNet: anchor.nycNet,
    calibration: Math.round(calibration * 1e4) / 1e4,
    meanAbsError: Math.round(meanAbsError * 1e4) / 1e4,
    basicsCalibration: Math.round(basicsK * 1e4) / 1e4,
    basicsMeanAbsError: Math.round(basicsMeanAbsError * 1e4) / 1e4,
  },
};

// --- deciles ---
const deciles = buildDeciles(readFileSync(raw('fred_deciles.csv'), 'utf8'), 2024);

// --- places catalog ---
const placeCount = new Map<string, number>();
for (const c of cities) for (const p of c.places) placeCount.set(p, (placeCount.get(p) ?? 0) + 1);
const kindOrder = { continent: 0, subregion: 1, group: 2, country: 3 } as const;
const places: Place[] = [...placeDefs.values()]
  .map((d) => ({ ...d, count: placeCount.get(d.id) ?? 0 }))
  .sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.label.localeCompare(b.label));

// --- report ---
const counts: Record<string, number> = {};
for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
const report = {
  counts,
  unknownCountries: [...unknownCountries],
  unmatched: results.filter((r) => r.status === 'unmatched').map((r) => r.row.rawName),
  fuzzy: results
    .filter((r): r is Extract<MatchResult, { status: 'fuzzy' }> => r.status === 'fuzzy')
    .map((r) => ({
      numbeo: r.row.rawName,
      matched: `${r.geo.name} (admin1=${r.geo.admin1}, pop=${r.geo.population})`,
      via: r.matchedName,
      distance: r.distance,
    })),
};

mkdirSync(outDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });
writeFileSync(join(outDir, 'match-report.json'), JSON.stringify(report, null, 2));
writeFileSync(join(dataDir, 'cities.json'), JSON.stringify(cities));
writeFileSync(join(dataDir, 'meta.json'), JSON.stringify(meta, null, 2));
writeFileSync(join(dataDir, 'places.json'), JSON.stringify(places));
writeFileSync(join(dataDir, 'spendingDeciles.json'), JSON.stringify(deciles, null, 2));

console.log(`Numbeo rows: ${numbeoRows.length}`);
console.log(`Match tiers: ${JSON.stringify(counts)}`);
console.log(`Cities emitted: ${cities.length}`);
console.log(`US ref index (pop-weighted over ${usCities.length} US cities): col=${usRefIndex.col} colRent=${usRefIndex.colRent}`);
if (report.unknownCountries.length) console.log(`UNKNOWN COUNTRIES: ${report.unknownCountries.join('; ')}`);
if (report.unmatched.length) console.log(`UNMATCHED (${report.unmatched.length}): ${report.unmatched.join('; ')}`);
console.log(`Places: ${places.filter((p) => p.kind !== 'country').map((p) => `${p.label} ${p.count}`).join(', ')}`);
const qolJoined = cities.filter((c) => c.qol).length;
console.log(`QoL: ${qolJoined}/${cities.length} cities rated (${qolByName.size} rows in the QoL table)`);
console.log(`Safety: ${cities.filter((c) => c.safety !== undefined).length} cities · Health care: ${cities.filter((c) => c.healthCare !== undefined).length} cities`);
const qolOrphans = [...qolByName.keys()].filter((n) => !rowByName.has(n));
if (qolOrphans.length) console.log(`QoL rows with no cost-table city (ignored): ${qolOrphans.join('; ')}`);
console.log(`Salary calibration k=${calibration.toFixed(4)}, mean |err| ${(meanAbsError * 100).toFixed(1)}% over ${salaryErrors.length} cities:`);
for (const e of salaryErrors) console.log(`  ${e.name.padEnd(28)} published ${e.published.toFixed(0).padStart(5)}  derived ${String(e.derived).padStart(5)}  ${(e.err * 100).toFixed(1)}%`);
console.log(`Basics calibration k=${basicsK.toFixed(4)}, mean |err| ${(basicsMeanAbsError * 100).toFixed(1)}%; floor binds in ${cities.filter((c) => c.basics > c.salary).length} cities`);
console.log(`Fuzzy matches to eyeball: ${report.fuzzy.length} (see pipeline/out/match-report.json)`);

// --- sanity tripwires ---
const failures: string[] = [];
if (cities.length < 450) failures.push(`cityCount ${cities.length} < 450`);
for (const c of cities) {
  for (const k of ['col', 'rent', 'colRent', 'groceries', 'restaurant', 'purchasingPower'] as const) {
    if (!(c[k] > 0)) failures.push(`${c.id}.${k} = ${c[k]}`);
  }
  if (!(Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180)) failures.push(`${c.id} bad coords`);
}
if (meanAbsError > 0.05) failures.push(`salary derivation mean |err| ${(meanAbsError * 100).toFixed(1)}% > 5%`);
if (basicsMeanAbsError > 0.1) failures.push(`basics mean |err| ${(basicsMeanAbsError * 100).toFixed(1)}% > 10%`);
if (qolJoined < 250) failures.push(`only ${qolJoined} cities have QoL (< 250)`);
for (const c of cities) if (!(c.salary > 50)) failures.push(`${c.id}.salary = ${c.salary}`);
for (const c of cities) if (!(c.pop && c.pop > 0)) failures.push(`${c.id} has no population — add "pop" to its override`);
for (const k of ['col', 'colRent'] as const) {
  if (usRefIndex[k] < 55 || usRefIndex[k] > 90) failures.push(`usRefIndex.${k} = ${usRefIndex[k]} outside [55,90]`);
}
if (failures.length) {
  console.error(`SANITY FAILURES:\n  ${failures.slice(0, 20).join('\n  ')}`);
  process.exit(1);
}
console.log('Sanity checks passed. Wrote src/data/{cities,meta,spendingDeciles}.json');

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
