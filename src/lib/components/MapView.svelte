<script lang="ts">
  import { onMount } from 'svelte';
  import type maplibregl from 'maplibre-gl';
  import { app, cities } from '../state.svelte.ts';

  type MapSetup = typeof import('../map/mapSetup.ts');

  let container: HTMLDivElement;
  let map: maplibregl.Map | null = $state.raw(null);
  let setup: MapSetup | null = null;
  let layerReady = $state(false);

  // MapLibre is most of the bundle and its WebGL setup is the slowest part of
  // startup, so it loads as its own chunk after the rest of the page paints.
  onMount(() => {
    let removed = false;
    import('../map/mapSetup.ts').then((s) => {
      if (removed) return;
      setup = s;
      init(s);
    });
    return () => {
      removed = true;
      map?.remove();
    };
  });

  function init({ createMap, addCityLayer, buildGeoJSON, LAYER_ID }: MapSetup) {
    const m = createMap(container);
    m.on('load', () => {
      m.resize(); // in case the container was mid-layout at construction
      addCityLayer(m, buildGeoJSON(cities));
      layerReady = true;
    });
    // Filtered-out dots are transparent but still in the layer; skip them.
    const hit = (e: maplibregl.MapLayerMouseEvent) =>
      e.features?.map((f) => f.properties?.cityId as string).find((id) => app.results.get(id)?.visible);
    // MapLibre only fires 'click' for real clicks, not drags, so panning keeps the card open.
    m.on('click', (e) => {
      const ids = m.queryRenderedFeatures(e.point, { layers: [LAYER_ID] }).map((f) => f.properties?.cityId as string);
      const cityId = ids.find((id) => app.results.get(id)?.visible);
      app.selectedCityId = cityId && cityId !== app.selectedCityId ? cityId : null;
    });
    m.on('mousemove', LAYER_ID, (e) => (m.getCanvas().style.cursor = hit(e) ? 'pointer' : ''));
    m.on('mouseleave', LAYER_ID, () => (m.getCanvas().style.cursor = ''));
    map = m;
  }

  // Recolor via feature-state whenever inputs change; rAF-coalesced so slider
  // drags push at most one sync per frame.
  let rafId = 0;
  $effect(() => {
    const results = app.results;
    const selected = app.selectedCityId;
    if (!map || !setup || !layerReady) return;
    const m = map;
    const { syncFeatureStates } = setup;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => syncFeatureStates(m, cities, results, selected));
    return () => cancelAnimationFrame(rafId);
  });
</script>

<div class="absolute inset-0">
  <div bind:this={container} class="h-full w-full"></div>
</div>
