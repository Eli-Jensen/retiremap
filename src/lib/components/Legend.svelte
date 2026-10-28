<script lang="ts">
  import { app, meta, WHEN_BUCKETS } from '../state.svelte.ts';
  import { TIERS } from '../math/tiers.ts';
  import { CLASS_COLORS } from '../math/color.ts';

  // Both modes share one palette (purple = best), so the title says what the
  // colors measure in this mode.
  const when = $derived(app.retireAge === app.age ? 'today' : `at ${app.retireAge}`);
  const title = $derived(app.mode === 'at' ? `Lifestyle ${when}` : `How soon you could ${TIERS[app.targetTier].verb}`);
  const items = $derived(
    app.mode === 'at'
      ? [...TIERS.slice(1).map((t, i) => ({ cls: i + 1, label: t.label, note: `${t.min}×` })).reverse(), { cls: 0, label: 'Not enough', note: '' }]
      : [...WHEN_BUCKETS.map((b) => ({ cls: b.cls, label: b.label, note: '' })), { cls: 0, label: `Not by ${app.planToAge}`, note: '' }],
  );
</script>

<div class="pointer-events-auto rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
  <p class="mb-1 text-xs font-medium text-slate-700">
    {title}{#if app.mode === 'at'}<span class="font-normal text-slate-500"> · your budget ÷ local pay</span>{/if}
  </p>
  <ul class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 sm:flex-col">
    {#each items as it (it.cls)}
      <li class="flex items-center gap-1.5">
        <span class="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white" style="background: {CLASS_COLORS[it.cls]}"></span>
        {it.label}{#if it.note}<span class="tabular-nums text-slate-500">{it.note}+</span>{/if}
      </li>
    {/each}
  </ul>
  <p class="mt-1.5 hidden text-xs text-slate-500 sm:block">Numbeo {meta.snapshotDate} · {meta.cityCount} cities</p>
</div>
