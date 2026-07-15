<script lang="ts">
  import { meta, deciles } from '../state.svelte.ts';
  let open = $state(false);
</script>

<div class="pointer-events-auto">
  {#if open}
    <div class="mb-2 w-80 max-w-[calc(100vw-2rem)] space-y-2 rounded-xl border border-slate-200 bg-white/95 p-4 text-xs leading-relaxed text-slate-600 shadow-xl backdrop-blur">
      <h3 class="font-bold text-slate-900">About the data</h3>
      <p>
        Cost-of-living indexes are a {meta.snapshotDate} snapshot of crowd-sourced data from
        <a class="text-blue-600 underline" href="https://www.numbeo.com/cost-of-living/" target="_blank" rel="noreferrer">Numbeo.com</a>
        ({meta.cityCount} cities, New York = 100). City coordinates from
        <a class="text-blue-600 underline" href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>
        (CC BY 4.0). Basemap tiles by
        <a class="text-blue-600 underline" href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>,
        © OpenMapTiles, data from OpenStreetMap.
      </p>
      <p>
        The spending percentile interpolates mean annual expenditures by income decile from the
        {deciles.year} BLS Consumer Expenditure Survey. Caveats: deciles are ranked by <i>income</i>, not
        spending; figures are household means, not medians or per-person; your actual rent share may differ
        from Numbeo's basket weighting.
      </p>
      <p>
        The withdrawal-rate rule (the "4% rule") is a historical heuristic, not financial advice. Taxes,
        healthcare, visas, and exchange-rate swings are all on you.
      </p>
    </div>
  {/if}
  <button
    class="rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-lg backdrop-blur hover:text-slate-900"
    onclick={() => (open = !open)}>{open ? 'Close' : 'ⓘ About & data'}</button
  >
</div>
