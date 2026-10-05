import { describe, expect, it } from 'vitest';
import { haversineKm, flightsFor } from './build-flights.ts';
import type { CityRecord } from '../src/lib/types.ts';

const city = (iso2: string, lat: number, lng: number) => ({ id: 'x', iso2, lat, lng }) as CityRecord;
const file = {
  fetched: '2026-10-05',
  airports: [
    { iata: 'JFK', name: 'JFK', hub: 'large' as const },
    { iata: 'PHL', name: 'PHL', hub: 'large' as const },
    { iata: 'MIA', name: 'MIA', hub: 'large' as const },
  ],
  routes: [
    { from: 'JFK', to: 'Lisbon Airport', seasonal: false },
    { from: 'PHL', to: 'Lisbon Airport', seasonal: true },
    { from: 'JFK', to: 'LIS redirect', seasonal: true }, // same airport via a redirect title
    { from: 'MIA', to: 'Faraway Airport', seasonal: false },
    { from: 'JFK', to: 'Detroit Metropolitan Airport', seasonal: false },
  ],
  destinations: {
    'Lisbon Airport': { title: 'Lisbon Airport', lat: 38.7742, lng: -9.1342 },
    'LIS redirect': { title: 'Lisbon Airport', lat: 38.7742, lng: -9.1342 },
    'Faraway Airport': { title: 'Faraway Airport', lat: 40.0, lng: -4.0 },
    'Detroit Metropolitan Airport': { title: 'Detroit Metropolitan Airport', lat: 42.2125, lng: -83.3534, country: 'Q30' },
  },
};

describe('flights', () => {
  it('haversine: Lisbon city ↔ airport ≈ 6 km; NYC ↔ London ≈ 5,570 km', () => {
    expect(haversineKm({ lat: 38.7223, lng: -9.1393 }, { lat: 38.7742, lng: -9.1342 })).toBeCloseTo(5.8, 0);
    expect(haversineKm({ lat: 40.7128, lng: -74.006 }, { lat: 51.5074, lng: -0.1278 })).toBeCloseTo(5570, -1);
  });
  it('collects US airports from nearby airports; year-round wins over seasonal', () => {
    const f = flightsFor(city('PT', 38.7223, -9.1393), file)!;
    expect(f.yearRound).toEqual(['JFK']);
    expect(f.seasonal).toEqual(['PHL']);
    expect(f.via).toEqual([{ airport: 'Lisbon Airport', km: 6 }]);
  });
  it('domestic US airports near a border city do not count (Windsor ↔ Detroit)', () => {
    expect(flightsFor(city('CA', 42.3149, -83.0364), file)).toEqual({ yearRound: [], seasonal: [], via: [] });
  });
  it('ignores airports beyond the radius and skips cities in the US', () => {
    expect(flightsFor(city('PT', 41.15, -8.61), file)).toEqual({ yearRound: [], seasonal: [], via: [] }); // Porto: ~280 km away
    expect(flightsFor(city('US', 40.71, -74.0), file)).toBeUndefined();
    expect(flightsFor(city('PR', 18.4, -66.0), file)).toBeUndefined();
  });
});
