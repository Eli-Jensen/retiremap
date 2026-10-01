<script lang="ts">
  import { app, flagEmoji, fmtUsd, fmtUsdCompact, fmtPct, fmtPercentile } from '../state.svelte.ts';
  import { TIERS, HOUSEHOLD_SCALE, localReference, tierSpend } from '../math/tiers.ts';
  import { CLASS_COLORS } from '../math/color.ts';

  const city = $derived(app.selectedCity);
  const r = $derived(city ? app.results.get(city.id) : undefined);
  const b = $derived(city && r ? app.breakdown(city) : undefined);
  const target = $derived(TIERS[app.targetTier]);
  const ref = $derived(city ? localReference(city) : 0);
  const localBudget = $derived(ref * HOUSEHOLD_SCALE[app.household]);
</script>

{#if city && r && b}
  <div
    class="pointer-events-auto max-h-[70vh] w-full space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur sm:max-h-[calc(100vh-2rem)] sm:w-80"
    role="dialog"
    aria-label="{city.name} details"
  >
    <div class="flex items-start justify-between gap-2">
      <div>
        <h2 class="font-bold leading-tight text-slate-900">{flagEmoji(city.iso2)} {city.name}</h2>
        <p class="text-[11px] text-slate-500">{city.admin ? `${city.admin}, ` : ''}{city.country} · {city.region}</p>
      </div>
      <button class="-m-1 p-1 text-slate-400 hover:text-slate-700" aria-label="Close" onclick={() => (app.selectedCityId = null)}>✕</button>
    </div>

    <p class="text-xs text-slate-600">
      Locals earn about <b class="text-slate-900">{fmtUsd(city.salary)}/mo</b> after tax.
      {#if city.basics > city.salary}
        That's below the {fmtUsd(city.basics)}/mo one person typically spends here before rent, so tiers measure against
        that instead.
      {/if}
      {#if app.household === 'couple'}A local couple's equivalent is {fmtUsd(localBudget)}.{/if}
    </p>

    <!-- Retire today -->
    <div class="space-y-1 rounded-lg bg-slate-50 p-2.5">
      <div class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Retire today (age {app.age})</div>
      <div class="flex items-center gap-1.5 font-semibold text-slate-900">
        <span class="inline-block h-3 w-3 rounded-full" style="background: {CLASS_COLORS[r.nowTier]}"></span>
        {TIERS[r.nowTier].label}
      </div>
      <p class="text-xs text-slate-600">
        {#if r.nowTier > 0}
          {fmtUsd(r.nowSpend)}/mo to live on, {r.nowRatio.toFixed(1)}× a local{#if r.health.over65 > 0}, plus health
            insurance{/if}. At US prices that's the {fmtPercentile(app.usPercentile(r.nowSpend, city))} percentile of households.
        {:else if r.nowSpend > 0}
          Only {fmtUsd(r.nowSpend)}/mo would be left to live on{#if r.health.over65 > 0} after health insurance{/if} —
          under {fmtUsd(tierSpend(1, ref, app.household))}, what a minimum-wage local earns.
        {:else}
          Your savings don't yet cover {r.health.under65 > 0 ? 'health insurance and ' : ''}the years before your income starts.
        {/if}
      </p>
    </div>

    <!-- Target tier -->
    <div class="space-y-1.5 rounded-lg bg-slate-50 p-2.5">
      <div class="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {target.label} · {fmtUsd(r.targetSpend)}/mo
      </div>
      {#if b.target && b.retireAge !== null}
        <div class="font-semibold text-slate-900">
          {r.years === 0 ? 'You can do it now' : `At age ${b.retireAge}`}
          {#if r.years}<span class="font-normal text-slate-500">· in {r.years} {r.years === 1 ? 'year' : 'years'}</span>{/if}
        </div>
        <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs tabular-nums text-slate-600">
          <dt>Savings needed then</dt>
          <dd class="text-right font-medium text-slate-900">{fmtUsdCompact(b.target.total)}</dd>
          {#if b.target.perpetual > 0}
            <dt class="pl-2 text-slate-500">withdrawn at {fmtPct(b.target.swr, 2)} for {b.target.horizon} yrs</dt>
            <dd class="text-right">{fmtUsdCompact(b.target.perpetual)}</dd>
          {/if}
          {#if b.target.bridge > 0}
            <dt class="pl-2 text-slate-500">bridge until income &amp; Medicare age</dt>
            <dd class="text-right">{fmtUsdCompact(b.target.bridge)}</dd>
          {/if}
          {#if b.target.perpetual === 0}
            <dt class="col-span-2 pl-2 text-slate-500">After that, your income covers everything.</dt>
          {/if}
          {#if r.health.over65 > 0}
            <dt>Health insurance</dt>
            <dd class="text-right">{fmtUsd(r.health.under65)} → {fmtUsd(r.health.over65)}/mo</dd>
          {/if}
          {#if b.target.perpetual > 0}
            <dt>Ran out in past retirements</dt>
            <dd class="text-right">{fmtPct(app.swrTable.failure(b.target.horizon, b.target.swr), 1)}</dd>
          {/if}
        </dl>
      {:else}
        <div class="font-semibold text-slate-900">Not before age {app.planToAge}</div>
        <p class="text-xs text-slate-600">Try a lower tier, more savings, or a longer horizon.</p>
      {/if}
    </div>

    {#if city.qol}
      <div class="space-y-1">
        <div class="flex items-baseline justify-between">
          <span class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Quality of life</span>
          <b class="text-sm tabular-nums text-slate-900">{Math.round(city.qol.index)}</b>
        </div>
        <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs tabular-nums text-slate-600">
          <span>Safety</span><span class="text-right">{Math.round(city.qol.safety)}</span>
          <span>Health care</span><span class="text-right">{Math.round(city.qol.healthCare)}</span>
          <span>Pollution <span class="text-slate-400">(lower = better)</span></span><span class="text-right">{Math.round(city.qol.pollution)}</span>
          {#if city.qol.climate}<span>Climate</span><span class="text-right">{Math.round(city.qol.climate)}</span>{/if}
        </div>
      </div>
    {:else}
      <p class="text-xs text-slate-400">Numbeo has no quality-of-life score for {city.name}.</p>
    {/if}

    <details class="text-xs text-slate-600">
      <summary class="cursor-pointer select-none text-slate-500 hover:text-slate-700">Numbeo indexes (NYC = 100)</summary>
      <div class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <span>Cost of living</span><span class="text-right">{city.col}</span>
        <span>Rent</span><span class="text-right">{city.rent}</span>
        <span>COL + rent</span><span class="text-right">{city.colRent}</span>
        <span>Groceries</span><span class="text-right">{city.groceries}</span>
        <span>Restaurants</span><span class="text-right">{city.restaurant}</span>
        <span>Purchasing power</span><span class="text-right">{city.purchasingPower}</span>
      </div>
    </details>
  </div>
{/if}
