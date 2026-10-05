// Nonstop passenger routes from US airports, read from Wikipedia's
// "Airlines and destinations" tables (CC BY-SA 4.0) via the MediaWiki API.
//
//   npx tsx pipeline/fetch-flights.ts
//
// 1. US airports = FAA large + medium hubs, from Wikipedia's "List of the
//    busiest airports in the United States".
// 2. For each, the Passenger destinations table: every linked destination
//    airport, with seasonal routes flagged and charters / not-yet-started
//    ("begins …") routes skipped.
// 3. Coordinates for every destination airport (prop=coordinates, falling
//    back to Wikidata P625).
// Writes pipeline/raw/flights/routes.json; build-data.ts maps it to cities.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import type { HTMLElement } from 'node-html-parser';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'raw', 'flights');
const API = 'https://en.wikipedia.org/w/api.php';
const HEADERS = { 'User-Agent': 'RetireMap/1.0 (https://retiremap-ej.web.app) data pipeline' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(params: Record<string, string>): Promise<any> {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) {
      const j = await res.json();
      if (j.error) throw new Error(`${j.error.code}: ${j.error.info} (${url})`);
      await sleep(250); // be gentle
      return j;
    }
    if (attempt >= 3) throw new Error(`HTTP ${res.status} for ${url}`);
    await sleep(2000 * (attempt + 1));
  }
}

const html = (s: string) => parse(s);

export type UsAirport = { iata: string; name: string; title: string; hub: 'large' | 'medium' };
export type Route = { from: string; to: string; seasonal: boolean };
export type Dest = { title: string; lat: number; lng: number; country?: string }; // country = Wikidata QID

async function usAirports(): Promise<UsAirport[]> {
  const j = await api({ action: 'parse', page: 'List of the busiest airports in the United States', prop: 'text', disableeditsection: '1' });
  const root = html(j.parse.text);
  const out: UsAirport[] = [];
  for (const table of root.querySelectorAll('table.wikitable')) {
    const header = table.querySelector('tr')!.querySelectorAll('th,td').map((c) => c.text.trim());
    const hub = header.some((h) => /large/i.test(h)) ? 'large' : header.some((h) => /medium/i.test(h)) ? 'medium' : null;
    if (!hub) continue;
    const iataCol = header.findIndex((h) => /IATA/i.test(h));
    const nameCol = header.findIndex((h) => /Airports/i.test(h));
    for (const tr of table.querySelectorAll('tr').slice(1)) {
      const cells = tr.querySelectorAll('td,th');
      const iata = cells[iataCol]?.text.trim();
      const link = cells[nameCol]?.querySelector('a');
      if (iata && /^[A-Z]{3}$/.test(iata) && link) out.push({ iata, name: link.text.trim(), title: link.getAttribute('title')!, hub });
    }
  }
  if (out.length < 50) throw new Error(`Only found ${out.length} US hub airports`);
  return out;
}

/** Destination article titles from one airport's Passenger table. */
async function destinations(a: UsAirport): Promise<{ title: string; seasonal: boolean }[]> {
  const secs = await api({ action: 'parse', page: a.title, prop: 'sections', redirects: '1' });
  const list: { index: string; line: string; level: string }[] = secs.parse.sections;
  const ad = list.findIndex((s) => /airlines and destinations/i.test(s.line));
  if (ad === -1) return [];
  // Prefer the "Passenger" subsection; some pages put the table directly under the heading.
  const sub = list.slice(ad + 1).find((s, i, arr) => /passenger/i.test(s.line) && arr.slice(0, i).every((x) => Number(x.level) > Number(list[ad].level)));
  const index = (sub ?? list[ad]).index;
  const j = await api({ action: 'parse', page: secs.parse.title, prop: 'text', section: index, disableeditsection: '1' });
  const root = html(j.parse.text);
  const table = root.querySelectorAll('table').find((t) => /airlines/i.test(t.querySelector('tr')?.text ?? ''));
  if (!table) return [];
  const out: { title: string; seasonal: boolean }[] = [];
  for (const tr of table.querySelectorAll('tr').slice(1)) {
    const cells = tr.querySelectorAll('td');
    if (cells.length < 2) continue;
    collect(cells[1], out);
  }
  return out;
}

