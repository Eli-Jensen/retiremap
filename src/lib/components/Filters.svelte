<script lang="ts">
  import { app, cities, places, placeById, flagEmoji } from '../state.svelte.ts';
  import type { Place } from '../types.ts';
  import { TIERS } from '../math/tiers.ts';

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

  const rated = cities.filter((c) => c.qol).length;
  const sliders = [
    { label: 'Quality of life', get: () => app.minQol, set: (v: number) => (app.minQol = v), max: 200, step: 10, hint: 'New York 136 · Lisbon 156 · Vienna 207' },
    { label: 'Safety', get: () => app.minSafety, set: (v: number) => (app.minSafety = v), max: 90, step: 5, hint: '' },
    { label: 'Health care', get: () => app.minHealthCare, set: (v: number) => (app.minHealthCare = v), max: 90, step: 5, hint: '' },
    { label: 'Climate', get: () => app.minClimate, set: (v: number) => (app.minClimate = v), max: 100, step: 5, hint: '' },
  ];
  const POPS = [
    { v: 0, label: 'Any size' },
    { v: 100_000, label: '100k+' },
    { v: 500_000, label: '500k+' },
    { v: 1_000_000, label: '1M+' },
  ];
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

  <details class="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2" open={app.filtersActive > app.only.length + app.never.length}>
    <summary class="cursor-pointer select-none text-xs font-medium text-slate-600">
      More filters <span class="font-normal text-slate-400">· quality of life, safety, climate, size</span>
    </summary>
    <div class="mt-3 space-y-3 text-xs text-slate-600">
      {#each sliders as sl (sl.label)}
        <label class="block space-y-1">
          <span class="flex justify-between"><span>{sl.label} at least</span><b class="tabular-nums">{sl.get() === 0 ? 'any' : sl.get()}</b></span>
          <input type="range" min="0" max={sl.max} step={sl.step} class="w-full accent-blue-600" value={sl.get()} oninput={(e) => sl.set(Number(e.currentTarget.value))} />
          {#if sl.hint}<span class="block text-[11px] text-slate-400">{sl.hint}</span>{/if}
        </label>
      {/each}
      <label class="block space-y-1">
        <span class="flex justify-between"><span>Pollution at most</span><b class="tabular-nums">{app.maxPollution >= 100 ? 'any' : app.maxPollution}</b></span>
        <input type="range" min="10" max="100" step="5" class="w-full accent-blue-600" bind:value={app.maxPollution} />
      </label>
      <p class="text-[11px] text-slate-400">
        Numbeo indexes; {cities.length - rated} of {cities.length} cities aren't rated and drop out once any of these is set.
      </p>
      <div class="flex items-center justify-between gap-2">
        <span>City size</span>
        <div class="flex rounded-md border border-slate-300 bg-white p-0.5">
          {#each POPS as p (p.v)}
            <button class="rounded px-1.5 py-0.5 text-[11px] {app.minPop === p.v ? 'bg-slate-800 text-white' : 'text-slate-600'}" onclick={() => (app.minPop = p.v)}>{p.label}</button>
          {/each}
        </div>
      </div>
      <label class="flex items-center justify-between gap-2">
        <span>At {app.retireAge}, I'd live at least</span>
        <select class="rounded-md border border-slate-300 bg-white px-2 py-1" value={String(app.minTierAt)} onchange={(e) => (app.minTierAt = Number(e.currentTarget.value))}>
          <option value="0">anything</option>
          {#each TIERS.slice(1) as t, i (t.id)}
            <option value={String(i + 1)}>{t.label.toLowerCase()}</option>
          {/each}
        </select>
      </label>
    </div>
  </details>
</section>
