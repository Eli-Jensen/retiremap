// Joins Numbeo rows to GeoNames cities15000 for coordinates + population.
import { norm, nameVariants, levenshtein, COUNTRY_ALIASES } from './normalize.ts';
import type { NumbeoRow } from './parse-numbeo.ts';

export type GeoNamesRow = {
  geonameid: number;
  name: string;
  asciiname: string;
  alternatenames: string[];
  lat: number;
  lng: number;
  iso2: string;
  admin1: string;
  population: number;
};

export type Override =
  | { geonameid: number; note?: string }
  | { lat: number; lng: number; iso2: string; note?: string }
  | { skip: true; note?: string };

export type MatchResult =
  | { status: 'override'; row: NumbeoRow; geo: GeoNamesRow | null; override: Override }
  | { status: 'exact' | 'altname'; row: NumbeoRow; geo: GeoNamesRow }
  | { status: 'fuzzy'; row: NumbeoRow; geo: GeoNamesRow; matchedName: string; distance: number }
  | { status: 'unmatched'; row: NumbeoRow };

// cities15000.txt: tab-separated, no header. Field indexes per GeoNames readme.
export function parseGeoNames(text: string): GeoNamesRow[] {
  const rows: GeoNamesRow[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const f = line.split('\t');
    rows.push({
      geonameid: Number(f[0]),
      name: f[1],
      asciiname: f[2],
      alternatenames: f[3] ? f[3].split(',') : [],
      lat: Number(f[4]),
      lng: Number(f[5]),
      iso2: f[8],
      admin1: f[10],
      population: Number(f[14]) || 0,
    });
  }
  return rows;
}

// countryInfo.txt: tab-separated with #-comment header; ISO(0), Country(4).
export function parseCountryInfo(text: string): Map<string, string> {
  const nameToIso = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const f = line.split('\t');
    nameToIso.set(norm(f[4]), f[0]);
  }
  return nameToIso;
}

export function resolveCountry(numbeoCountry: string, nameToIso: Map<string, string>): string | null {
  for (const variant of nameVariants(numbeoCountry)) {
    const aliased = COUNTRY_ALIASES[variant] ?? variant;
    const iso = nameToIso.get(aliased);
    if (iso) return iso;
  }
  return null;
}

export class CityMatcher {
  private byNameCountry = new Map<string, GeoNamesRow[]>();
  private byCountry = new Map<string, GeoNamesRow[]>();
  private byId = new Map<number, GeoNamesRow>();

  constructor(geoRows: GeoNamesRow[]) {
    for (const g of geoRows) {
      this.byId.set(g.geonameid, g);
      const names = new Set([norm(g.name), norm(g.asciiname)]);
      for (const n of names) {
        if (!n) continue;
        const key = `${n}|${g.iso2}`;
        (this.byNameCountry.get(key) ?? this.byNameCountry.set(key, []).get(key)!).push(g);
      }
      (this.byCountry.get(g.iso2) ?? this.byCountry.set(g.iso2, []).get(g.iso2)!).push(g);
    }
  }

  geoById(id: number): GeoNamesRow | null {
    return this.byId.get(id) ?? null;
  }

  match(row: NumbeoRow, iso2: string, override?: Override): MatchResult {
    if (override) {
      if ('skip' in override) return { status: 'override', row, geo: null, override };
      if ('geonameid' in override) {
        const geo = this.byId.get(override.geonameid);
        if (!geo) throw new Error(`Override for "${row.rawName}": geonameid ${override.geonameid} not in cities15000`);
        return { status: 'override', row, geo, override };
      }
      return { status: 'override', row, geo: null, override };
    }

    const variants = nameVariants(row.city);

    // Tier: exact name|country
    for (const v of variants) {
      const candidates = this.byNameCountry.get(`${v}|${iso2}`);
      if (candidates?.length) return { status: 'exact', row, geo: this.disambiguate(candidates, row, iso2) };
    }

    const countryRows = this.byCountry.get(iso2) ?? [];

    // Tier: exact match against GeoNames alternate names
    const altHits = countryRows.filter((g) => g.alternatenames.some((a) => variants.includes(norm(a))));
    if (altHits.length) return { status: 'altname', row, geo: this.disambiguate(altHits, row, iso2) };

    // Tier: fuzzy (prefix/substring or small edit distance) within country
    let best: { geo: GeoNamesRow; name: string; distance: number; score: number } | null = null;
    for (const g of countryRows) {
      for (const gname of [norm(g.name), norm(g.asciiname)]) {
        for (const v of variants) {
          const substr = gname.startsWith(v) || v.startsWith(gname);
          const dist = substr ? 0 : levenshtein(v, gname);
          const threshold = Math.max(1, Math.floor(v.length / 8));
          if (substr || dist <= threshold) {
            const score = dist - g.population / 1e9; // prefer closer, then bigger
            if (!best || score < best.score) {
              best = { geo: g, name: gname, distance: dist, score };
            }
          }
        }
      }
    }
    if (best) return { status: 'fuzzy', row, geo: best.geo, matchedName: best.name, distance: best.distance };

    return { status: 'unmatched', row };
  }

  // Multiple same-named cities in a country (Springfield problem): prefer the
  // admin1 hinted by Numbeo (US state abbrevs match GeoNames admin1 directly),
  // else the most populous.
  private disambiguate(candidates: GeoNamesRow[], row: NumbeoRow, iso2: string): GeoNamesRow {
    if (candidates.length === 1) return candidates[0];
    if (row.adminHint) {
      const hint = row.adminHint.toUpperCase();
      const byAdmin = candidates.filter((g) => g.admin1.toUpperCase() === hint);
      if (byAdmin.length) return byAdmin.sort((a, b) => b.population - a.population)[0];
    }
    return [...candidates].sort((a, b) => b.population - a.population)[0];
  }
}
