<script lang="ts">
  import { app, cityLabel, flagEmoji, fmtUsd, fmtUsdCompact, fmtPercentile } from '../state.svelte.ts';

  const city = $derived(app.selectedCity);
  const value = $derived(city ? app.cityValues.get(city.id) : undefined);
  const vsHome = $derived(city ? (city[app.indexKind] / app.homeIdx) : 1);
</script>

{#if city && value}
  <div class="pointer-events-auto w-72 max-w-[calc(100vw-2rem)] space-y-2 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
    <div class="flex items-start justify-between gap-2">
      <div>
        <h2 class="font-bold leading-tight text-slate-900">{flagEmoji(city.iso2)} {cityLabel(city)}</h2>
        <p class="text-[11px] text-slate-500">
          {vsHome > 1.02 ? `${Math.round((vsHome - 1) * 100)}% pricier than` : vsHome < 0.98 ? `${Math.round((1 - vsHome) * 100)}% cheaper than` : 'About the same as'}
          {app.homeCity ? 'home' : 'the US average'}
        </p>
      </div>
      <button class="text-slate-400 hover:text-slate-700" onclick={() => (app.selectedCityId = null)}>✕</button>
    </div>

    <div class="space-y-1.5 rounded-lg bg-slate-50 p-2.5 text-sm">
      <div class="flex justify-between">
        <span class="text-slate-600">Your lifestyle costs</span>
        <b class="tabular-nums">{fmtUsd(value.required)}/mo</b>
      </div>
      <div class="flex justify-between">
        <span class="text-slate-600">Portfolio needed ({(app.swr * 100).toFixed(2)}%)</span>
        <b class="tabular-nums">{fmtUsdCompact(value.portfolio)}</b>
      </div>
      {#if app.view === 'reverse'}
        <div class="flex justify-between border-t border-slate-200 pt-1.5">
          <span class="text-slate-600">{fmtUsdCompact(app.portfolio)} buys</span>
          <b class="tabular-nums">{fmtPercentile(value.percentile)} pctile life</b>
        </div>
        <div class="text-center">
          {#if value.affordable}
            <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">✓ You could retire here now</span>
          {:else}
            <span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Short {fmtUsd(value.required - app.withdrawal)}/mo</span>
          {/if}
        </div>
      {/if}
    </div>

    <details class="text-xs text-slate-600">
      <summary class="cursor-pointer select-none text-slate-500 hover:text-slate-700">Numbeo indexes (NYC = 100)</summary>
      <div class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
        <span>Cost of living</span><b class="text-right">{city.col}</b>
        <span>Rent</span><b class="text-right">{city.rent}</b>
        <span>COL + rent</span><b class="text-right">{city.colRent}</b>
        <span>Groceries</span><b class="text-right">{city.groceries}</b>
        <span>Restaurants</span><b class="text-right">{city.restaurant}</b>
        <span>Purchasing power</span><b class="text-right">{city.purchasingPower}</b>
      </div>
    </details>

    {#if app.homeCityId !== city.id}
      <button
        class="w-full rounded-lg border border-blue-200 bg-blue-50 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
        onclick={() => (app.homeCityId = city.id)}>Set as my home city</button
      >
    {/if}
  </div>
{/if}
