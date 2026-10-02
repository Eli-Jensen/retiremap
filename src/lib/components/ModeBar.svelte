<script lang="ts">
  import { app, fmtUsdCompact } from '../state.svelte.ts';
  import type { SortKey, TierWhen } from '../state.svelte.ts';
  import { TIERS } from '../math/tiers.ts';

  const s = $derived(app.summary);
  const target = $derived(TIERS[app.targetTier]);
  const best = $derived.by(() => {
    let i = TIERS.length - 1;
    while (i > 0 && s.byTier[i] === 0) i--;
    return i;
  });
  const when = $derived(app.retireAge === app.age ? 'today' : `at ${app.retireAge}`);
  const pill = (on: boolean) =>
    `rounded-md border px-1.5 py-1 text-xs ${on ? 'border-blue-400 bg-blue-50 font-medium text-blue-900' : 'border-slate-300 bg-white'}`;

  // Worked examples of what the filter + sort can answer; each just sets them.
  type Question = { label: string; tier: number; when: TierWhen; within?: number; sort: SortKey };
  const questions: Question[] = $derived([
    { label: 'Live well within 5 years', tier: 4, when: 'within', within: 5, sort: 'best' },
    { label: 'Like a king today, best quality of life first', tier: 5, when: 'now', sort: 'qol' },
    { label: 'Cheapest places to live comfortably', tier: 0, when: 'now', sort: 't3' },
    { label: `Like a local by ${app.retireAge}, safest first`, tier: 2, when: 'at', sort: 'safety' },
  ]);
  function ask(q: Question) {
    app.minTier = q.tier;
    app.minTierWhen = q.when;
    if (q.within !== undefined) app.minTierWithin = q.within;
    app.sort = q.sort;
    app.sortDesc = false;
    app.tab = 'list';
  }
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

  <div class="space-y-1.5 rounded-lg bg-slate-50 px-2.5 py-2">
    <div class="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
      <span>Show cities where I could live</span>
      <select aria-label="Lifestyle" class="{pill(app.minTier > 0)}" value={String(app.minTier)} onchange={(e) => (app.minTier = Number(e.currentTarget.value))}>
        <option value="0">any way at all</option>
        {#each TIERS.slice(1) as t, i (t.id)}
          <option value={String(i + 1)}>{i + 1 === TIERS.length - 1 ? t.label.toLowerCase() : `at least ${t.label.toLowerCase()}`}</option>
        {/each}
      </select>
      {#if app.minTier > 0}
        <select aria-label="When" class={pill(true)} value={app.minTierWhen} onchange={(e) => (app.minTierWhen = e.currentTarget.value as TierWhen)}>
          <option value="now">today</option>
          <option value="within">within…</option>
          <option value="by">by age…</option>
          <option value="at">by my retirement age ({app.retireAge})</option>
        </select>
        {#if app.minTierWhen === 'within'}
          <input
            type="number"
            aria-label="Within how many years"
            min="0"
            max="80"
            class="{pill(true)} w-12 tabular-nums"
            value={app.minTierWithin}
            oninput={(e) => {
              const n = Number(e.currentTarget.value);
              if (n >= 0 && n <= 80) app.minTierWithin = Math.round(n);
            }}
          />
          <span>{app.minTierWithin === 1 ? 'year' : 'years'} <span class="text-slate-400">(by {app.tierDeadline})</span></span>
        {:else if app.minTierWhen === 'by'}
          <input
            type="number"
            aria-label="By age"
            min={app.age}
            max="100"
            class="{pill(true)} w-14 tabular-nums"
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
    <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span class="text-slate-400">Try:</span>
      {#each questions as q (q.label)}
        <button class="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600 hover:border-blue-300 hover:text-blue-700" onclick={() => ask(q)}>
          {q.label}
        </button>
      {/each}
    </div>
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
