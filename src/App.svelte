<script lang="ts">
  import MapView from './lib/components/MapView.svelte';
  import ControlPanel from './lib/components/ControlPanel.svelte';
  import CityDetail from './lib/components/CityDetail.svelte';
  import Legend from './lib/components/Legend.svelte';
  import AboutFooter from './lib/components/AboutFooter.svelte';
</script>

<div class="relative h-full w-full overflow-hidden">
  <MapView />
  <div class="pointer-events-none absolute left-4 top-4 z-10">
    <ControlPanel />
  </div>
  <div class="pointer-events-none absolute inset-x-4 bottom-28 z-10 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4">
    <CityDetail />
  </div>
  <div class="pointer-events-none absolute bottom-8 left-4 z-10">
    <Legend />
  </div>
  <div class="pointer-events-none absolute bottom-8 left-72 z-10 ml-4 hidden sm:block">
    <AboutFooter />
  </div>
</div>
