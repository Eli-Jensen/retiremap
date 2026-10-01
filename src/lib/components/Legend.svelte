<script lang="ts">
  import { app, meta, WHEN_BUCKETS } from '../state.svelte.ts';
  import { TIERS } from '../math/tiers.ts';
  import { CLASS_COLORS } from '../math/color.ts';

  const items = $derived(
    app.mode === 'at'
      ? [...TIERS.slice(1).map((t, i) => ({ cls: i + 1, label: t.label })).reverse(), { cls: 0, label: 'Not enough' }]
      : [...WHEN_BUCKETS.map((b) => ({ cls: b.cls, label: b.label })), { cls: 0, label: `Not by ${app.planToAge}` }],
  );
</script>

<div class="pointer-events-auto rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
  <ul class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 sm:flex-col">
    {#each items as it (it.cls)}
      <li class="flex items-center gap-1.5">
        <span class="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white" style="background: {CLASS_COLORS[it.cls]}"></span>
        {it.label}
      </li>
    {/each}
  </ul>
  <p class="mt-1.5 hidden text-[10px] text-slate-400 sm:block">Numbeo {meta.snapshotDate} · {meta.cityCount} cities</p>
</div>
