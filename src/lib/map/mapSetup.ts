// MapLibre setup kept out of Svelte: static layers whose colors are driven
// entirely through feature-state, so input changes never touch the style.
import maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { CityRecord } from '../types.ts';
import { CLASS_COLORS } from '../math/color.ts';
import type { CityResult } from '../state.svelte.ts';

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
        'match',
        ['coalesce', ['feature-state', 'cls'], 0],
        1, CLASS_COLORS[1],
        2, CLASS_COLORS[2],
        3, CLASS_COLORS[3],
        4, CLASS_COLORS[4],
        5, CLASS_COLORS[5],
        CLASS_COLORS[0],
      ],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3.5, 4, 6.5, 8, 11],
      'circle-opacity': [
        'case',
        ['!', ['boolean', ['feature-state', 'visible'], true]], 0.12,
        ['==', ['coalesce', ['feature-state', 'cls'], 0], 0], 0.55,
        0.92,
      ],
      // A surface ring keeps overlapping dots separable.
      'circle-stroke-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false], '#111827',
        '#ffffff',
      ],
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0.8],
      'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'visible'], true], 1, 0.15],
    },
  });
}

/** Push per-city color state; ~550 setFeatureState calls, sub-ms each. */
export function syncFeatureStates(
  map: maplibregl.Map,
  cities: CityRecord[],
  results: Map<string, CityResult>,
  selectedCityId: string | null,
): void {
  cities.forEach((c, i) => {
    const r = results.get(c.id);
    map.setFeatureState(
      { source: SOURCE_ID, id: i },
      { cls: r?.cls ?? 0, visible: r?.visible ?? true, selected: c.id === selectedCityId },
    );
  });
}
