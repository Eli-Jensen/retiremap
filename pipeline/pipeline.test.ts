import { describe, expect, it } from 'vitest';
import { norm, nameVariants, levenshtein } from './normalize.ts';
import { parseCsv, parseNumbeo, splitRawName } from './parse-numbeo.ts';
import { CityMatcher, resolveCountry } from './match-cities.ts';
import type { GeoNamesRow } from './match-cities.ts';
import { buildDeciles } from './build-deciles.ts';

describe('norm', () => {
  it('strips diacritics and punctuation', () => {
    expect(norm('Zürich')).toBe('zurich');
    expect(norm('São Paulo')).toBe('sao paulo');
    expect(norm("Reggio Nell'emilia")).toBe('reggio nell emilia');
    expect(norm("Xi'an")).toBe('xi an');
    expect(norm('The Hague (Den Haag)')).toBe('the hague den haag');
  });
});

describe('nameVariants', () => {
  it('splits parenthesized alternates', () => {
    expect(nameVariants('Krakow (Cracow)')).toEqual(['krakow cracow', 'krakow', 'cracow']);
    expect(nameVariants('Lisbon')).toEqual(['lisbon']);
  });
});

describe('splitRawName', () => {
  it('handles City, Country', () => {
    expect(splitRawName('Zurich, Switzerland')).toEqual({ city: 'Zurich', adminHint: undefined, country: 'Switzerland' });
  });
  it('handles City, State, Country', () => {
    expect(splitRawName('New York, NY, United States')).toEqual({ city: 'New York', adminHint: 'NY', country: 'United States' });
  });
  it('keeps multi-word admin hints', () => {
    expect(splitRawName("St. John's, Newfoundland and Labrador, Canada")).toEqual({
      city: "St. John's",
      adminHint: 'Newfoundland and Labrador',
      country: 'Canada',
    });
  });
});

describe('parseCsv', () => {
  it('handles quoted fields with commas and escaped quotes', () => {
    expect(parseCsv('"a","b ""x"", c"\n"1","2"')).toEqual([
      ['a', 'b "x", c'],
      ['1', '2'],
    ]);
  });
});

describe('parseNumbeo (CSV)', () => {
  const csv = [
    '"Rank","City","Cost of Living Index","Rent Index","Cost of Living Plus Rent Index","Groceries Index","Restaurant Price Index","Local Purchasing Power Index"',
    '"1","Zurich, Switzerland","123.5","74.3","101.0","126.9","120.5","151.6"',
    '"13","New York, NY, United States","100.0","100.0","100.0","100.0","100.0","100.0"',
  ].join('\n');
  it('maps columns by header and splits names', () => {
    const rows = parseNumbeo(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ city: 'Zurich', country: 'Switzerland', col: 123.5, colRent: 101.0, purchasingPower: 151.6 });
    expect(rows[1]).toMatchObject({ city: 'New York', adminHint: 'NY', rent: 100.0 });
  });
  it('rejects tables missing an expected column', () => {
    expect(() => parseNumbeo('"City","Rent Index"\n"X, Y","1"')).toThrow(/missing expected column/);
  });
});

describe('parseNumbeo (HTML)', () => {
  const html = `<html><body><table>
    <thead><tr><th>Rank</th><th>City</th><th>Cost of Living Index</th><th>Rent Index</th><th>Cost of Living Plus Rent Index</th><th>Groceries Index</th><th>Restaurant Price Index</th><th>Local Purchasing Power Index</th></tr></thead>
    <tbody><tr><td>1</td><td>Zurich, Switzerland</td><td>123.5</td><td>74.3</td><td>101.0</td><td>126.9</td><td>120.5</td><td>151.6</td></tr></tbody>
  </table></body></html>`;
  it('parses the biggest table', () => {
    const rows = parseNumbeo(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ city: 'Zurich', col: 123.5 });
  });
});

describe('resolveCountry', () => {
  const map = new Map([
    ['czechia', 'CZ'],
    ['the netherlands', 'NL'],
    ['kosovo', 'XK'],
    ['switzerland', 'CH'],
  ]);
  it('resolves direct, aliased, and parenthesized names', () => {
    expect(resolveCountry('Switzerland', map)).toBe('CH');
    expect(resolveCountry('Czech Republic', map)).toBe('CZ');
    expect(resolveCountry('Netherlands', map)).toBe('NL');
    expect(resolveCountry('Kosovo (Disputed Territory)', map)).toBe('XK');
    expect(resolveCountry('Atlantis', map)).toBeNull();
  });
});

