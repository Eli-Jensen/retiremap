<script lang="ts">
  // Dollar input that shows a data-backed default until the user types.
  // Accepts "250k", "1.2m", "1,200,000".
  let {
    id,
    label,
    value,
    fallback,
    hint = '',
    suffix = '',
    onchange,
  }: {
    id: string;
    label: string;
    value: number | null;
    fallback: number;
    hint?: string;
    suffix?: string;
    onchange: (v: number | null) => void;
  } = $props();

  const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
  let focused = $state(false);
  let draft = $state('');
  const shown = $derived(focused ? draft : fmt(value ?? fallback));

  function parse(s: string): number | null {
    const m = s.trim().toLowerCase().replace(/[$,\s]/g, '').match(/^(\d*\.?\d+)([km]?)$/);
    if (!m) return null;
    return Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1);
  }
</script>

<div class="space-y-1">
  <label class="block truncate text-xs font-medium text-slate-600" for={id} title={label}>{label}</label>
  <div class="relative">
    <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
    <input
      {id}
      type="text"
      inputmode="decimal"
      autocomplete="off"
      class="w-full rounded-lg border bg-white py-2 pl-7 pr-10 text-sm tabular-nums focus:border-blue-500 focus:outline-none {value === null
        ? 'border-slate-200 text-slate-500'
        : 'border-slate-300 text-slate-900'}"
      value={shown}
      onfocus={() => {
        draft = fmt(value ?? fallback);
        focused = true;
      }}
      onblur={() => (focused = false)}
      oninput={(e) => {
        draft = e.currentTarget.value;
        const n = parse(draft);
        if (n !== null) onchange(n);
      }}
      onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
    {#if suffix}
      <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>
    {/if}
  </div>
  {#if value !== null}
    <button class="text-[11px] text-blue-600 hover:underline" onclick={() => onchange(null)}>reset to typical</button>
  {:else if hint}
    <p class="text-[11px] leading-tight text-slate-400">{hint}</p>
  {/if}
</div>
