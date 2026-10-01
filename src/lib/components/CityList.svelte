<script lang="ts">
  import { app, cities, flagEmoji, fmtUsd } from '../state.svelte.ts';
  import type { SortKey } from '../state.svelte.ts';
  import { TIERS, localReference } from '../math/tiers.ts';
  import { CLASS_COLORS } from '../math/color.ts';

  const PAGE = 60;
  let limit = $state(PAGE);
  let query = $state('');

  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const rows = $derived.by(() => {
    const q = fold(query.trim());
    const res = app.results;
    const list = cities.filter((c) => res.get(c.id)!.visible && (!q || fold(`${c.name} ${c.country}`).includes(q)));
    const yrs = (id: string) => res.get(id)!.years ?? Infinity;
    const ratio = (id: string) => res.get(id)!.nowRatio;
    const by: Record<SortKey, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      best: (a, b) =>
        app.mode === 'when' ? yrs(a.id) - yrs(b.id) || ratio(b.id) - ratio(a.id) : ratio(b.id) - ratio(a.id),
      name: (a, b) => a.name.localeCompare(b.name),
      qol: (a, b) => (b.qol?.index ?? -1) - (a.qol?.index ?? -1),
      salary: (a, b) => localReference(a) - localReference(b),
    };
    return list.sort(by[app.sort]);
  });

  $effect(() => {
    // New sort/filter: start from the top of the list again.
    void rows;
    limit = PAGE;
  });

  const sorts: { key: SortKey; label: string }[] = [
    { key: 'best', label: 'Best for you' },
    { key: 'qol', label: 'Quality of life' },
    { key: 'salary', label: 'Cheapest' },
    { key: 'name', label: 'A–Z' },
  ];
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
    <label class="flex items-center gap-1 text-xs text-slate-500">
      Sort
      <select class="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" bind:value={app.sort}>
        {#each sorts as s (s.key)}
          <option value={s.key}>{s.label}</option>
        {/each}
      </select>
    </label>
  </div>

  <div class="flex-1 overflow-y-auto">
    <table class="w-full text-sm">
      <thead class="sticky top-0 z-[1] bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
        <tr>
          <th class="px-4 py-2 font-medium">City</th>
          <th class="px-2 py-2 font-medium">Retire today</th>
          <th class="px-2 py-2 font-medium">{TIERS[app.targetTier].label}</th>
          <th class="hidden px-2 py-2 text-right font-medium sm:table-cell">QoL</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        {#each rows.slice(0, limit) as c (c.id)}
          {@const r = app.results.get(c.id)!}
          <tr
            class="cursor-pointer hover:bg-blue-50/60 {app.selectedCityId === c.id ? 'bg-blue-50' : ''}"
            onclick={() => (app.selectedCityId = c.id)}
          >
            <td class="px-4 py-2">
              <div class="font-medium leading-tight text-slate-900">{flagEmoji(c.iso2)} {c.name}</div>
              <div class="text-[11px] text-slate-500">{c.admin ? `${c.admin}, ` : ''}{c.country}</div>
            </td>
            <td class="px-2 py-2">
              <div class="flex items-center gap-1.5 leading-tight text-slate-800">
                <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style="background: {CLASS_COLORS[r.nowTier]}"></span>
                {TIERS[r.nowTier].label}
              </div>
              {#if r.nowTier > 0}
                <div class="pl-4 text-[11px] tabular-nums text-slate-500">{fmtUsd(r.nowSpend)}/mo</div>
              {/if}
            </td>
            <td class="px-2 py-2 tabular-nums">
              {#if r.years === null}
                <span class="text-slate-400">not by {app.planToAge}</span>
              {:else if r.years === 0}
                <span class="font-medium text-slate-900">now</span>
              {:else}
                <span class="text-slate-900">age {app.age + r.years}</span>
              {/if}
              <div class="text-[11px] text-slate-500">{fmtUsd(r.targetSpend)}/mo</div>
            </td>
            <td class="hidden px-2 py-2 text-right tabular-nums text-slate-600 sm:table-cell">
              {c.qol ? Math.round(c.qol.index) : '—'}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if rows.length === 0}
      <p class="p-6 text-center text-sm text-slate-500">No cities match these filters.</p>
    {:else if rows.length > limit}
      <div class="p-4 text-center">
        <button
          class="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          onclick={() => (limit += PAGE * 2)}>Show more ({rows.length - limit} left)</button
        >
      </div>
    {/if}
  </div>
</div>
