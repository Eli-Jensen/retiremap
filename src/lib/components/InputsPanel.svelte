<script lang="ts">
  import { app, defaults, fmtPct, fmtUsdCompact, BRIDGE_RATE, readHash, PERSONAS } from '../state.svelte.ts';
  import type { BucketKey } from '../math/plan.ts';
  import MoneyInput from './MoneyInput.svelte';

  const swrAt = $derived(app.assumptions.swr(app.planToAge - app.retireAge));
  const zeroIsDefault = (n: number) => (n === 0 ? null : n);
  const intoOptions: { key: BucketKey; label: string }[] = [
    { key: 'traditional', label: '401(k) / IRA' },
    { key: 'roth', label: 'Roth' },
    { key: 'brokerage', label: 'Brokerage' },
    { key: 'cash', label: 'Savings' },
  ];

  function ageInput(e: Event & { currentTarget: HTMLInputElement }, lo: number, hi: number, set: (n: number) => void) {
    const n = Number(e.currentTarget.value);
    if (n >= lo && n <= hi) set(Math.round(n));
  }

  function startOver() {
    if (confirm('Clear everything you entered and go back to the typical defaults?')) readHash('');
  }

  const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums focus:border-blue-500 focus:outline-none';
</script>

<section class="space-y-3">
  <div class="space-y-1">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">You</h2>
      <div class="flex rounded-lg border border-slate-300 p-0.5" role="radiogroup" aria-label="Start from typical numbers for">
        {#each PERSONAS as id (id)}
          <button
            role="radio"
            aria-checked={app.persona === id}
            class="rounded-md px-2 py-1 text-[11px] font-medium {app.persona === id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}"
            onclick={() => (app.persona = id)}>{defaults.personas[id].label}</button
          >
        {/each}
      </div>
    </div>
    <p class="text-[11px] text-slate-400">Starting numbers: {app.p.blurb}. Type over anything.</p>
  </div>

  <div class="grid grid-cols-3 gap-2">
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600" for="age">Age now</label>
      <input id="age" type="number" min="18" max="90" class={field} value={app.age} oninput={(e) => ageInput(e, 18, 90, (n) => (app.ageInput = n))} />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600" for="retire-age">Retire at</label>
      <input
        id="retire-age"
        type="number"
        min={app.age}
        max="100"
        class="{field} {app.retireAgeInput === null ? 'text-slate-500' : ''}"
        value={app.retireAge}
        oninput={(e) => ageInput(e, app.age, 100, (n) => (app.retireAgeInput = n))}
      />
    </div>
    <div class="space-y-1">
      <span class="text-xs font-medium text-slate-600">Household</span>
      <select class="{field} px-2" value={app.household} onchange={(e) => (app.householdInput = e.currentTarget.value as 'single' | 'couple')} aria-label="Household">
        <option value="single">Single</option>
        <option value="couple">Couple</option>
      </select>
    </div>
  </div>
  <p class="-mt-1 text-[11px] text-slate-400">
    {#if app.retireAgeInput === null}
      {app.persona === 'fire' ? 'Typical FIRE target: 46–50.' : 'Typical plan: 66 (Americans actually retire at 61 on average).'}
    {/if}
    {#if app.retireAge !== app.age}
      <button class="text-blue-600 hover:underline" onclick={() => (app.retireAgeInput = app.age)}>Retire today</button>
    {/if}
    {#if app.retireAgeInput !== null}
      <button class="ml-1 text-blue-600 hover:underline" onclick={() => (app.retireAgeInput = null)}>reset to typical</button>
    {/if}
  </p>
</section>

<section class="space-y-3">
  <div class="flex items-baseline justify-between">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Accounts</h2>
    <span class="text-xs tabular-nums text-slate-500">total <b class="text-slate-800">{fmtUsdCompact(app.netWorth)}</b></span>
  </div>
  <div class="grid grid-cols-2 gap-x-2 gap-y-3">
    <MoneyInput id="checking" label="Checking" value={app.checkingInput} fallback={app.checking} hint="typical" onchange={(v) => (app.checkingInput = v)} />
    <MoneyInput id="savings-acct" label="Savings / CDs" value={zeroIsDefault(app.savingsAcct)} fallback={0} onchange={(v) => (app.savingsAcct = v ?? 0)} />
    <MoneyInput id="trad" label="401(k) / IRA" value={app.traditionalInput} fallback={app.traditional} hint="typical" onchange={(v) => (app.traditionalInput = v)} />
    <MoneyInput id="roth" label="Roth 401(k) / IRA" value={zeroIsDefault(app.roth)} fallback={0} onchange={(v) => (app.roth = v ?? 0)} />
    <MoneyInput id="brokerage" label="Brokerage" value={app.brokerageInput} fallback={app.brokerage} hint="typical" onchange={(v) => (app.brokerageInput = v)} />
  </div>
  <p class="text-[11px] text-slate-400">
    Pre-tax 401(k)/IRA money is taxed when you withdraw it; Roth and cash aren't. Checking and savings earn nothing after
    inflation until you retire.
  </p>

  <div class="grid grid-cols-[1fr_8.5rem] items-end gap-2">
    <MoneyInput
      id="savings"
      label="Adding per year"
      value={app.savingsInput}
      fallback={app.annualSavings}
      hint="typical"
      suffix="/yr"
      onchange={(v) => (app.savingsInput = v)}
    />
    <label class="space-y-1">
      <span class="text-xs font-medium text-slate-600">into</span>
      <select class="{field} px-2" value={app.savingsTo} onchange={(e) => (app.savingsToInput = e.currentTarget.value as BucketKey)}>
        {#each intoOptions as o (o.key)}
          <option value={o.key}>{o.label}</option>
        {/each}
      </select>
    </label>
  </div>
</section>

<section class="space-y-3">
  <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Income in retirement</h2>
  <div class="grid grid-cols-[1fr_5.5rem] items-end gap-2">
    <MoneyInput id="ss" label="Social Security" value={app.ssInput} fallback={app.socialSecurity} hint="US average" suffix="/yr" onchange={(v) => (app.ssInput = v)} />
    <label class="space-y-1">
      <span class="text-xs font-medium text-slate-600">from age</span>
      <input type="number" min="62" max="70" class={field} value={app.ssStartAge} oninput={(e) => ageInput(e, 50, 75, (n) => (app.ssStartAge = n))} />
    </label>
  </div>
  <div class="grid grid-cols-[1fr_5.5rem] items-end gap-2">
    <MoneyInput id="other" label="Pension / rental / other" value={zeroIsDefault(app.otherIncome)} fallback={0} suffix="/yr" onchange={(v) => (app.otherIncome = v ?? 0)} />
    <label class="space-y-1">
      <span class="text-xs font-medium text-slate-600">from age</span>
      <input type="number" min="18" max="100" class={field} value={app.otherStartAge} oninput={(e) => ageInput(e, 18, 100, (n) => (app.otherStartAge = n))} />
    </label>
  </div>
</section>

<details class="group rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
  <summary class="cursor-pointer select-none text-xs font-medium text-slate-600">
    Assumptions
    <span class="font-normal text-slate-400">
      · {app.stockPct}% stocks · withdraw {fmtPct(swrAt, 2)} · {fmtPct(app.realReturn)} growth · tax {fmtPct(app.atRetirement.taxRate, 0)}
    </span>
  </summary>
  <div class="mt-3 space-y-3 text-xs text-slate-600">
    <label class="block space-y-1">
      <span class="flex justify-between"><span>Stocks in your portfolio</span><b class="tabular-nums">{app.stockPct}%</b></span>
      <input type="range" min="0" max="100" step="5" class="w-full accent-blue-600" value={app.stockPct} oninput={(e) => (app.stockInput = Number(e.currentTarget.value))} />
      <span class="block text-[11px] text-slate-400">The rest is 10-year Treasuries. Drives both growth and the withdrawal rate.</span>
    </label>

    <div class="space-y-1">
      <span class="flex justify-between">
        <span>Withdrawal rate</span>
        <b class="tabular-nums">{app.swrFixed === null ? `historical (${fmtPct(swrAt, 2)} at ${app.retireAge})` : fmtPct(app.swrFixed, 2)}</b>
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
          <input type="range" min="0.025" max="0.06" step="0.0025" class="flex-1 accent-blue-600" value={app.swrFixed} oninput={(e) => (app.swrFixed = Number(e.currentTarget.value))} />
        {/if}
      </div>
      {#if app.swrFixed === null}
        <label class="flex items-center justify-between gap-2">
          <span class="text-[11px] text-slate-400">Highest rate that ran out of money in at most</span>
          <select class="rounded-md border border-slate-300 bg-white px-1 py-0.5" value={String(app.maxFailure)} onchange={(e) => (app.maxFailure = Number(e.currentTarget.value))}>
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
      <input type="range" min="0" max="0.08" step="0.0025" class="w-full accent-blue-600" value={app.realReturn} oninput={(e) => (app.returnFixed = Number(e.currentTarget.value))} />
      {#if app.returnFixed !== null}
        <button class="text-[11px] text-blue-600 hover:underline" onclick={() => (app.returnFixed = null)}>reset to historical ({fmtPct(app.historicalReturn)})</button>
      {/if}
    </div>

    <label class="block space-y-1">
      <span class="flex justify-between"><span>Plan to age</span><b class="tabular-nums">{app.planToAge}</b></span>
      <input type="range" min="85" max="105" step="1" class="w-full accent-blue-600" bind:value={app.planToAge} />
    </label>

    <label class="block space-y-1">
      <span class="flex justify-between"><span>Tax on 401(k)/IRA withdrawals</span><b class="tabular-nums">{fmtPct(app.taxRate, 0)}</b></span>
      <input type="range" min="0" max="0.35" step="0.01" class="w-full accent-blue-600" bind:value={app.taxRate} />
    </label>
    <label class="block space-y-1">
      <span class="flex justify-between"><span>Tax on brokerage withdrawals</span><b class="tabular-nums">{fmtPct(app.brokerageTax, 0)}</b></span>
      <input type="range" min="0" max="0.25" step="0.01" class="w-full accent-blue-600" bind:value={app.brokerageTax} />
      <span class="block text-[11px] text-slate-400">
        0% long-term gains tax up to $49,450 of taxable income ($98,900 couples). Blended by balance, your withdrawals at
        {app.retireAge} are taxed {fmtPct(app.atRetirement.taxRate, 1)}.
      </span>
    </label>

    <label class="flex cursor-pointer items-start gap-2">
      <input type="checkbox" class="mt-0.5 accent-blue-600" bind:checked={app.healthOn} />
      <span>
        Add health insurance
        <span class="block text-[11px] text-slate-400">
          Abroad ${defaults.health.abroad.under65}/${defaults.health.abroad.over65} a month per person (under/over 65); US
          ${defaults.health.us.under65}/${defaults.health.us.over65}.
        </span>
      </span>
    </label>
    <p class="text-[11px] text-slate-400">Years before income starts are funded like a bond ladder earning {fmtPct(BRIDGE_RATE)} real.</p>
  </div>
</details>

<p class="text-[11px] text-slate-400">
  Saved in this browser only — nothing leaves your device.
  <button class="text-blue-600 hover:underline" onclick={startOver}>Start over</button>
</p>