/** Walk a destinations cell in order, tracking "Seasonal:" / "charter" labels and "(begins …)" notes. */
function collect(cell: HTMLElement, out: { title: string; seasonal: boolean }[]) {
  let seasonal = false;
  let charter = false;
  let pending: { title: string; seasonal: boolean } | null = null;
  const flush = () => {
    if (pending) out.push(pending);
    pending = null;
  };
  const walk = (node: HTMLElement | any) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        const t: string = child.rawText;
        if (/begins/i.test(t) && pending) pending = null; // not flying yet
        const label = t.match(/(seasonal\s+charter|charter|seasonal)\s*:/i);
        if (label) {
          flush();
          seasonal = /seasonal/i.test(label[1]);
          charter = /charter/i.test(label[1]);
        }
        continue;
      }
      const el = child as HTMLElement;
      if (el.tagName === 'SUP') continue; // footnotes
      if (el.tagName === 'A' && el.getAttribute('title') && !(el.getAttribute('href') ?? '').startsWith('#')) {
        flush();
        if (!charter) pending = { title: el.getAttribute('title')!, seasonal };
        continue;
      }
      if (el.tagName === 'B' || el.tagName === 'I' || el.tagName === 'SPAN' || el.tagName === 'DIV' || el.tagName === 'P') {
        const t = el.text;
        const label = t.match(/^\s*(seasonal\s+charter|charter|seasonal)\s*:?\s*$/i);
        if (label) {
          flush();
          seasonal = /seasonal/i.test(label[1]);
          charter = /charter/i.test(label[1]);
          continue;
        }
      }
      walk(el);
    }
  };
  walk(cell);
  flush();
}

async function coordinates(titles: string[]): Promise<Map<string, Dest>> {
  const out = new Map<string, Dest>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const j = await api({ action: 'query', prop: 'coordinates|pageprops', ppprop: 'wikibase_item', titles: batch.join('|'), redirects: '1', colimit: 'max' });
    // Map redirected titles back to what the tables linked.
    const back = new Map<string, string[]>();
    for (const t of batch) back.set(t, [t]);
    for (const n of j.query.normalized ?? []) back.set(n.to, [...(back.get(n.to) ?? []), ...(back.get(n.from) ?? [n.from])]);
    for (const r of j.query.redirects ?? []) back.set(r.to, [...(back.get(r.to) ?? []), ...(back.get(r.from) ?? [r.from])]);
    const pages: { titles: string[]; qid?: string; title: string; c?: { lat: number; lon: number } }[] = [];
    for (const p of j.query.pages ?? []) {
      pages.push({ titles: [...new Set([p.title, ...(back.get(p.title) ?? [])])], qid: p.pageprops?.wikibase_item, title: p.title, c: p.coordinates?.[0] });
    }
    // Wikidata gives every airport's country (P17) — needed to drop domestic US
    // routes — and coordinates (P625) where the article doesn't expose them.
    const wd = await wikidata(pages.flatMap((x) => (x.qid ? [x.qid] : [])));
    for (const x of pages) {
      const w = x.qid ? wd.get(x.qid) : undefined;
      const lat = x.c?.lat ?? w?.lat;
      const lng = x.c?.lon ?? w?.lng;
      if (lat === undefined || lng === undefined) continue;
      for (const t of x.titles) out.set(t, { title: x.title, lat, lng, ...(w?.country ? { country: w.country } : {}) });
    }
  }
  return out;
}

async function wikidata(ids: string[]): Promise<Map<string, { lat?: number; lng?: number; country?: string }>> {
  const out = new Map<string, { lat?: number; lng?: number; country?: string }>();
  for (let i = 0; i < ids.length; i += 50) {
    const url = `https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetentities', ids: ids.slice(i, i + 50).join('|'), props: 'claims', format: 'json' })}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
    const j = await res.json();
    for (const [id, e] of Object.entries<any>(j.entities ?? {})) {
      const v = e.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
      const country = e.claims?.P17?.[0]?.mainsnak?.datavalue?.value?.id;
      out.set(id, { ...(v ? { lat: v.latitude, lng: v.longitude } : {}), ...(country ? { country } : {}) });
    }
    await sleep(250);
  }
  return out;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const airports = await usAirports();
  console.log(`${airports.length} US hub airports`);
  const routes: Route[] = [];
  for (const a of airports) {
    const d = await destinations(a);
    for (const x of d) routes.push({ from: a.iata, to: x.title, seasonal: x.seasonal });
    console.log(`  ${a.iata.padEnd(4)} ${String(d.length).padStart(3)} destinations  (${a.title})`);
  }
  const titles = [...new Set(routes.map((r) => r.to))];
  const coords = await coordinates(titles);
  const missing = titles.filter((t) => !coords.has(t));
  console.log(`${titles.length} destination airports; ${missing.length} without coordinates (skipped): ${missing.slice(0, 12).join('; ')}`);
  writeFileSync(
    join(outDir, 'routes.json'),
    JSON.stringify(
      {
        fetched: new Date().toISOString().slice(0, 10),
        source: 'Wikipedia "Airlines and destinations" tables (CC BY-SA 4.0); coordinates from Wikipedia/Wikidata',
        airports,
        routes: routes.filter((r) => coords.has(r.to)),
        destinations: Object.fromEntries([...coords].map(([t, c]) => [t, c])),
      },
      null,
      1,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
