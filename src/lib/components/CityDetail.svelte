<script lang="ts">
  import { app, meta, inUS, placeById, flagEmoji, fmtUsd, fmtUsdCompact, fmtCompact, fmtPct, fmtPercentile, TARGET_TIERS } from '../state.svelte.ts';
  import { TIERS, HOUSEHOLD_SCALE, localReference, tierSpend } from '../math/tiers.ts';
  import { CLASS_COLORS } from '../math/color.ts';
  import { METRICS, fmtMetric } from '../metrics.ts';

  const city = $derived(app.selectedCity);
  const r = $derived(city ? app.results.get(city.id) : undefined);
  const b = $derived(city && r ? app.breakdown(city) : undefined);
  const ref = $derived(city ? localReference(city) : 0);
  const at = $derived(app.atRetirement);
  const when = $derived(app.retireAge === app.age ? 'today' : `at ${app.retireAge}`);
  const regionLabel = $derived(city ? city.places.slice(1, -1).map((id) => placeById.get(id)?.label).filter(Boolean)[0] : '');
  const countryId = $derived(city ? city.places[city.places.length - 1] : '');
</script>

{#if city && r && b}
  <div
    class="pointer-events-auto max-h-[70vh] w-full space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur sm:max-h-[calc(100vh-2rem)] sm:w-80"
    role="dialog"
    data-city-card
    aria-label="{city.name} details"
  >
    <div class="flex items-start justify-between gap-2">
      <div>
        <h2 class="font-bold leading-tight text-slate-900">{flagEmoji(city.iso2)} {city.name}</h2>
        <p class="text-[11px] text-slate-500">
          {city.admin ? `${city.admin}, ` : ''}{city.country} · {regionLabel}{#if city.pop} · pop. {fmtCompact(city.pop)}{/if}
        </p>
      </div>
      <button class="-m-1 p-1 text-slate-400 hover:text-slate-700" aria-label="Close" onclick={() => (app.selectedCityId = null)}>✕</button>
    </div>

    {#if !inUS(city)}
      {@const f = city.usFlights}
      <p class="text-xs text-slate-600">
        ✈️
        {#if f && f.yearRound.length + f.seasonal.length > 0}
          Nonstop to <b class="text-slate-900">{f.yearRound.join(', ') || 'the US'}</b>{#if f.seasonal.length}<span class="text-slate-500">
              {f.yearRound.length ? ' + seasonal' : ' (seasonal only):'} {f.seasonal.join(', ')}</span
            >{/if}
          <span class="text-slate-400">from {f.via[0]?.airport} ({f.via[0]?.km} km)</span>
        {:else}
          <span class="text-slate-500">No nonstop flights to major US airports within {meta.flights?.radiusKm ?? 80} km.</span>
        {/if}
      </p>
    {/if}

    <p class="text-xs text-slate-600">
      Locals earn about <b class="text-slate-900">{fmtUsd(city.salary)}/mo</b> after tax.
      {#if city.basics > city.salary}
        That's below the {fmtUsd(city.basics)}/mo one person typically spends here before rent, so tiers measure against that
        instead.
      {/if}
      {#if app.household === 'couple'}A local couple's equivalent is {fmtUsd(ref * HOUSEHOLD_SCALE.couple)}.{/if}
    </p>

    <!-- At your retirement age -->
    <div class="space-y-1 rounded-lg bg-slate-50 p-2.5">
      <div class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Retire {when} · {fmtUsdCompact(at.portfolio)} saved</div>
      <div class="flex items-center gap-1.5 font-semibold text-slate-900">
        <span class="inline-block h-3 w-3 rounded-full" style="background: {CLASS_COLORS[r.tierAt]}"></span>
        {TIERS[r.tierAt].label}
      </div>
      <p class="text-xs text-slate-600">
        {#if r.tierAt > 0}
          {fmtUsd(r.spendAt)}/mo to live on, {r.ratioAt.toFixed(1)}× a local{#if r.health.over65 > 0}, plus health insurance{/if}. At
          US prices that's the {fmtPercentile(app.usPercentile(r.spendAt, city))} percentile of households.
        {:else if r.spendAt > 0}
          Only {fmtUsd(r.spendAt)}/mo would be left to live on{#if r.health.over65 > 0} after health insurance{/if} — under
          {fmtUsd(tierSpend(1, ref, app.household))}, what a minimum-wage local earns.
        {:else}
          Your savings wouldn't yet cover {r.health.under65 > 0 ? 'health insurance and ' : ''}the years before your income starts.
        {/if}
      </p>
    </div>

    <!-- The ladder -->
    <div class="space-y-1.5 rounded-lg bg-slate-50 p-2.5">
      <div class="text-[11px] font-medium uppercase tracking-wide text-slate-500">When could you retire here…</div>
      <table class="w-full text-xs tabular-nums">
        <thead class="text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th class="pb-0.5 text-left font-medium"></th>
            <th class="pb-0.5 text-right font-medium">$/mo</th>
            <th class="pb-0.5 text-right font-medium" title="Savings needed to retire here at this level at {app.retireAge}">need at {app.retireAge}</th>
            <th class="pb-0.5 text-right font-medium">you</th>
          </tr>
        </thead>
        <tbody>
          {#each [...TARGET_TIERS].reverse() as t (t)}
            {@const y = r.years[t]}
            {@const onPlan = y !== null && app.age + y <= app.retireAge}
            <tr class="{app.mode === 'when' && t === app.targetTier ? 'font-semibold text-slate-900' : 'text-slate-600'} {onPlan ? 'bg-emerald-50/70' : ''}">
              <td class="py-0.5 pl-1">
                <button class="flex items-center gap-1.5 hover:underline" onclick={() => ((app.targetTier = t), (app.mode = 'when'))}>
                  <span class="inline-block h-2.5 w-2.5 rounded-full" style="background: {CLASS_COLORS[t]}"></span>
                  {TIERS[t].label}
                </button>
              </td>
              <td class="py-0.5 text-right">{fmtUsd(r.costs[t])}</td>
              <td class="py-0.5 pl-2 text-right text-slate-500">{fmtUsdCompact(r.nestEggs[t])}</td>
              <td class="w-14 py-0.5 pr-1 text-right">
                {#if y === null}
                  <span class="text-slate-400">—</span>
                {:else if onPlan}
                  <span class="font-medium text-emerald-700">✓ {y === 0 ? 'now' : app.age + y}</span>
                {:else}
                  {app.age + y}
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="text-[11px] text-slate-400">
        You'll have {fmtUsdCompact(at.portfolio)} at {app.retireAge}. "$/mo" is spending before health insurance; "need" adds
        insurance, taxes and the bridge to Social Security. ✓ = within reach by {app.retireAge}.
      </p>
      {#if b.target && b.targetAge !== null}
        <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-t border-slate-200 pt-1.5 text-xs tabular-nums text-slate-600">
          <dt class="col-span-2 text-[11px] font-medium text-slate-500">{TIERS[app.targetTier].label} at {b.targetAge}: you'd need</dt>
          <dt>Savings</dt>
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
      {/if}
    </div>

    <div class="space-y-1">
      <div class="flex items-baseline justify-between">
        <span class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Quality of life</span>
        <b class="text-sm tabular-nums text-slate-900">{city.qol ? Math.round(city.qol.index) : '—'}</b>
      </div>
      <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs tabular-nums text-slate-600">
        {#each METRICS.filter((m) => m.group !== 'Climate' && m.id !== 'qol' && m.id !== 'pop') as m (m.id)}
          {@const v = m.get(city)}
          <span>{m.label}{#if !m.higherIsBetter}<span class="text-slate-400"> ↓</span>{/if}</span>
          <span class="text-right">{v === null ? '—' : Math.round(v)}</span>
        {/each}
      </div>
      <p class="text-[11px] text-slate-400">Numbeo indexes; prices with New York = 100; ↓ = lower is better.</p>
    </div>

    {#if city.climate}
      {@const cl = city.climate}
      {@const t = (c: number) => Math.round(app.units === 'us' ? (c * 9) / 5 + 32 : c)}
      <div class="space-y-1">
        <div class="flex items-baseline justify-between">
          <span class="text-[11px] font-medium uppercase tracking-wide text-slate-500">Climate</span>
          <button class="text-[10px] text-slate-400 hover:text-slate-700" onclick={() => (app.units = app.units === 'us' ? 'metric' : 'us')}>
            {app.units === 'us' ? '°F → °C' : '°C → °F'}
          </button>
        </div>
        <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs tabular-nums text-slate-600">
          {#each METRICS.filter((m) => m.group === 'Climate' && m.id !== 'climate') as m (m.id)}
            {@const v = m.get(city)}
            <span>{m.label}</span><span class="text-right">{v === null ? '—' : fmtMetric(m, v, app.units)}</span>
          {/each}
        </div>
        <table class="mt-1 w-full table-fixed text-center text-[10px] tabular-nums text-slate-500">
          <thead><tr>{#each 'JFMAMJJASOND' as mo, i (i)}<th class="font-medium text-slate-400">{mo}</th>{/each}</tr></thead>
          <tbody>
            <tr class="text-red-700">{#each cl.months as m, i (i)}<td>{t(m.hi)}</td>{/each}</tr>
            <tr class="text-blue-700">{#each cl.months as m, i (i)}<td>{t(m.lo)}</td>{/each}</tr>
          </tbody>
        </table>
        <p class="text-[11px] text-slate-400">
          Monthly average high / low (°{app.units === 'us' ? 'F' : 'C'}),
          {cl.years === 1 ? `${meta.climate?.lastYear} only` : `${cl.years}-year average`} · Open-Meteo / ERA5.
        </p>
      </div>
    {/if}

    <div class="flex gap-2 text-[11px]">
      <button class="flex-1 rounded-md border border-slate-200 py-1 text-slate-600 hover:bg-slate-50" onclick={() => app.setPlace(countryId, 'only')}>
        Only {city.country}
      </button>
      <button
        class="flex-1 rounded-md border border-slate-200 py-1 text-slate-600 hover:bg-slate-50"
        onclick={() => {
          app.setPlace(countryId, 'never');
          app.selectedCityId = null;
        }}>Never {city.country}</button
      >
    </div>

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
