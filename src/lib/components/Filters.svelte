<script lang="ts">
  import { app, cities, places, placeById, flagEmoji, meta, US_AIRPORTS } from '../state.svelte.ts';
  import type { FlightFilter } from '../state.svelte.ts';
  import type { Place } from '../types.ts';
  import { METRICS, displayRange, toDisplay, fromDisplay, fmtMetric } from '../metrics.ts';
  import type { Metric, Units } from '../metrics.ts';

  let query = $state('');
  let focused = $state(false);
  let highlighted = $state(0);

  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const kindLabel: Record<Place['kind'], string> = { continent: 'continent', subregion: 'region', group: 'group', country: 'country' };
  const QUICK = ['europe', 'southeast-asia', 'latin-america-and-caribbean', 'south-america', 'eu', 'c-us'];
  const quick = QUICK.map((id) => placeById.get(id)).filter((p): p is Place => !!p);
  const isoOf = (p: Place) => (p.kind === 'country' ? p.id.slice(2).toUpperCase() : '');

  const matches = $derived.by(() => {
    const q = fold(query.trim());
    if (!q) return [];
    return places
      .filter((p) => fold(p.label).includes(q))
      .sort((a, b) => Number(!fold(a.label).startsWith(q)) - Number(!fold(b.label).startsWith(q)))
      .slice(0, 8);
  });

  function choose(p: Place, list: 'only' | 'never') {
    app.setPlace(p.id, list);
    query = '';
    highlighted = 0;
  }

  function onKeydown(e: KeyboardEvent) {
    if (matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlighted = (highlighted + 1) % matches.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlighted = (highlighted - 1 + matches.length) % matches.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(matches[highlighted], e.shiftKey ? 'never' : 'only');
    } else if (e.key === 'Escape') query = '';
  }

  // Index sliders: the "any" end is the worst value, so dragging toward better tightens the filter.
  const sliderMetrics = METRICS.filter((m) => m.id !== 'pop');
  const GROUP_ORDER = ['Livability', 'Climate', 'Prices (New York = 100)'] as const;
  const groups = GROUP_ORDER.map((g) => ({ name: g, metrics: sliderMetrics.filter((m) => m.group === g) }));
  const coverage = Object.fromEntries(METRICS.map((m) => [m.id, cities.filter((c) => m.get(c) !== null).length]));
  // Sliders work in display units (°F/in or °C/mm); limits are stored in metric units.
  const range = (m: Metric) => displayRange(m, app.units);
  const anyEnd = (m: Metric) => (m.higherIsBetter ? range(m)[0] : range(m)[1]);
  const sliderValue = (m: Metric) => {
    const l = app.metricLimits[m.id];
    return l === undefined ? anyEnd(m) : Math.round(toDisplay(m, l, app.units) / range(m)[2]) * range(m)[2];
  };
  function onSlide(m: Metric, v: number) {
    app.setLimit(m.id, v === anyEnd(m) ? null : Math.round(fromDisplay(m, v, app.units) * 100) / 100);
  }
  const POPS = [
    { v: 0, label: 'Any size' },
    { v: 100_000, label: '100k+' },
    { v: 500_000, label: '500k+' },
    { v: 1_000_000, label: '1M+' },
  ];
  const limitCount = $derived(Object.keys(app.metricLimits).length);
  const chip = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs';
</script>

