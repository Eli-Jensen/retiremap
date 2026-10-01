<script lang="ts">
  import { app, fmtUsdCompact } from '../state.svelte.ts';
  import { TIERS } from '../math/tiers.ts';

  const s = $derived(app.summary);
  const target = $derived(TIERS[app.targetTier]);
  const best = $derived.by(() => {
    let i = TIERS.length - 1;
    while (i > 0 && s.byTier[i] === 0) i--;
    return i;
  });
  const when = $derived(app.retireAge === app.age ? 'today' : `at ${app.retireAge}`);
  const tab = (on: boolean) => `rounded-md px-3 py-1.5 text-xs font-medium ${on ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`;
</script>

<div class="space-y-2">
  <div class="flex flex-wrap items-center gap-2">
    <div class="flex rounded-lg border border-slate-300 bg-white p-0.5" role="tablist" aria-label="Question">
      <button role="tab" aria-selected={app.mode === 'at'} class={tab(app.mode === 'at')} onclick={() => (app.mode = 'at')}>
        Retire {when}
      </button>
      <button role="tab" aria-selected={app.mode === 'when'} class={tab(app.mode === 'when')} onclick={() => (app.mode = 'when')}>
        When could I…
      </button>
    </div>
    {#if app.mode === 'when'}
      <select
        aria-label="Lifestyle"
        class="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-900"
        value={String(app.targetTier)}
        onchange={(e) => (app.targetTier = Number(e.currentTarget.value))}
      >
        {#each TIERS.slice(1) as t, i (t.id)}
          <option value={String(i + 1)}>{t.verb}</option>
        {/each}
      </select>
    {/if}
  </div>

  <p class="text-sm leading-snug text-slate-700" aria-live="polite">
    {#if s.shown === 0}
      No cities match your filters.
    {:else if app.mode === 'at'}
      {#if s.retirable === 0}
        Retiring {when} with {fmtUsdCompact(app.atRetirement.portfolio)} isn't enough in any of these {s.shown} cities.
        <button class="font-medium text-blue-600 hover:underline" onclick={() => (app.mode = 'when')}>See when you could →</button>
      {:else}
        Retiring {when} with {fmtUsdCompact(app.atRetirement.portfolio)}, you could live in
        <b class="text-slate-950">{s.retirable}</b> of {s.shown} cities —
        <b class="text-slate-950">{TIERS[best].label.toLowerCase()}</b> in {s.byTier[best]}.
      {/if}
    {:else if s.soonest === null}
      With these numbers you can't {target.verb} anywhere before age {app.planToAge}.
    {:else if s.soonest === 0}
      You could {target.verb} <b class="text-slate-950">today</b> in {s.soonestCount} {s.soonestCount === 1 ? 'city' : 'cities'}.
    {:else}
      Soonest you could {target.verb}: <b class="text-slate-950">age {app.age + s.soonest}</b>
      ({s.soonest} {s.soonest === 1 ? 'year' : 'years'}) in {s.soonestCount} {s.soonestCount === 1 ? 'city' : 'cities'}.
    {/if}
  </p>
</div>