describe('CityMatcher', () => {
  const geo = (over: Partial<GeoNamesRow>): GeoNamesRow => ({
    geonameid: 0,
    name: '',
    asciiname: '',
    alternatenames: [],
    lat: 0,
    lng: 0,
    iso2: 'US',
    admin1: '',
    population: 0,
    ...over,
  });
  const rows: GeoNamesRow[] = [
    geo({ geonameid: 1, name: 'Zürich', asciiname: 'Zurich', iso2: 'CH', population: 415367 }),
    geo({ geonameid: 2, name: 'Springfield', asciiname: 'Springfield', iso2: 'US', admin1: 'IL', population: 116250 }),
    geo({ geonameid: 3, name: 'Springfield', asciiname: 'Springfield', iso2: 'US', admin1: 'MO', population: 169176 }),
    geo({ geonameid: 4, name: 'Frankfurt am Main', asciiname: 'Frankfurt am Main', iso2: 'DE', population: 650000 }),
    geo({ geonameid: 5, name: 'Bengaluru', asciiname: 'Bengaluru', alternatenames: ['Bangalore', 'Bengalūru'], iso2: 'IN', population: 8495492 }),
    geo({ geonameid: 6, name: 'São Paulo', asciiname: 'Sao Paulo', iso2: 'BR', population: 12200000 }),
  ];
  const matcher = new CityMatcher(rows);
  const numbeoRow = (city: string, country: string, adminHint?: string) => ({
    rawName: `${city}, ${country}`,
    city,
    adminHint,
    country,
    col: 1,
    rent: 1,
    colRent: 1,
    groceries: 1,
    restaurant: 1,
    purchasingPower: 1,
  });

  it('matches diacritic-insensitively', () => {
    const m = matcher.match(numbeoRow('Zurich', 'Switzerland'), 'CH');
    expect(m.status).toBe('exact');
    expect(m.status === 'exact' && m.geo.geonameid).toBe(1);
    const sp = matcher.match(numbeoRow('Sao Paulo', 'Brazil'), 'BR');
    expect(sp.status === 'exact' && sp.geo.geonameid).toBe(6);
  });

  it('disambiguates same-named cities by state hint', () => {
    const il = matcher.match(numbeoRow('Springfield', 'United States', 'IL'), 'US');
    expect(il.status === 'exact' && il.geo.admin1).toBe('IL');
    const noHint = matcher.match(numbeoRow('Springfield', 'United States'), 'US');
    expect(noHint.status === 'exact' && noHint.geo.admin1).toBe('MO'); // biggest wins
  });

  it('falls back to alternate names, then fuzzy prefix', () => {
    const alt = matcher.match(numbeoRow('Bangalore', 'India'), 'IN');
    expect(alt.status).toBe('altname');
    const fuzzy = matcher.match(numbeoRow('Frankfurt', 'Germany'), 'DE');
    expect(fuzzy.status).toBe('fuzzy');
    expect(fuzzy.status === 'fuzzy' && fuzzy.geo.geonameid).toBe(4);
  });

  it('honors overrides above everything', () => {
    const m = matcher.match(numbeoRow('Zurich', 'Switzerland'), 'CH', { geonameid: 4 });
    expect(m.status).toBe('override');
    expect(m.status === 'override' && m.geo?.geonameid).toBe(4);
    const skip = matcher.match(numbeoRow('Zurich', 'Switzerland'), 'CH', { skip: true });
    expect(skip.status === 'override' && skip.geo).toBeNull();
  });

  it('reports unmatched', () => {
    expect(matcher.match(numbeoRow('Gotham', 'United States'), 'US').status).toBe('unmatched');
  });
});

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
});

describe('buildDeciles', () => {
  // Real 2024 values from FRED CXUTOTALEXPLB1502M-1511M.
  const good = [
    'observation_date,a,b,c,d,e,f,g,h,i,j',
    '2024-01-01,31660,38473,46340,53778,62880,70913,81716,98158,121317,179513',
  ].join('\n');
  it('produces anchors at percentile midpoints and passes cross-checks', () => {
    const d = buildDeciles(good, 2024);
    expect(d.anchors).toHaveLength(10);
    expect(d.anchors[0]).toEqual({ p: 5, annual: 31660 });
    expect(d.anchors[9]).toEqual({ p: 95, annual: 179513 });
  });
  it('trips on non-increasing or off-target values', () => {
    const swapped = good.replace('38473', '31000');
    expect(() => buildDeciles(swapped, 2024)).toThrow(/increasing|cross-check/);
    const inflated = good.replace('179513', '279513');
    expect(() => buildDeciles(inflated, 2024)).toThrow(/cross-check/);
  });
});
