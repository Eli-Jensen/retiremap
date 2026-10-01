<script lang="ts">
  import { onMount } from 'svelte';
  import type maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { app, cities } from '../state.svelte.ts';
  import { createMap, addCityLayer, buildGeoJSON, syncFeatureStates, LAYER_ID } from '../map/mapSetup.ts';

  let container: HTMLDivElement;
  let map: maplibregl.Map | null = $state.raw(null);
  let layerReady = $state(false);

  onMount(() => {
    const m = createMap(container);
    m.on('load', () => {
      m.resize(); // in case the container was mid-layout at construction
      addCityLayer(m, buildGeoJSON(cities));
      layerReady = true;
    });
    // Filtered-out dots are transparent but still in the layer; skip them.
    const hit = (e: maplibregl.MapLayerMouseEvent) =>
      e.features?.map((f) => f.properties?.cityId as string).find((id) => app.results.get(id)?.visible);
    m.on('click', LAYER_ID, (e) => {
      const cityId = hit(e);
      if (cityId) app.selectedCityId = cityId === app.selectedCityId ? null : cityId;
    });
    m.on('mousemove', LAYER_ID, (e) => (m.getCanvas().style.cursor = hit(e) ? 'pointer' : ''));
    m.on('mouseleave', LAYER_ID, () => (m.getCanvas().style.cursor = ''));
    map = m;
    return () => m.remove();
  });

  // Recolor via feature-state whenever inputs change; rAF-coalesced so slider
  // drags push at most one sync per frame.
  let rafId = 0;
  $effect(() => {
    const results = app.results;
    const selected = app.selectedCityId;
    if (!map || !layerReady) return;
    const m = map;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => syncFeatureStates(m, cities, results, selected));
    return () => cancelAnimationFrame(rafId);
  });
</script>

<div class="absolute inset-0">
  <div bind:this={container} class="h-full w-full"></div>
</div>
