<script lang="ts">
  import { app, cities, flagEmoji, fmtUsd, fmtCompact, COLUMNS, DEFAULT_COLUMNS } from '../state.svelte.ts';
  import type { CityResult, ColumnId, SortKey } from '../state.svelte.ts';
  import type { CityRecord } from '../types.ts';
  import { TIERS, localReference, tierSpend } from '../math/tiers.ts';
  import { CLASS_COLORS } from '../math/color.ts';

  const PAGE = 80;
  let limit = $state(PAGE);
  let query = $state('');
  let pickerOpen = $state(false);

  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /** Sort value per column; null always sorts last. Second element: natural direction is descending. */
  const value: Record<ColumnId, [(c: CityRecord, r: CityResult) => number | null, boolean]> = {
    at: [(_c, r) => r.ratioAt, true],
    t1: [(_c, r) => r.years[1], false],
    t2: [(_c, r) => r.years[2], false],
    t3: [(_c, r) => r.years[3], false],
    t4: [(_c, r) => r.years[4], false],
    t5: [(_c, r) => r.years[5], false],
    qol: [(c) => c.qol?.index ?? null, true],
    safety: [(c) => c.qol?.safety ?? null, true],
    healthCare: [(c) => c.qol?.healthCare ?? null, true],
    pollution: [(c) => c.qol?.pollution ?? null, false],
    climate: [(c) => c.qol?.climate ?? null, true],
    salary: [(c) => localReference(c), false],
    pop: [(c) => c.pop ?? null, true],
  };

  const visibleCols = $derived(COLUMNS.filter((c) => app.columns.includes(c.id)));

  const rows = $derived.by(() => {
    const q = fold(query.trim());
    const res = app.results;
    const list = cities.filter((c) => res.get(c.id)!.visible && (!q || fold(`${c.name} ${c.admin ?? ''} ${c.country}`).includes(q)));
    const key: SortKey = app.sort;
    if (key === 'name') return list.sort((a, b) => a.name.localeCompare(b.name) * (app.sortDesc ? -1 : 1));
    const [get, naturalDesc] =
      key === 'best' ? (app.mode === 'when' ? value[`t${app.targetTier}` as ColumnId] : value.at) : value[key];
    const dir = (naturalDesc ? -1 : 1) * (app.sortDesc ? -1 : 1);
    return list.sort((a, b) => {
      const va = get(a, res.get(a.id)!);
      const vb = get(b, res.get(b.id)!);
      if (va === vb) return res.get(b.id)!.ratioAt - res.get(a.id)!.ratioAt;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va - vb) * dir;
    });
  });

  $effect(() => {
    void rows;
    limit = PAGE; // new sort/filter: back to the top
  });

  function sortBy(key: SortKey) {
    if (app.sort === key) app.sortDesc = !app.sortDesc;
    else {
      app.sort = key;
      app.sortDesc = false;
    }
  }

  function toggleCol(id: ColumnId) {
    app.columns = app.columns.includes(id) ? app.columns.filter((c) => c !== id) : COLUMNS.map((c) => c.id).filter((c) => c === id || app.columns.includes(c));
  }

  const arrow = (key: SortKey) => (app.sort === key ? (app.sortDesc ? ' ↑' : ' ↓') : '');
  const tierCol = (id: ColumnId) => /^t\d$/.test(id);
</script>

