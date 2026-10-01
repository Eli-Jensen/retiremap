<script lang="ts">
  import { onMount } from 'svelte';
  import MapView from './lib/components/MapView.svelte';
  import CityList from './lib/components/CityList.svelte';
  import CityDetail from './lib/components/CityDetail.svelte';
  import Legend from './lib/components/Legend.svelte';
  import InputsPanel from './lib/components/InputsPanel.svelte';
  import Filters from './lib/components/Filters.svelte';
  import ModeBar from './lib/components/ModeBar.svelte';
  import Methods from './lib/components/Methods.svelte';
  import { app, readHash, writeHash, fmtUsdCompact } from './lib/state.svelte.ts';

  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
  app.tab = wide ? 'map' : 'list';
  if (typeof window !== 'undefined') readHash(window.location.hash);

  // Phones start with the inputs collapsed to a one-line summary.
  let inputsOpen = $state(wide);

  // Mirror inputs to the URL so a plan can be shared. Throttled: Safari
  // rejects more than ~100 replaceState calls per 30 s, and sliders fire a lot.
  let pending = 0;
  $effect(() => {
    const hash = writeHash();
    clearTimeout(pending);
    pending = window.setTimeout(() => {
      if (hash !== window.location.hash) history.replaceState(null, '', hash || window.location.pathname);
    }, 250);
  });

  onMount(() => {
    const onHash = () => readHash(window.location.hash);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !app.methodsOpen) app.selectedCityId = null;
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="flex h-dvh flex-col bg-slate-50 text-slate-900 lg:flex-row">
  <aside class="flex shrink-0 flex-col border-b border-slate-200 bg-white lg:w-[23rem] lg:border-b-0 lg:border-r">
    <header class="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
      <div>
        <h1 class="text-lg font-bold tracking-tight">RetireMap</h1>
        <p class="text-xs text-slate-500">Where — and when — could you retire?</p>
      </div>
      <button
        class="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        onclick={() => (app.methodsOpen = true)}>How this works</button
      >
    </header>

    <button
      class="mx-4 mb-2 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 lg:hidden"
      aria-expanded={inputsOpen}
      onclick={() => (inputsOpen = !inputsOpen)}
    >
      <span>
        Age {app.age} · {app.household} · {fmtUsdCompact(app.portfolio)} saved · +{fmtUsdCompact(app.annualSavings)}/yr
      </span>
      <span class="font-medium text-blue-600">{inputsOpen ? 'Done' : 'Edit'}</span>
    </button>

    <div class="{inputsOpen ? 'block' : 'hidden'} max-h-[55dvh] space-y-5 overflow-y-auto px-4 pb-4 lg:block lg:max-h-none lg:flex-1">
      <InputsPanel />
      <Filters />
    </div>
  </aside>

  <main class="flex min-h-0 flex-1 flex-col">
    <div class="space-y-2 border-b border-slate-200 bg-white px-4 py-3">
      <ModeBar />
      <div class="flex rounded-lg border border-slate-200 p-0.5 sm:inline-flex" role="tablist" aria-label="View">
        {#each ['map', 'list'] as const as t (t)}
          <button
            role="tab"
            aria-selected={app.tab === t}
            class="flex-1 rounded-md px-4 py-1 text-xs font-medium capitalize sm:flex-none {app.tab === t
              ? 'bg-slate-800 text-white'
              : 'text-slate-600 hover:bg-slate-100'}"
            onclick={() => (app.tab = t)}>{t}</button
          >
        {/each}
      </div>
    </div>

    <div class="relative min-h-0 flex-1">
      <!-- Kept mounted while hidden so the map isn't rebuilt on every tab switch. -->
      <div class="absolute inset-0 {app.tab === 'map' ? '' : 'invisible'}">
        <MapView />
        <div class="pointer-events-none absolute bottom-8 left-3 z-10 max-w-[calc(100%-4rem)]">
          <Legend />
        </div>
      </div>
      {#if app.tab === 'list'}
        <div class="absolute inset-0 bg-white">
          <CityList />
        </div>
      {/if}
      <div class="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex justify-end sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4">
        <CityDetail />
      </div>
    </div>
  </main>
</div>

<Methods />
