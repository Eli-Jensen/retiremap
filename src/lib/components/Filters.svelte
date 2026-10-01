<script lang="ts">
  import { app, cities } from '../state.svelte.ts';
  import { REGIONS } from '../types.ts';

  const rated = cities.filter((c) => c.qol).length;
  // Reference points so the bare index number means something.
  const anchors = ['New York', 'Lisbon', 'Vienna']
    .map((n) => cities.find((c) => c.name === n && c.qol))
    .filter((c) => c !== undefined)
    .map((c) => `${c.name} ${Math.round(c.qol!.index)}`)
    .join(' · ');
</script>

<section class="space-y-3">
  <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Filter</h2>
  <label class="block space-y-1 text-xs text-slate-600">
    <span class="flex justify-between">
      <span>Quality of life at least</span>
      <b class="tabular-nums">{app.minQol === 0 ? 'any' : app.minQol}</b>
    </span>
    <input type="range" min="0" max="200" step="10" class="w-full accent-blue-600" bind:value={app.minQol} />
    <span class="block text-[11px] text-slate-400">
      Numbeo Quality of Life Index ({anchors}). {#if app.minQol > 0}Hides the {cities.length - rated} unrated cities.{:else}{rated} of {cities.length} cities rated.{/if}
    </span>
  </label>
  <label class="flex items-center justify-between gap-2 text-xs text-slate-600">
    <span>Region</span>
    <select
      class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
      value={app.region}
      onchange={(e) => (app.region = e.currentTarget.value as typeof app.region)}
    >
      <option value="all">Everywhere</option>
      {#each REGIONS as r (r)}
        <option value={r}>{r}</option>
      {/each}
    </select>
  </label>
</section>
