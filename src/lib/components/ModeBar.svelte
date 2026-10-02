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

  <div class="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
    <span>Only show where I could live</span>
    <select
      aria-label="Minimum lifestyle"
      class="rounded-md border px-1.5 py-1 text-xs {app.minTier > 0 ? 'border-blue-400 bg-blue-50 font-medium text-blue-900' : 'border-slate-300 bg-white'}"
      value={String(app.minTier)}
      onchange={(e) => (app.minTier = Number(e.currentTarget.value))}
    >
      <option value="0">any way at all</option>
      {#each TIERS.slice(1) as t, i (t.id)}
        <option value={String(i + 1)}>{i + 1 === TIERS.length - 1 ? t.label.toLowerCase() : `at least ${t.label.toLowerCase()}`}</option>
      {/each}
    </select>
    {#if app.minTier > 0}
      <select
        aria-label="When"
        class="rounded-md border border-blue-400 bg-blue-50 px-1.5 py-1 text-xs font-medium text-blue-900"
        value={app.minTierWhen}
        onchange={(e) => (app.minTierWhen = e.currentTarget.value as typeof app.minTierWhen)}
      >
        <option value="now">today</option>
        <option value="at">at {app.retireAge}</option>
        <option value="by">by age…</option>
      </select>
      {#if app.minTierWhen === 'by'}
        <input
          type="number"
          aria-label="By age"
          min={app.age}
          max="100"
          class="w-14 rounded-md border border-blue-400 bg-blue-50 px-1.5 py-1 text-xs tabular-nums text-blue-900"
          value={app.minTierByAge}
          oninput={(e) => {
            const n = Number(e.currentTarget.value);
            if (n >= 18 && n <= 100) app.minTierByAge = Math.round(n);
          }}
        />
      {/if}
      <button class="text-slate-400 hover:text-slate-700" aria-label="Remove lifestyle filter" onclick={() => (app.minTier = 0)}>✕</button>
    {/if}
  </div>

  <p class="text-sm leading-snug text-slate-700" aria-live="polite">
    {#if s.shown === 0}
      No cities match your filters.
      {#if app.minTier > 0 && app.minTierWhen !== 'at'}
        <button class="font-medium text-blue-600 hover:underline" onclick={() => (app.minTierWhen = 'at')}>Try at {app.retireAge} →</button>
      {/if}
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
