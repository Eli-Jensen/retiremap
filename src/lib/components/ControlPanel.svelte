<script lang="ts">
  import { app, fmtPercentile, fmtUsd } from '../state.svelte.ts';
  import CityAutocomplete from './CityAutocomplete.svelte';

  const views = [
    { key: 'monthly', label: 'Monthly cost' },
    { key: 'portfolio', label: 'Portfolio needed' },
    { key: 'reverse', label: 'What I can afford' },
  ] as const;
</script>

<div class="pointer-events-auto w-80 max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
  <div>
    <h1 class="text-lg font-bold tracking-tight text-slate-900">RetireMap</h1>
    <p class="text-xs text-slate-500">What it takes to retire at your standard of living, everywhere.</p>
  </div>

  <div class="space-y-1">
    <label class="text-xs font-medium text-slate-600" for="home-city">Home city</label>
    <CityAutocomplete selectedId={app.homeCityId} onSelect={(id) => (app.homeCityId = id)} />
    {#if !app.homeCity}
      <p class="text-[11px] text-slate-400">No city picked — comparing against the US urban average.</p>
    {/if}
  </div>

  <div class="flex gap-2">
    <div class="flex-1 space-y-1">
      <label class="text-xs font-medium text-slate-600" for="spend">Spending / month</label>
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
        <input
          id="spend"
          type="number"
          min="500"
          step="100"
          bind:value={app.monthlySpend}
          class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-7 pr-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
    </div>
    {#if app.view !== 'monthly'}
      <div class="w-28 space-y-1">
        <label class="text-xs font-medium text-slate-600" for="swr" title="Safe withdrawal rate">Withdraw %</label>
        <div class="flex items-center gap-1 pt-1">
          <input id="swr" type="range" min="2.5" max="5" step="0.25" class="w-full accent-blue-600"
            value={app.swr * 100}
            oninput={(e) => (app.swr = Number(e.currentTarget.value) / 100)} />
          <span class="w-10 text-right text-xs tabular-nums text-slate-700">{(app.swr * 100).toFixed(2)}%</span>
        </div>
      </div>
    {/if}
  </div>

  <div class="space-y-1 rounded-lg bg-slate-50 p-2">
    <div class="flex items-baseline justify-between">
      <span class="text-xs font-medium text-slate-600">Standard of living</span>
      <span class="text-xs text-slate-700"><b>{fmtPercentile(app.userPercentile)}</b> percentile of US households*</span>
    </div>
    <input
      type="range"
      min="2"
      max="98"
      step="1"
      class="w-full accent-blue-600"
      value={Math.round(app.userPercentile)}
      oninput={(e) => app.setPercentile(Number(e.currentTarget.value))}
    />
    <p class="text-[11px] leading-snug text-slate-400">*cost-adjusted: what your budget buys at US-average prices</p>
  </div>

  <div class="flex rounded-lg border border-slate-200 p-0.5">
    {#each views as v (v.key)}
      <button
        class="flex-1 rounded-md px-1 py-1.5 text-[11px] font-medium transition-colors {app.view === v.key
          ? 'bg-blue-600 text-white'
          : 'text-slate-600 hover:bg-slate-100'}"
        onclick={() => (app.view = v.key)}>{v.label}</button
      >
    {/each}
  </div>

  {#if app.view === 'reverse'}
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600" for="portfolio">My (theoretical) portfolio</label>
      <div class="relative">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
        <input
          id="portfolio"
          type="number"
          min="0"
          step="50000"
          bind:value={app.portfolio}
          class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-7 pr-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      <p class="text-[11px] text-slate-500">
        Withdraws {fmtUsd(app.withdrawal)}/mo at {(app.swr * 100).toFixed(2)}% — green cities sustain your current lifestyle.
      </p>
    </div>
  {/if}

  <label class="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
    <input type="checkbox" bind:checked={app.useRent} class="accent-blue-600" />
    Include rent in the comparison <span class="text-slate-400">(off = you'll own outright)</span>
  </label>
</div>