<section class="space-y-3">
  <div class="flex items-baseline justify-between">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Where</h2>
    {#if app.filtersActive > 0}
      <button class="text-[11px] text-blue-600 hover:underline" onclick={() => app.clearFilters()}>Clear all filters ({app.filtersActive})</button>
    {/if}
  </div>

  <div class="relative">
    <input
      type="search"
      placeholder="Continent, region, or country…"
      aria-label="Filter by place"
      autocomplete="off"
      class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      bind:value={query}
      onfocus={() => (focused = true)}
      onblur={() => setTimeout(() => (focused = false), 150)}
      onkeydown={onKeydown}
    />
    {#if focused && matches.length > 0}
      <ul class="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg" role="listbox">
        {#each matches as p, i (p.id)}
          <li class="flex items-center gap-2 px-3 py-1.5 text-sm {i === highlighted ? 'bg-blue-50' : ''}" role="option" aria-selected={i === highlighted}>
            <span class="min-w-0 flex-1 truncate">
              {flagEmoji(isoOf(p))} {p.label}
              <span class="text-[11px] text-slate-400">{kindLabel[p.kind]} · {p.count}</span>
            </span>
            <button class="rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700" onmousedown={(e) => e.preventDefault()} onclick={() => choose(p, 'only')}>Only</button>
            <button class="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100" onmousedown={(e) => e.preventDefault()} onclick={() => choose(p, 'never')}>Never</button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if app.only.length > 0}
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-[11px] font-medium text-slate-500">Only in</span>
      {#each app.only as id (id)}
        {@const p = placeById.get(id)!}
        <span class="{chip} border-blue-200 bg-blue-50 text-blue-800">
          {flagEmoji(isoOf(p))} {p.label}
          <button class="text-blue-400 hover:text-blue-800" aria-label="Remove {p.label}" onclick={() => app.setPlace(id, null)}>✕</button>
        </span>
      {/each}
    </div>
  {/if}
  {#if app.never.length > 0}
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-[11px] font-medium text-slate-500">Never in</span>
      {#each app.never as id (id)}
        {@const p = placeById.get(id)!}
        <span class="{chip} border-red-200 bg-red-50 text-red-800 line-through decoration-red-300">
          {flagEmoji(isoOf(p))} {p.label}
          <button class="text-red-400 no-underline hover:text-red-800" aria-label="Remove {p.label}" onclick={() => app.setPlace(id, null)}>✕</button>
        </span>
      {/each}
    </div>
  {/if}
  {#if app.only.length === 0}
    <div class="flex flex-wrap gap-1.5">
      {#each quick.filter((p) => !app.never.includes(p.id)) as p (p.id)}
        <button class="{chip} border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50" onclick={() => app.setPlace(p.id, 'only')}>
          {flagEmoji(isoOf(p))} {p.label}
        </button>
      {/each}
    </div>
  {/if}

  <div class="space-y-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
    <div class="flex flex-wrap items-center gap-1.5">
      <span>✈️ Nonstop flights to the US</span>
      <select
        aria-label="Nonstop flights to the US"
        class="rounded-md border px-1.5 py-1 text-xs {app.flights !== 'off' ? 'border-blue-400 bg-blue-50 font-medium text-blue-900' : 'border-slate-300 bg-white'}"
        value={app.flights}
        onchange={(e) => (app.flights = e.currentTarget.value as FlightFilter)}
      >
        <option value="off">don't care</option>
        <option value="any">required (incl. seasonal)</option>
        <option value="yr">required, year-round</option>
      </select>
      {#if app.flights !== 'off'}
        <span>to</span>
        <select
          aria-label="US airport"
          class="max-w-[11rem] rounded-md border border-blue-400 bg-blue-50 px-1.5 py-1 text-xs font-medium text-blue-900"
          value={app.flightTo ?? ''}
          onchange={(e) => (app.flightTo = e.currentTarget.value || null)}
        >
          <option value="">any US airport</option>
          {#each [...US_AIRPORTS].sort((x, y) => x.iata.localeCompare(y.iata)) as a (a.iata)}
            <option value={a.iata}>{a.iata} · {a.name}</option>
          {/each}
        </select>
      {/if}
    </div>
    {#if meta.flights}
      <p class="text-[11px] text-slate-400">
        From an airport within {meta.flights.radiusKm} km to one of {US_AIRPORTS.length} major US airports. Airline route tables on
        Wikipedia, {meta.flights.fetched}. US cities always count.
      </p>
    {/if}
  </div>

  <details class="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2" open={limitCount > 0}>
    <summary class="cursor-pointer select-none text-xs font-medium text-slate-600">
      Livability &amp; price filters
      <span class="font-normal text-slate-400">
        {limitCount > 0 ? `· ${limitCount} on` : '· safety, health care, climate, rent, groceries…'}
      </span>
    </summary>
    <div class="mt-3 space-y-4 text-xs text-slate-600">
      {#each groups as g (g.name)}
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.name}</h3>
            {#if g.name === 'Climate'}
              <div class="flex rounded-md border border-slate-300 bg-white p-0.5" role="radiogroup" aria-label="Units">
                {#each [['us', '°F · in'], ['metric', '°C · mm']] as [u, label] (u)}
                  <button
                    role="radio"
                    aria-checked={app.units === u}
                    class="rounded px-1.5 py-0.5 text-[10px] {app.units === u ? 'bg-slate-800 text-white' : 'text-slate-600'}"
                    onclick={() => (app.units = u as Units)}>{label}</button
                  >
                {/each}
              </div>
            {/if}
          </div>
          {#if g.name === 'Climate' && !meta.climate}
            <p class="text-[11px] text-amber-700">Climate data is still being fetched.</p>
          {/if}
          {#each g.metrics as m (m.id)}
            {@const on = app.metricLimits[m.id] !== undefined}
            <label class="block space-y-1">
              <span class="flex justify-between gap-2">
                <span>{m.label} <span class="text-slate-400">· {coverage[m.id]} cities rated</span></span>
                <b class="tabular-nums {on ? 'text-blue-700' : ''}">{on ? `${m.higherIsBetter ? '≥' : '≤'} ${fmtMetric(m, app.metricLimits[m.id]!, app.units)}` : 'any'}</b>
              </span>
              <input
                type="range"
                min={range(m)[0]}
                max={range(m)[1]}
                step={range(m)[2]}
                class="w-full accent-blue-600 {on ? '' : 'opacity-40'}"
                value={sliderValue(m)}
                oninput={(e) => onSlide(m, Number(e.currentTarget.value))}
              />
              <span class="block text-[11px] text-slate-400">{m.hint}</span>
            </label>
          {/each}
        </div>
      {/each}
      <div class="flex items-center justify-between gap-2">
        <span>City size</span>
        <div class="flex rounded-md border border-slate-300 bg-white p-0.5">
          {#each POPS as p (p.v)}
            <button
              class="rounded px-1.5 py-0.5 text-[11px] {(app.metricLimits.pop ?? 0) === p.v ? 'bg-slate-800 text-white' : 'text-slate-600'}"
              onclick={() => app.setLimit('pop', p.v || null)}>{p.label}</button
            >
          {/each}
        </div>
      </div>
      <p class="text-[11px] text-slate-400">
        Numbeo indexes, crowd-sourced. Cities without a rating drop out once that filter is set. Every index can also be a
        list column (Columns ▾).
      </p>
    </div>
  </details>
</section>
