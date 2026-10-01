// Place tags for filtering ("only Southeast Asia", "never India or Africa").
// Geography comes from the UN M49 standard (continent → sub-region →
// intermediate region), relabeled the way people talk about retiring
// abroad, plus a few cross-cutting groups.
import { parseCsv } from './parse-numbeo.ts';
import type { PlaceKind } from '../src/lib/types.ts';

export type PlaceDef = { id: string; label: string; kind: PlaceKind };

type M49Row = { region: string; subregion: string; intermediate: string };

// Not in M49 (UN membership), placed by hand.
const M49_EXTRA: Record<string, M49Row> = {
  TW: { region: 'Asia', subregion: 'Eastern Asia', intermediate: '' },
  XK: { region: 'Europe', subregion: 'Southern Europe', intermediate: '' },
};

const SUBREGION_LABELS: Record<string, string> = {
  'South-eastern Asia': 'Southeast Asia',
  'Northern America': 'US & Canada',
  'Latin America and the Caribbean': 'Latin America & Caribbean',
  'Australia and New Zealand': 'Australia & New Zealand',
  'Western Asia': 'Western Asia',
};

// Cross-cutting groups. EU: the 27 member states as of 2026.
const GROUPS: Record<string, { label: string; members: string[] }> = {
  eu: {
    label: 'European Union',
    members: 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' '),
  },
  'middle-east': {
    label: 'Middle East',
    members: 'AE BH CY EG IL IQ IR JO KW LB OM PS QA SA SY TR YE'.split(' '),
  },
};

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function parseM49(text: string): Map<string, M49Row> {
  const table = parseCsv(text);
  const h = table[0].map((x) => x.trim());
  const col = (name: string) => {
    const i = h.indexOf(name);
    if (i === -1) throw new Error(`m49.csv missing column "${name}"`);
    return i;
  };
  const [iso, reg, sub, mid] = [col('ISO-alpha2 Code'), col('Region Name'), col('Sub-region Name'), col('Intermediate Region Name')];
  const out = new Map<string, M49Row>();
  for (const r of table.slice(1)) if (r[iso]) out.set(r[iso].trim(), { region: r[reg], subregion: r[sub], intermediate: r[mid] });
  for (const [k, v] of Object.entries(M49_EXTRA)) out.set(k, v);
  return out;
}

/** Ordered tags for one country: continent, sub-region(s), groups, country. */
export function placesFor(iso2: string, country: string, m49: Map<string, M49Row>, defs: Map<string, PlaceDef>): string[] {
  const m = m49.get(iso2);
  if (!m) throw new Error(`No M49 region for ${iso2}`);
  const add = (id: string, label: string, kind: PlaceKind, tags: string[]) => {
    if (!defs.has(id)) defs.set(id, { id, label, kind });
    if (!tags.includes(id)) tags.push(id);
  };
  const tags: string[] = [];
  // Continent: M49 regions, with the Americas split the everyday way.
  if (m.region === 'Americas') {
    add(m.intermediate === 'South America' ? 'south-america' : 'north-america', m.intermediate === 'South America' ? 'South America' : 'North America', 'continent', tags);
  } else add(slug(m.region), m.region, 'continent', tags);
  const sub = SUBREGION_LABELS[m.subregion] ?? m.subregion;
  add(slug(sub), sub, 'subregion', tags);
  if (m.intermediate && m.intermediate !== 'South America') add(slug(m.intermediate), m.intermediate, 'subregion', tags);
  for (const [id, g] of Object.entries(GROUPS)) if (g.members.includes(iso2)) add(id, g.label, 'group', tags);
  add(`c-${iso2.toLowerCase()}`, country, 'country', tags);
  return tags;
}
