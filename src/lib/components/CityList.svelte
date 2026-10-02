<script lang="ts">
  import { app, cities, flagEmoji, fmtUsd, fmtUsdCompact, fmtCompact, COLUMNS, DEFAULT_COLUMNS } from '../state.svelte.ts';
  import type { CityResult, ColumnId, CostUnit, SortKey } from '../state.svelte.ts';
  import type { CityRecord } from '../types.ts';
  import { TIERS, HOUSEHOLD_SCALE, localReference } from '../math/tiers.ts';
  import { CLASS_COLORS } from '../math/color.ts';

  const PAGE = 80;
  let limit = $state(PAGE);
  let query = $state('');
  let pickerOpen = $state(false);

  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /** Sort value per column; null always sorts last. Second element: natural direction is descending. */
  const value: Record<ColumnId, [(c: CityRecord, r: CityResult) => number | null, boolean]> = {
    now: [(_c, r) => r.spendNow / localReference(_c), true],
    at: [(_c, r) => r.ratioAt, true],
    // Tier columns sort by what the tier costs there: cheapest first.
    t1: [(_c, r) => r.costs[1], false],
    t2: [(_c, r) => r.costs[2], false],
    t3: [(_c, r) => r.costs[3], false],
    t4: [(_c, r) => r.costs[4], false],
    t5: [(_c, r) => r.costs[5], false],
    qol: [(c) => c.qol?.index ?? null, true],
    safety: [(c) => c.qol?.safety ?? null, true],
    healthCare: [(c) => c.qol?.healthCare ?? null, true],
    pollution: [(c) => c.qol?.pollution ?? null, false],
    climate: [(c) => c.qol?.climate ?? null, true],
    salary: [(c) => localReference(c), false],
    pop: [(c) => c.pop ?? null, true],
  };

  // The column you sort by sits right after the city name, shown even if you'd hidden it.
  const visibleCols = $derived.by(() => {
    const cols = COLUMNS.filter((c) => app.columns.includes(c.id));
    const key = app.sort === 'best' ? (app.mode === 'when' ? `t${app.targetTier}` : 'at') : app.sort;
    const sorted = COLUMNS.find((c) => c.id === key);
    return sorted ? [sorted, ...cols.filter((c) => c.id !== sorted.id)] : cols;
  });

  const rows = $derived.by(() => {
    const q = fold(query.trim());
    const res = app.results;
    const list = cities.filter((c) => res.get(c.id)!.visible && (!q || fold(`${c.name} ${c.admin ?? ''} ${c.country}`).includes(q)));
    const key: SortKey = app.sort;
    if (key === 'name') return list.sort((a, b) => a.name.localeCompare(b.name) * (app.sortDesc ? -1 : 1));
    // "Best" = soonest to reach your target tier (when mode), else the richest life at your retirement age.
    const soonest: [(c: CityRecord, r: CityResult) => number | null, boolean] = [(_c, r) => r.years[app.targetTier], false];
    const [get, naturalDesc] = key === 'best' ? (app.mode === 'when' ? soonest : value.at) : value[key];
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

  /** Natural direction per key: true when "best first" means descending values. */
  const naturalDesc = (key: SortKey) => (key === 'best' || key === 'name' ? false : value[key][1]);
  /** Arrow shows the actual order of values: ↓ = highest first. */
  const descending = $derived(naturalDesc(app.sort) !== app.sortDesc);
  const arrow = (key: SortKey) => (app.sort === key && key !== 'best' ? (descending ? ' ↓' : ' ↑') : '');
  const colLabel = (col: { id: ColumnId; label: string; short?: string }) =>
    col.id === 'at' ? `At ${app.retireAge}` : col.id === 'now' ? 'Today' : (col.short ?? col.label);
  const at = $derived(app.atRetirement);
  // Your monthly budget is the same in every city except for the health-insurance schedule (US vs abroad).
  const usCity = cities.find((c) => c.iso2 === 'US')!;
  const abroadCity = cities.find((c) => c.iso2 !== 'US')!;
  const budgetUS = $derived(app.results.get(usCity.id)!.spendAt);
  const budgetAbroad = $derived(app.results.get(abroadCity.id)!.spendAt);
  const when = $derived(app.retireAge === app.age ? 'today' : `at ${app.retireAge}`);
  const unitLabel = $derived(app.costUnit === 'mo' ? '/mo' : app.costUnit === 'yr' ? '/yr' : `saved by ${app.retireAge}`);
  function costText(r: CityResult, t: number): string {
    if (app.costUnit === 'egg') return fmtUsdCompact(r.nestEggs[t]);
    return app.costUnit === 'yr' ? fmtUsdCompact(r.costs[t] * 12) : fmtUsd(r.costs[t]);
  }
  const UNITS: { key: CostUnit; label: string }[] = [
    { key: 'mo', label: '$/mo' },
    { key: 'yr', label: '$/yr' },
    { key: 'egg', label: 'Savings needed' },
  ];
  const sortOptions = $derived([
    { key: 'best' as SortKey, label: app.mode === 'when' ? `Soonest to ${TIERS[app.targetTier].verb}` : `Best at ${app.retireAge}` },
    { key: 'name' as SortKey, label: 'Name' },
    ...COLUMNS.map((c) => ({ key: c.id as SortKey, label: c.id === 'at' ? `Lifestyle at ${app.retireAge}` : c.id === 'now' ? 'Lifestyle today' : /^t\d$/.test(c.id) ? `Cheapest to live ${c.label.toLowerCase()}` : c.label })),
  ]);
  function setSort(key: SortKey) {
    app.sort = key;
    app.sortDesc = false; // each key starts in its natural "best first" order
  }
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
    <div class="flex items-center gap-1">
      <select aria-label="Sort by" class="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs" value={app.sort} onchange={(e) => setSort(e.currentTarget.value as SortKey)}>
        {#each sortOptions as o (o.key)}
          <option value={o.key}>Sort: {o.label}</option>
        {/each}
      </select>
      <button
        class="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        title="Reverse the order"
        aria-label="Reverse sort order"
        onclick={() => (app.sortDesc = !app.sortDesc)}>{app.sort === 'best' ? (app.sortDesc ? 'worst first' : 'best first') : app.sort === 'name' ? (app.sortDesc ? 'Z→A' : 'A→Z') : descending ? 'high → low' : 'low → high'}</button
      >
    </div>
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
              {c.id === 'at' ? `At ${app.retireAge} (your plan)` : c.label}
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

  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
    <span>
      Retiring {when} with {fmtUsdCompact(at.portfolio)}, you could spend
      <b class="text-slate-900">{fmtUsd(budgetAbroad)}/mo</b>
      {#if app.healthOn}plus health insurance{/if} outside the US{#if budgetUS !== budgetAbroad}{' '}({fmtUsd(budgetUS)}/mo in the US, where insurance costs more){/if}.
      <span class="hidden sm:inline">Each tier column shows what that lifestyle costs in the city — <b class="text-slate-800">✓</b> means you can afford it {when}.</span>
    </span>
    <span class="ml-auto flex rounded-md border border-slate-300 bg-white p-0.5" role="radiogroup" aria-label="Show tier costs as">
      {#each UNITS as u (u.key)}
        <button
          role="radio"
          aria-checked={app.costUnit === u.key}
          class="rounded px-2 py-0.5 text-[11px] {app.costUnit === u.key ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}"
          onclick={() => (app.costUnit = u.key)}>{u.label}</button
        >
      {/each}
    </span>
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
                {colLabel(col)}{arrow(col.id)}
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
              {#if col.id === 'at' || col.id === 'now'}
                {@const tier = col.id === 'at' ? r.tierAt : r.tierNow}
                <td class="px-2 py-2">
                  <div class="flex items-center gap-1.5 whitespace-nowrap leading-tight text-slate-800">
                    <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style="background: {CLASS_COLORS[tier]}"></span>
                    {TIERS[tier].label}
                  </div>
                  <div class="pl-4 text-[11px] tabular-nums text-slate-500">
                    {((col.id === 'at' ? r.spendAt : r.spendNow) / (localReference(c) * HOUSEHOLD_SCALE[app.household])).toFixed(1)}× a local
                  </div>
                </td>
              {:else if tierCol(col.id)}
                {@const t = Number(col.id[1])}
                {@const y = r.years[t]}
                {@const onPlan = y !== null && app.age + y <= app.retireAge}
                <td class="whitespace-nowrap px-2 py-2 tabular-nums {onPlan ? 'bg-emerald-50/70' : ''}">
                  <div class="leading-tight {onPlan ? 'font-semibold text-slate-900' : 'text-slate-700'}">{costText(r, t)}</div>
                  <div class="text-[11px] leading-tight">
                    {#if y === null}
                      <span class="text-slate-400">not by {app.planToAge}</span>
                    {:else if onPlan}
                      <span class="font-medium text-emerald-700">✓ {y === 0 ? 'today' : `at ${app.age + y}`}</span>
                    {:else}
                      <span class="text-slate-500">at {app.age + y}</span>
                    {/if}
                  </div>
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
      <div class="space-y-2 p-6 text-center text-sm text-slate-500">
        <p>No cities match these filters.</p>
        {#if app.minTier > 0 && app.minTierWhen !== 'at'}
          <button class="font-medium text-blue-600 hover:underline" onclick={() => (app.minTierWhen = 'at')}>
            Try {TIERS[app.minTier].label.toLowerCase()} at {app.retireAge} instead
          </button>
        {:else if app.filtersActive > 0}
          <button class="font-medium text-blue-600 hover:underline" onclick={() => app.clearFilters()}>Clear all filters</button>
        {/if}
      </div>
    {:else if rows.length > limit}
      <div class="p-4 text-center">
        <button class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50" onclick={() => (limit += PAGE * 2)}>
          Show more ({rows.length - limit} left)
        </button>
      </div>
    {/if}
    <p class="px-4 pb-4 pt-2 text-[11px] text-slate-400">
      Tier columns: what each lifestyle costs per city ({app.costUnit === 'egg' ? `savings needed to retire there at ${app.retireAge}, incl. health insurance, taxes and the bridge to Social Security` : 'spending, before health insurance'}), and the age you could
      retire there at that level. Green ✓ = by your planned age {app.retireAge}.
    </p>
  </div>
</div>
