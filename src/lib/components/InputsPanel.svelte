<script lang="ts">
  import { app, defaults, fmtPct, BRIDGE_RATE } from '../state.svelte.ts';
  import MoneyInput from './MoneyInput.svelte';

  const swrNow = $derived(app.assumptions.swr(app.planToAge - app.age));
</script>

<section class="space-y-3">
  <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">You</h2>

  <div class="grid grid-cols-2 gap-2">
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600" for="age">Age</label>
      <input
        id="age"
        type="number"
        min="18"
        max="90"
        class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums focus:border-blue-500 focus:outline-none"
        value={app.age}
        oninput={(e) => {
          const n = Number(e.currentTarget.value);
          if (n >= 18 && n <= 90) app.age = Math.round(n);
        }}
      />
    </div>
    <div class="space-y-1">
      <span class="text-xs font-medium text-slate-600">Household</span>
      <div class="flex rounded-lg border border-slate-300 p-0.5">
        {#each ['single', 'couple'] as const as h (h)}
          <button
            class="flex-1 rounded-md py-1.5 text-xs font-medium capitalize {app.household === h
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'}"
            aria-pressed={app.household === h}
            onclick={() => (app.household = h)}>{h}</button
          >
        {/each}
      </div>
    </div>
  </div>

  <MoneyInput
    id="portfolio"
    label="Invested savings"
    value={app.portfolioInput}
    fallback={app.portfolio}
    hint="typical for your age"
    onchange={(v) => (app.portfolioInput = v)}
  />
  <MoneyInput
    id="savings"
    label="Adding per year until you retire"
    value={app.savingsInput}
    fallback={app.annualSavings}
    hint="typical 12% of pay"
    suffix="/yr"
    onchange={(v) => (app.savingsInput = v)}
  />

  <div class="grid grid-cols-[1fr_5.5rem] items-end gap-2">
    <MoneyInput
      id="ss"
      label="Social Security"
      value={app.ssInput}
      fallback={app.socialSecurity}
      hint="US average"
      suffix="/yr"
      onchange={(v) => (app.ssInput = v)}
    />
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600" for="ss-age">from age</label>
      <input
        id="ss-age"
        type="number"
        min="62"
        max="70"
        class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums focus:border-blue-500 focus:outline-none"
        value={app.ssStartAge}
        oninput={(e) => {
          const n = Number(e.currentTarget.value);
          if (n >= 50 && n <= 75) app.ssStartAge = Math.round(n);
        }}
      />
    </div>
  </div>

  <div class="grid grid-cols-[1fr_5.5rem] items-end gap-2">
    <MoneyInput
      id="other"
      label="Pension / rental / other income"
      value={app.otherIncome === 0 ? null : app.otherIncome}
      fallback={0}
      suffix="/yr"
      onchange={(v) => (app.otherIncome = v ?? 0)}
    />
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600" for="other-age">from age</label>
      <input
        id="other-age"
        type="number"
        min="18"
        max="100"
        class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums focus:border-blue-500 focus:outline-none"
        value={app.otherStartAge}
        oninput={(e) => {
          const n = Number(e.currentTarget.value);
          if (n >= 18 && n <= 100) app.otherStartAge = Math.round(n);
        }}
      />
    </div>
  </div>

  <details class="group rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
    <summary class="cursor-pointer select-none text-xs font-medium text-slate-600">
      Assumptions
      <span class="font-normal text-slate-400">
        · {app.stockPct}% stocks · withdraw {fmtPct(swrNow, 2)} · {fmtPct(app.realReturn)} growth · tax {fmtPct(app.taxRate, 0)}
      </span>
    </summary>
    <div class="mt-3 space-y-3 text-xs text-slate-600">
      <label class="block space-y-1">
        <span class="flex justify-between"><span>Stocks in your portfolio</span><b class="tabular-nums">{app.stockPct}%</b></span>
        <input type="range" min="0" max="100" step="5" class="w-full accent-blue-600" bind:value={app.stockPct} />
        <span class="block text-[11px] text-slate-400">The rest is 10-year Treasuries. Drives both growth and the withdrawal rate.</span>
      </label>

      <div class="space-y-1">
        <span class="flex justify-between">
          <span>Withdrawal rate</span>
          <b class="tabular-nums">{app.swrFixed === null ? `historical (${fmtPct(swrNow, 2)} now)` : fmtPct(app.swrFixed, 2)}</b>
        </span>
        <div class="flex items-center gap-2">
          <select
            class="rounded-md border border-slate-300 bg-white px-2 py-1"
            value={app.swrFixed === null ? 'auto' : 'fixed'}
            onchange={(e) => (app.swrFixed = e.currentTarget.value === 'auto' ? null : 0.04)}
          >
            <option value="auto">Historical, by retirement length</option>
            <option value="fixed">Fixed</option>
          </select>
          {#if app.swrFixed !== null}
            <input
              type="range"
              min="0.025"
              max="0.06"
              step="0.0025"
              class="flex-1 accent-blue-600"
              value={app.swrFixed}
              oninput={(e) => (app.swrFixed = Number(e.currentTarget.value))}
            />
          {/if}
        </div>
        {#if app.swrFixed === null}
          <label class="flex items-center justify-between gap-2">
            <span class="text-[11px] text-slate-400">Highest rate that ran out of money in at most</span>
            <select
              class="rounded-md border border-slate-300 bg-white px-1 py-0.5"
              value={String(app.maxFailure)}
              onchange={(e) => (app.maxFailure = Number(e.currentTarget.value))}
            >
              {#each [0, 0.01, 0.05, 0.1] as f (f)}
                <option value={String(f)}>{fmtPct(f, 0)}</option>
              {/each}
            </select>
          </label>
          <span class="block text-[11px] text-slate-400">of US retirements since 1871 of the same length.</span>
        {/if}
      </div>

      <div class="space-y-1">
        <span class="flex justify-between">
          <span>Growth while saving (real)</span>
          <b class="tabular-nums">{fmtPct(app.realReturn)}{app.returnFixed === null ? ' historical' : ''}</b>
        </span>
        <input
          type="range"
          min="0"
          max="0.08"
          step="0.0025"
          class="w-full accent-blue-600"
          value={app.realReturn}
          oninput={(e) => (app.returnFixed = Number(e.currentTarget.value))}
        />
        {#if app.returnFixed !== null}
          <button class="text-[11px] text-blue-600 hover:underline" onclick={() => (app.returnFixed = null)}>
            reset to historical ({fmtPct(app.historicalReturn)})
          </button>
        {/if}
      </div>

      <label class="block space-y-1">
        <span class="flex justify-between"><span>Plan to age</span><b class="tabular-nums">{app.planToAge}</b></span>
        <input type="range" min="85" max="105" step="1" class="w-full accent-blue-600" bind:value={app.planToAge} />
      </label>

      <label class="block space-y-1">
        <span class="flex justify-between"><span>Tax on withdrawals</span><b class="tabular-nums">{fmtPct(app.taxRate, 0)}</b></span>
        <input type="range" min="0" max="0.35" step="0.01" class="w-full accent-blue-600" bind:value={app.taxRate} />
        <span class="block text-[11px] text-slate-400">~10% for traditional 401(k)/IRA money; ~0% for Roth.</span>
      </label>

      <label class="flex cursor-pointer items-start gap-2">
        <input type="checkbox" class="mt-0.5 accent-blue-600" bind:checked={app.healthOn} />
        <span>
          Add health insurance
          <span class="block text-[11px] text-slate-400">
            Abroad ${defaults.health.abroad.under65}/${defaults.health.abroad.over65} a month per person (under/over 65);
            US ${defaults.health.us.under65}/${defaults.health.us.over65}.
          </span>
        </span>
      </label>
      <p class="text-[11px] text-slate-400">
        Years before income starts are funded like a bond ladder earning {fmtPct(BRIDGE_RATE)} real.
      </p>
    </div>
  </details>
</section>
