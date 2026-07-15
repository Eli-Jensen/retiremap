// MapLibre setup kept out of Svelte: static layers whose colors are driven
// entirely through feature-state, so input changes never touch the style.
import maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { CityRecord } from '../types.ts';
import { RAMP } from '../math/color.ts';
import type { CityValue } from '../state.svelte.ts';

export const SOURCE_ID = 'cities';
export const LAYER_ID = 'city-dots';

export function createMap(container: HTMLElement): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: 'https://tiles.openfreemap.org/styles/positron',
    center: [10, 30],
    zoom: 1.25,
    minZoom: 0.8,
    attributionControl: { compact: false },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__map = map;
    map.on('error', (e) => console.error('[maplibre]', e.error));
  }
  return map;
}

export function buildGeoJSON(cities: CityRecord[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cities.map((c, i) => ({
      type: 'Feature',
      id: i, // integer ids required for feature-state
      properties: { cityId: c.id },
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
    })),
  };
}

export function addCityLayer(map: maplibregl.Map, geojson: FeatureCollection): void {
  map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
  map.addLayer({
    id: LAYER_ID,
    type: 'circle',
    source: SOURCE_ID,
    paint: {
      'circle-color': [
        'interpolate',
        ['linear'],
        ['coalesce', ['feature-state', 't'], 0],
        -1, RAMP[0],
        -0.5, RAMP[1],
        0, RAMP[2],
        0.5, RAMP[3],
        1, RAMP[4],
      ],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3.5, 4, 6.5, 8, 11],
      'circle-opacity': 0.9,
      'circle-stroke-color': [
        'case',
        ['boolean', ['feature-state', 'home'], false], '#2563eb',
        ['boolean', ['feature-state', 'selected'], false], '#111827',
        'rgba(30, 41, 59, 0.35)',
      ],
      'circle-stroke-width': [
        'case',
        ['boolean', ['feature-state', 'home'], false], 3,
        ['boolean', ['feature-state', 'selected'], false], 2.5,
        0.6,
      ],
    },
  });
}

/** Push per-city color state; ~550 setFeatureState calls, sub-ms each. */
export function syncFeatureStates(
  map: maplibregl.Map,
  cities: CityRecord[],
  values: Map<string, CityValue>,
  homeCityId: string | null,
  selectedCityId: string | null,
): void {
  cities.forEach((c, i) => {
    map.setFeatureState(
      { source: SOURCE_ID, id: i },
      {
        t: values.get(c.id)?.t ?? 0,
        home: c.id === homeCityId,
        selected: c.id === selectedCityId,
      },
    );
  });
}