<div class="flex h-full flex-col">
  <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
    <input
      type="search"
      placeholder="Find a city or country"
      aria-label="Find a city or country"
      class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
      bind:value={query}
    />
    <span class="text-xs tabular-nums text-slate-500">{rows.length} cities</span>
    <div class="relative">
      <button
        class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        aria-expanded={pickerOpen}
        onclick={() => (pickerOpen = !pickerOpen)}>Columns ▾</button
      >
      {#if pickerOpen}
        <div class="absolute right-0 z-30 mt-1 w-56 space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg">
          {#each COLUMNS as c (c.id)}
            <label class="flex cursor-pointer items-center gap-2 text-slate-700">
              <input type="checkbox" class="accent-blue-600" checked={app.columns.includes(c.id)} onchange={() => toggleCol(c.id)} />
              {#if tierCol(c.id)}
                <span class="inline-block h-2.5 w-2.5 rounded-full" style="background: {CLASS_COLORS[Number(c.id[1])]}"></span>
              {/if}
              {c.id === 'at' ? `At ${app.retireAge}` : c.label}
            </label>
          {/each}
          <div class="flex justify-between border-t border-slate-100 pt-2">
            <button class="text-blue-600 hover:underline" onclick={() => (app.columns = [...DEFAULT_COLUMNS])}>Default</button>
            <button class="text-slate-500 hover:underline" onclick={() => (pickerOpen = false)}>Done</button>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="flex-1 overflow-auto">
    <table class="w-full min-w-max text-sm">
      <thead class="sticky top-0 z-[2] bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
        <tr>
          <th class="sticky left-0 z-[3] bg-slate-50 px-4 py-2 font-medium">
            <button class="uppercase hover:text-slate-900" onclick={() => sortBy('name')}>City{arrow('name')}</button>
          </th>
          {#each visibleCols as col (col.id)}
            <th class="px-2 py-2 font-medium {tierCol(col.id) || col.id === 'at' ? '' : 'text-right'}">
              <button class="inline-flex items-center gap-1 uppercase hover:text-slate-900" onclick={() => sortBy(col.id)} title="Sort by {col.label}">
                {#if tierCol(col.id)}
                  <span class="inline-block h-2 w-2 rounded-full" style="background: {CLASS_COLORS[Number(col.id[1])]}"></span>
                {/if}
                {col.id === 'at' ? `At ${app.retireAge}` : (col.short ?? col.label)}{arrow(col.id)}
              </button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        {#each rows.slice(0, limit) as c (c.id)}
          {@const r = app.results.get(c.id)!}
          {@const selected = app.selectedCityId === c.id}
          <tr class="group cursor-pointer {selected ? 'bg-blue-50' : 'hover:bg-slate-50'}" onclick={() => (app.selectedCityId = c.id)}>
            <td class="sticky left-0 z-[1] px-4 py-2 {selected ? 'bg-blue-50' : 'bg-white group-hover:bg-slate-50'}">
              <div class="font-medium leading-tight text-slate-900">{flagEmoji(c.iso2)} {c.name}</div>
              <div class="text-[11px] text-slate-500">{c.admin ? `${c.admin}, ` : ''}{c.country}</div>
            </td>
            {#each visibleCols as col (col.id)}
              {#if col.id === 'at'}
                <td class="px-2 py-2">
                  <div class="flex items-center gap-1.5 whitespace-nowrap leading-tight text-slate-800">
                    <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style="background: {CLASS_COLORS[r.tierAt]}"></span>
                    {TIERS[r.tierAt].label}
                  </div>
                  <div class="pl-4 text-[11px] tabular-nums text-slate-500">{fmtUsd(r.spendAt)}/mo</div>
                </td>
              {:else if tierCol(col.id)}
                {@const t = Number(col.id[1])}
                {@const y = r.years[t]}
                {@const onPlan = y !== null && app.age + y <= app.retireAge}
                <td class="whitespace-nowrap px-2 py-2 tabular-nums" title="{TIERS[t].label}: {fmtUsd(tierSpend(t, localReference(c), app.household))}/mo">
                  {#if y === null}
                    <span class="text-slate-300">—</span>
                  {:else}
                    <span class={onPlan ? 'font-semibold text-slate-900' : 'text-slate-500'}>{y === 0 ? 'now' : app.age + y}</span>
                  {/if}
                </td>
              {:else}
                {@const v = value[col.id][0](c, r)}
                <td class="whitespace-nowrap px-2 py-2 text-right tabular-nums text-slate-600">
                  {#if v === null}
                    <span class="text-slate-300">—</span>
                  {:else if col.id === 'salary'}
                    {fmtUsd(v)}
                  {:else if col.id === 'pop'}
                    {fmtCompact(v)}
                  {:else}
                    {Math.round(v)}
                  {/if}
                </td>
              {/if}
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    {#if rows.length === 0}
      <p class="p-6 text-center text-sm text-slate-500">No cities match these filters.</p>
    {:else if rows.length > limit}
      <div class="p-4 text-center">
        <button class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50" onclick={() => (limit += PAGE * 2)}>
          Show more ({rows.length - limit} left)
        </button>
      </div>
    {/if}
    <p class="px-4 pb-4 pt-2 text-[11px] text-slate-400">
      Tier columns show the age you could retire there at that level; <b class="text-slate-700">bold</b> = by your planned age
      {app.retireAge}. Hover for the monthly budget.
    </p>
  </div>
</div>
