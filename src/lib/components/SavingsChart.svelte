<script lang="ts">
  // Projected savings from today to your retirement age, stacked by tax
  // treatment, so you can eyeball whether your inputs are plausible.
  import { app, fmtUsd, fmtUsdCompact, fmtPct } from '../state.svelte.ts';
  import type { Buckets } from '../math/plan.ts';

  // Three groups by how withdrawals are taxed; validated categorical slots
  // (dataviz palette 1, 3, 2 — adjacent pairs pass CVD separation).
  const GROUPS = [
    { key: 'deferred', label: 'Tax-deferred', note: 'Traditional 401(k)/IRA', color: '#2a78d6', of: (b: Buckets) => b.traditional },
    { key: 'free', label: 'Tax-free', note: 'Roth, HSA', color: '#1baf7a', of: (b: Buckets) => b.roth + b.hsa },
    { key: 'taxable', label: 'Taxable', note: 'Brokerage, cash', color: '#eb6834', of: (b: Buckets) => b.brokerage + b.cash },
  ] as const;

  type Year = { age: number; groups: number[]; total: number; added: number; growth: number };

  const years: Year[] = $derived.by(() => {
    const rows = app.projection.slice(0, Math.max(1, app.retireAge - app.age + 1));
    return rows.map((r, i) => {
      const next = app.projection[i + 1];
      const added = next ? next.contributed - r.contributed : 0;
      return {
        age: r.age,
        groups: GROUPS.map((g) => g.of(r.buckets)),
        total: r.portfolio,
        added,
        growth: next ? next.portfolio - r.portfolio - added : 0,
      };
    });
  });
  const last = $derived(years[years.length - 1]);
  const first = $derived(years[0]);
  const contributedTotal = $derived(app.atRetirement.contributed);
  const growthTotal = $derived(last.total - first.total - contributedTotal);
  const savingRate = $derived(app.householdIncome > 0 ? app.thisYear.wanted / app.householdIncome : 0);

  // --- geometry ---
  let width = $state(320);
  const H = 150;
  const PAD = { l: 38, r: 4, t: 8, b: 18 };
  const plotW = $derived(Math.max(10, width - PAD.l - PAD.r));
  const plotH = H - PAD.t - PAD.b;
  const max = $derived(Math.max(...years.map((y) => y.total), 1));
  const ticks = $derived(niceTicks(max));
  const yMax = $derived(ticks[ticks.length - 1]);
  const slot = $derived(plotW / years.length);
  const barW = $derived(Math.min(24, Math.max(1.5, slot - 2))); // 2px air between columns
  const x = (i: number) => PAD.l + i * slot + (slot - barW) / 2;
  const y = (v: number) => PAD.t + plotH * (1 - v / yMax);

  /** 0, step, 2·step… up to the first tick at or above v (3–4 gridlines). */
  function niceTicks(v: number): number[] {
    const raw = v / 3;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
    const out = [0];
    while (out[out.length - 1] < v) out.push(out[out.length - 1] + step);
    return out;
  }

  // Age labels every 5 years (or ~6 labels), always including the ends.
  const ageTicks = $derived.by(() => {
    const n = years.length;
    const every = n <= 12 ? 2 : n <= 30 ? 5 : 10;
    return years.map((yr, i) => ({ i, age: yr.age })).filter((t) => t.i === 0 || t.i === n - 1 || (t.age % every === 0 && t.i > 1 && t.i < n - 2));
  });

  let hover = $state<number | null>(null);
  // A new projection (any input change) invalidates the hovered year — and on
  // touch screens a tap never "leaves", so don't let a stale tooltip linger.
  $effect(() => {
    void years;
    hover = null;
  });
  function onMove(e: PointerEvent & { currentTarget: SVGSVGElement }) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.floor((px - PAD.l) / slot);
    hover = i >= 0 && i < years.length ? i : null;
  }
</script>

