<script lang="ts">
  import { app, meta, defaults, fmtPct, BRIDGE_RATE } from '../state.svelte.ts';
  import { TIERS } from '../math/tiers.ts';
  import { MIN_HORIZON, MAX_HORIZON } from '../math/swr.ts';

  type Src = { label: string; url: string };
  const sources = defaults.sources as Record<string, Src>;
  type Row = { input: string; value: string; note: string; src: string[] };
  const k = (n: number) => `$${Math.round(n / 1000)}k`;
  const personaRows = (id: 'fire' | 'typical'): Row[] => {
    const p = defaults.personas[id];
    const at = (b: { value: number }[]) => (b.length === 1 ? k(b[0].value) : 'by age');
    return [
      { input: 'Who', value: `${p.age}, ${p.household}, retire at ${p.retireAge}`, note: p.notes.who, src: [] },
      { input: '401(k) / IRA · brokerage', value: `${at(p.retirementByAge)} · ${at(p.brokerageByAge)}`, note: p.notes.invested, src: [] },
      { input: 'Checking', value: at(p.cashByAge), note: p.notes.cash, src: [] },
      { input: 'Income', value: p.income.partner > 0 ? `${k(p.income.you)} + ${k(p.income.partner)}` : k(p.income.you), note: p.notes.income, src: [] },
      { input: 'Saving per year', value: `${Math.round(Object.values(p.contributionPct).reduce((a, b) => a + b, 0) * 100)}% of income`, note: p.notes.savings, src: [] },
      { input: 'Stocks', value: `${p.stockPct}%`, note: p.notes.stocks, src: [] },
    ];
  };
  const shared: Row[] = [
    { input: 'Social Security', value: `from income, at ${defaults.socialSecurity.startAge}`, note: defaults.socialSecurity.estimateNote, src: ['ssaBend', 'ssaCbb'] },
    { input: 'Started working', value: `age ${defaults.careerStartAge.value}`, note: defaults.careerStartAge.note, src: [] },
    { input: 'Contribution limits', value: `$${(defaults.limits.k401 / 1000).toFixed(1)}k 401(k) · $${(defaults.limits.ira / 1000).toFixed(1)}k IRA · $${(defaults.limits.hsaSelf / 1000).toFixed(1)}k/$${(defaults.limits.hsaFamily / 1000).toFixed(2)}k HSA`, note: defaults.limits.note, src: defaults.limits.sources },
    { input: 'Raises', value: fmtPct(defaults.contributionGrowth.value, 2) + '/yr real', note: defaults.contributionGrowth.note, src: ['ssaTrustees'] },
    { input: 'Plan to age', value: String(defaults.planToAge.value), note: defaults.planToAge.note, src: ['ssaLife'] },
    { input: 'Tax on 401(k)/IRA withdrawals', value: fmtPct(defaults.taxRate.value, 0), note: defaults.taxRate.note, src: ['irs'] },
    { input: 'Tax on brokerage withdrawals', value: fmtPct(defaults.brokerageTax.value, 0), note: defaults.brokerageTax.note, src: ['irs'] },
    { input: 'Cash growth', value: '0% real', note: defaults.cashReturn.note, src: [] },
    { input: 'Health, abroad', value: `$${defaults.health.abroad.under65} / $${defaults.health.abroad.over65}`, note: defaults.health.abroad.note, src: ['ici'] },
    { input: 'Health, US', value: `$${defaults.health.us.under65} / $${defaults.health.us.over65}`, note: defaults.health.us.note, src: defaults.health.us.sources },
  ];
  const tables: { title: string; rows: Row[]; src: string[] }[] = [
    { title: `Starting point: ${defaults.personas.fire.label} (default)`, rows: personaRows('fire'), src: defaults.personas.fire.sources },
    { title: `Starting point: ${defaults.personas.typical.label}`, rows: personaRows('typical'), src: defaults.personas.typical.sources },
    { title: 'Everyone', rows: shared, src: [] },
  ];
  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (app.methodsOpen) dialog?.showModal();
    else dialog?.close();
  });
