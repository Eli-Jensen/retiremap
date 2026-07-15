// Pipeline entry: npm run pipeline
// Reads manually downloaded raw files, joins Numbeo cities to GeoNames
// coordinates, and emits the committed JSON snapshots the app builds from.
import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CityRecord, Meta } from '../src/lib/types.ts';
import { parseNumbeo } from './parse-numbeo.ts';
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
const countryToIso = parseCountryInfo(readFileSync(raw('countryInfo.txt'), 'utf8'));
const overrides: Record<string, Override> = JSON.parse(readFileSync(join(here, 'overrides.json'), 'utf8'));
const snapshotDate = statSync(numbeoPath).mtime.toISOString().slice(0, 10);

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
  const literal = r.status === 'override' && !geo ? (r.override as { lat: number; lng: number; iso2: string }) : null;
  const iso2 = geo?.iso2 ?? literal!.iso2;
  const record: CityRecord = {
    id: [slugify(r.row.city), r.row.adminHint && iso2 === 'US' ? r.row.adminHint.toLowerCase() : '', iso2.toLowerCase()]
      .filter(Boolean)
      .join('-'),
    name: r.row.city,
    ...(r.row.adminHint ? { admin: r.row.adminHint } : {}),
    country: r.row.country,
    iso2,
    lat: geo?.lat ?? literal!.lat,
    lng: geo?.lng ?? literal!.lng,
    ...(geo?.population ? { pop: geo.population } : {}),
    col: r.row.col,
    rent: r.row.rent,
    colRent: r.row.colRent,
    groceries: r.row.groceries,
    restaurant: r.row.restaurant,
    purchasingPower: r.row.purchasingPower,
  };
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
};

// --- deciles ---
const deciles = buildDeciles(readFileSync(raw('fred_deciles.csv'), 'utf8'), 2024);

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
writeFileSync(join(dataDir, 'spendingDeciles.json'), JSON.stringify(deciles, null, 2));

console.log(`Numbeo rows: ${numbeoRows.length}`);
console.log(`Match tiers: ${JSON.stringify(counts)}`);
console.log(`Cities emitted: ${cities.length}`);
console.log(`US ref index (pop-weighted over ${usCities.length} US cities): col=${usRefIndex.col} colRent=${usRefIndex.colRent}`);
if (report.unknownCountries.length) console.log(`UNKNOWN COUNTRIES: ${report.unknownCountries.join('; ')}`);
if (report.unmatched.length) console.log(`UNMATCHED (${report.unmatched.length}): ${report.unmatched.join('; ')}`);
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
for (const k of ['col', 'colRent'] as const) {
  if (usRefIndex[k] < 55 || usRefIndex[k] > 90) failures.push(`usRefIndex.${k} = ${usRefIndex[k]} outside [55,90]`);
}
if (failures.length) {
  console.error(`SANITY FAILURES:\n  ${failures.slice(0, 20).join('\n  ')}`);
  process.exit(1);
}
console.log('Sanity checks passed. Wrote src/data/{cities,meta,spendingDeciles}.json');

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