<section id="savings-chart" class="space-y-2">
  <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Your savings, year by year</h2>

  {#if years.length <= 1}
    <p class="text-xs text-slate-500">You're retiring today with {fmtUsdCompact(first.total)} — nothing more to project.</p>
  {:else}
    <div class="grid grid-cols-3 gap-2 text-center">
      <div class="rounded-lg bg-slate-50 px-1 py-1.5">
        <div class="text-sm font-semibold tabular-nums text-slate-900">{fmtUsdCompact(last.total)}</div>
        <div class="text-[10px] leading-tight text-slate-500">at {last.age}</div>
      </div>
      <div class="rounded-lg bg-slate-50 px-1 py-1.5">
        <div class="text-sm font-semibold tabular-nums text-slate-900">{fmtUsdCompact(contributedTotal)}</div>
        <div class="text-[10px] leading-tight text-slate-500">you put in</div>
      </div>
      <div class="rounded-lg bg-slate-50 px-1 py-1.5">
        <div class="text-sm font-semibold tabular-nums text-slate-900">{fmtUsdCompact(growthTotal)}</div>
        <div class="text-[10px] leading-tight text-slate-500">market growth</div>
      </div>
    </div>

    <div class="relative" bind:clientWidth={width}>
      <svg
        viewBox="0 0 {width} {H}"
        width={width}
        height={H}
        role="img"
        aria-label="Projected savings from {first.age} to {last.age}: {fmtUsdCompact(first.total)} to {fmtUsdCompact(last.total)}"
        onpointermove={onMove}
        onpointerleave={() => (hover = null)}
      >
        {#each ticks as t (t)}
          <line x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#c3c2b7' : '#e1e0d9'} stroke-width="1" />
          <text x={PAD.l - 4} y={y(t) + 3} text-anchor="end" class="fill-slate-400 text-[9px] tabular-nums">{t === 0 ? '0' : fmtUsdCompact(t)}</text>
        {/each}
        {#each years as yr, i (yr.age)}
          {@const tops = yr.groups.map((_, g) => yr.groups.slice(0, g + 1).reduce((a, b) => a + b, 0))}
          <g opacity={hover === null || hover === i ? 1 : 0.45}>
            {#each GROUPS as g, gi (g.key)}
              {@const v0 = gi === 0 ? 0 : tops[gi - 1]}
              {@const v1 = tops[gi]}
              {#if v1 - v0 > 0}
                {@const isTop = gi === GROUPS.length - 1 || tops.slice(gi + 1).every((t) => t === v1)}
                {@const h = Math.max(0, y(v0) - y(v1) - (gi > 0 && v0 > 0 ? 1 : 0))}
                <rect
                  x={x(i)}
                  y={y(v1)}
                  width={barW}
                  height={h}
                  fill={g.color}
                  rx={isTop && barW >= 6 ? 2 : 0}
                />
              {/if}
            {/each}
          </g>
        {/each}
        {#each ageTicks as t (t.i)}
          <text x={x(t.i) + barW / 2} y={H - 4} text-anchor="middle" class="fill-slate-400 text-[9px] tabular-nums">{t.age}</text>
        {/each}
      </svg>

      {#if hover !== null && years[hover]}
        {@const yr = years[hover]}
        <div
          class="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border border-slate-200 bg-white/95 p-2 text-[11px] shadow-lg"
          style="left: {Math.min(Math.max(0, x(hover) - 88), width - 176)}px"
        >
          <div class="mb-1 font-semibold text-slate-900">Age {yr.age} · {fmtUsd(yr.total)}</div>
          {#each GROUPS as g, gi (g.key)}
            <div class="flex justify-between gap-2 text-slate-600">
              <span class="flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-sm" style="background:{g.color}"></span>{g.label}</span>
              <span class="tabular-nums">{fmtUsdCompact(yr.groups[gi])}</span>
            </div>
          {/each}
          {#if hover < years.length - 1}
            <div class="mt-1 border-t border-slate-100 pt-1 text-slate-500">
              This year: +{fmtUsdCompact(yr.added)} saved, {yr.growth >= 0 ? '+' : ''}{fmtUsdCompact(yr.growth)} growth
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <ul class="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
      {#each GROUPS as g (g.key)}
        <li class="flex items-center gap-1" title={g.note}>
          <span class="inline-block h-2.5 w-2.5 rounded-sm" style="background:{g.color}"></span>{g.label}
          <span class="text-slate-400">({g.note})</span>
        </li>
      {/each}
    </ul>

    <p class="text-[11px] leading-snug text-slate-500">
      Today's dollars. You save {fmtPct(savingRate, 0)} of income now
      <span class="text-slate-400">(typical: 46% for FIRE savers, 12% for most Americans)</span>, rising
      {fmtPct(app.contributionGrowth, 1)}/yr, and investments grow {fmtPct(app.realReturn, 1)}/yr after inflation.
      {#if growthTotal > contributedTotal}More than half of it would be market growth — check that return assumption.{/if}
    </p>

    <details class="text-xs text-slate-600">
      <summary class="cursor-pointer select-none text-slate-500 hover:text-slate-700">Year-by-year table</summary>
      <div class="mt-1.5 max-h-64 overflow-y-auto">
        <table class="w-full text-[11px] tabular-nums">
          <thead class="sticky top-0 bg-white text-slate-400">
            <tr><th class="py-0.5 text-left font-medium">Age</th><th class="text-right font-medium">Saved</th><th class="text-right font-medium">Growth</th><th class="text-right font-medium">Balance</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            {#each years as yr, i (yr.age)}
              <tr>
                <td class="py-0.5">{yr.age}</td>
                <td class="text-right">{i < years.length - 1 ? fmtUsdCompact(yr.added) : '—'}</td>
                <td class="text-right">{i < years.length - 1 ? fmtUsdCompact(yr.growth) : '—'}</td>
                <td class="text-right font-medium text-slate-900">{fmtUsdCompact(yr.total)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="mt-1 text-[10px] text-slate-400">Balance at the start of each year; savings land at year end.</p>
    </details>
  {/if}
</section>