</script>

<dialog
  bind:this={dialog}
  onclose={() => (app.methodsOpen = false)}
  class="m-auto max-h-[90vh] w-[min(46rem,calc(100vw-2rem))] rounded-xl border border-slate-200 p-0 text-sm leading-relaxed text-slate-700 shadow-2xl backdrop:bg-slate-900/40"
>
  <div class="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
    <h2 class="font-bold text-slate-900">How this works</h2>
    <button class="text-slate-400 hover:text-slate-700" aria-label="Close" onclick={() => (app.methodsOpen = false)}>✕</button>
  </div>
  <div class="space-y-5 px-5 py-4">
    <section class="space-y-2">
      <h3 class="font-semibold text-slate-900">Lifestyle tiers are relative to locals</h3>
      <p>
        Each tier compares what you'd spend each month (excluding health insurance) with what an average local takes home —
        or, where pay doesn't cover it, with what one person typically spends there before rent. Couples count as 1.5
        adults (the OECD equivalence scale).
      </p>
      <table class="w-full text-xs">
        <tbody class="divide-y divide-slate-100">
          {#each TIERS as t, i (t.id)}
            <tr>
              <td class="py-1 pr-3 font-medium text-slate-900">{t.label}</td>
              <td class="py-1 pr-3 tabular-nums">{i === 0 ? `< ${TIERS[1].min}×` : i === TIERS.length - 1 ? `≥ ${t.min}×` : `${t.min}–${TIERS[i + 1].min}×`}</td>
              <td class="py-1 text-slate-500">{t.blurb}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="text-xs text-slate-500">
        The {TIERS[1].min}× floor is the median minimum-to-average wage ratio across 33 OECD countries in 2024
        (<a class="text-blue-600 underline" href={sources.oecdMinWage.url} target="_blank" rel="noreferrer">OECD</a>). The steps above it
        double, which is a judgment call.
      </p>
      <p>
        Local salaries are Numbeo's average monthly net salary. Numbeo defines purchasing power as salary divided by the
        cost of a cost-of-living-plus-rent basket, relative to New York
        (<a class="text-blue-600 underline" href={sources.numbeoMethod.url} target="_blank" rel="noreferrer">methodology</a>),
        so salary = NYC salary × purchasing power × COL+rent index. Anchored to New York's ${meta.salaryAnchor.nycNet.toLocaleString()}
        and calibrated on 11 hand-checked cities, it matches Numbeo's published salaries within {fmtPct(meta.salaryAnchor.meanAbsError)}
        on average.
      </p>
    </section>

    <section class="space-y-2">
      <h3 class="font-semibold text-slate-900">How much you need</h3>
      <p>
        Everything is in today's dollars. The savings you need to retire at age <i>A</i> have two parts:
      </p>
      <ul class="list-disc space-y-1 pl-5">
        <li>
          <b>The long-run gap</b> (spending + health insurance − Social Security − other income, grossed up for tax), divided
          by a safe withdrawal rate for a retirement lasting from <i>A</i> to your plan-to age.
        </li>
        <li>
          <b>A bridge</b> for the years before your income starts and before Medicare-age health prices, priced like a bond
          ladder earning the historical real return of 10-year Treasuries ({fmtPct(BRIDGE_RATE)}).
        </li>
      </ul>
      <p>
        <b>Withdrawal rate.</b> By default it's the highest rate that ran out of money in at most
        {fmtPct(app.maxFailure, 0)} of US retirements of the same length since 1871, using monthly stock (Shiller) and
        10-year Treasury (FRED) returns. At {app.stockPct}% stocks it falls from {fmtPct(app.swrTable.rate(30), 2)} for a 30-year retirement to {fmtPct(app.swrTable.rate(50), 2)} for 50 years.
        Past ~57 years the raw number ticks back up because the worst 1960s–70s starts drop out of the data, so longer
        retirements keep the lowest rate of any shorter one. Rates are tabulated for
        {MIN_HORIZON}–{MAX_HORIZON}-year retirements, using the same engine as a replication of the 1998 Trinity study.
      </p>
      <p>
        <b>Accounts.</b> Invested accounts grow at the historical real return of your stock/bond mix
        ({fmtPct(app.historicalReturn)} at {app.stockPct}% stocks); checking and savings just keep up with inflation. What you
        add each year goes into the account you pick. Once you retire, everything is drawn down pro rata, so the tax on
        withdrawals is a blend: your 401(k)/IRA rate on that share, your brokerage rate on that share, nothing on Roth and cash.
      </p>
      <p>
        <b>When.</b> For each city and tier, the first year your projected savings cover what you'd need to retire that year.
        <b>Retire at</b> shows the tier your projected savings buy at the age you choose.
      </p>
    </section>

    <section class="space-y-2">
      <h3 class="font-semibold text-slate-900">Defaults and where they come from</h3>
      <p class="text-xs text-slate-500">
        Pick a starting point under "You"; anything you type overrides it. The FIRE numbers come from the only repeated
        survey of the FIRE community, a self-selected (mostly male, tech-heavy, high-income) Reddit sample.
      </p>
      {#each tables as t (t.title)}
        <h4 class="pt-1 text-xs font-semibold text-slate-800">
          {t.title}
          {#each t.src as key (key)}
            <a class="ml-1 font-normal text-blue-600 underline" href={sources[key].url} target="_blank" rel="noreferrer">[{sources[key].label}]</a>
          {/each}
        </h4>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <tbody class="divide-y divide-slate-100 align-top">
              {#each t.rows as row (row.input)}
                <tr>
                  <td class="w-40 py-1.5 pr-3 font-medium text-slate-900">{row.input}</td>
                  <td class="whitespace-nowrap py-1.5 pr-3 tabular-nums">{row.value}</td>
                  <td class="py-1.5 text-slate-600">
                    {row.note}
                    {#each row.src as key (key)}
                      <a class="ml-1 text-blue-600 underline" href={sources[key].url} target="_blank" rel="noreferrer">[{sources[key].label}]</a>
                    {/each}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/each}
    </section>

    <section class="space-y-2">
      <h3 class="font-semibold text-slate-900">Not modeled</h3>
      <ul class="list-disc space-y-1 pl-5">
        <li>Visas and residency rules — many countries require a minimum income or deposit.</li>
        <li>Exchange-rate swings. Numbeo prices are converted to dollars at the snapshot date.</li>
        <li>US citizens owe US tax on withdrawals wherever they live; local taxes may add to it.</li>
        <li>Numbeo data is crowd-sourced and skews toward expat-style spending in some cities.</li>
        <li>
          The 10% penalty on 401(k)/IRA withdrawals before 59½. Early retirees usually avoid it (72(t) payments, a Roth
          conversion ladder, the rule of 55), so it isn't charged.
        </li>
      </ul>
    </section>

    <section class="space-y-1 text-xs text-slate-500">
      <h3 class="font-semibold text-slate-900">Data</h3>
      <p>
        Cost of living and quality of life:
        <a class="text-blue-600 underline" href="https://www.numbeo.com/cost-of-living/" target="_blank" rel="noreferrer">Numbeo</a>
        snapshot {meta.snapshotDate}, {meta.cityCount} cities. Coordinates:
        <a class="text-blue-600 underline" href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> (CC BY 4.0). Regions:
        <a class="text-blue-600 underline" href={sources.m49.url} target="_blank" rel="noreferrer">UN M49</a>, plus the EU and a
        conventional Middle East. Market history: <a class="text-blue-600 underline" href={sources.shiller.url} target="_blank" rel="noreferrer">Shiller</a>,
        <a class="text-blue-600 underline" href={sources.fredGs10.url} target="_blank" rel="noreferrer">FRED GS10</a>. Map:
        <a class="text-blue-600 underline" href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>, © OpenMapTiles,
        © OpenStreetMap contributors.
      </p>
      <p>Not financial advice. Everything runs in your browser; nothing you type leaves it.</p>
    </section>
  </div>
</dialog>
