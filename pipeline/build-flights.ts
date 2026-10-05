// Map Wikipedia nonstop routes (fetch-flights.ts) onto cities: a city is
// served from a US airport if any destination airport within RADIUS_KM of
// the city has a nonstop to it.
import { existsSync, readFileSync } from 'node:fs';
import type { CityRecord, UsFlights } from '../src/lib/types.ts';

export const RADIUS_KM = 80;

type RoutesFile = {
  fetched: string;
  airports: { iata: string; name: string; hub: 'large' | 'medium' }[];
  routes: { from: string; to: string; seasonal: boolean }[];
  destinations: Record<string, { title: string; lat: number; lng: number; country?: string }>;
};

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const IN_US = new Set(['US', 'PR']);
// Wikidata QIDs of the US and its inhabited territories: flights there are domestic.
const US_QIDS = new Set(['Q30', 'Q1183', 'Q11703', 'Q16635', 'Q16641', 'Q16644']);

export function loadFlights(path: string): RoutesFile | null {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

/** US airports with nonstops to airports near this city; undefined for US cities. */
export function flightsFor(c: CityRecord, f: RoutesFile): UsFlights | undefined {
  if (IN_US.has(c.iso2)) return undefined;
  // Group by canonical airport (several linked titles can redirect to one article).
  const near = new Map<string, number>(); // canonical title -> km
  for (const [, d] of Object.entries(f.destinations)) {
    if (d.country && US_QIDS.has(d.country)) continue; // e.g. Detroit for Windsor, San Diego for Tijuana
    const km = haversineKm(c, d);
    if (km <= RADIUS_KM && (!near.has(d.title) || km < near.get(d.title)!)) near.set(d.title, km);
  }
  const yearRound = new Set<string>();
  const seasonal = new Set<string>();
  for (const r of f.routes) {
    const d = f.destinations[r.to];
    if (!d || !near.has(d.title)) continue;
    (r.seasonal ? seasonal : yearRound).add(r.from);
  }
  for (const a of yearRound) seasonal.delete(a);
  const airports = [...near].sort((a, b) => a[1] - b[1]);
  return {
    yearRound: [...yearRound].sort(),
    seasonal: [...seasonal].sort(),
    via: airports.filter(([t]) => f.routes.some((r) => f.destinations[r.to]?.title === t)).slice(0, 3).map(([t, km]) => ({ airport: t, km: Math.round(km) })),
  };
}
