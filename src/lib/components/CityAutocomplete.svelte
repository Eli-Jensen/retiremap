<script lang="ts">
  import { cities, cityLabel, flagEmoji } from '../state.svelte.ts';
  import type { CityRecord } from '../types.ts';

  let { selectedId = null, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void } = $props();

  let query = $state('');
  let open = $state(false);
  let highlighted = $state(0);
  let inputEl = $state<HTMLInputElement>();

  const fold = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const selected = $derived(selectedId ? cities.find((c) => c.id === selectedId) : null);

  const matches: CityRecord[] = $derived.by(() => {
    const q = fold(query.trim());
    if (!q) return [];
    return cities
      .filter((c) => fold(cityLabel(c)).includes(q))
      .sort((a, b) => {
        const aStarts = fold(a.name).startsWith(q) ? 0 : 1;
        const bStarts = fold(b.name).startsWith(q) ? 0 : 1;
        return aStarts - bStarts || (b.pop ?? 0) - (a.pop ?? 0);
      })
      .slice(0, 8);
  });

  function choose(c: CityRecord) {
    onSelect(c.id);
    query = '';
    open = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open || matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlighted = (highlighted + 1) % matches.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlighted = (highlighted - 1 + matches.length) % matches.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(matches[highlighted]);
    } else if (e.key === 'Escape') {
      open = false;
    }
  }

  $effect(() => {
    void matches;
    highlighted = 0;
  });
</script>

<div class="relative">
  {#if selected}
    <div class="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
      <span>{flagEmoji(selected.iso2)}</span>
      <span class="flex-1 truncate font-medium">{cityLabel(selected)}</span>
      <button
        class="text-slate-400 hover:text-slate-700"
        title="Clear home city (use US average)"
        onclick={() => {
          onSelect(null);
          setTimeout(() => inputEl?.focus(), 0);
        }}>✕</button
      >
    </div>
  {:else}
    <input
      bind:this={inputEl}
      bind:value={query}
      onfocus={() => (open = true)}
      oninput={() => (open = true)}
      onblur={() => setTimeout(() => (open = false), 150)}
      onkeydown={onKeydown}
      placeholder="Your city (or nearest big city)…"
      class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder-slate-400 focus:border-blue-500 focus:outline-none"
    />
    {#if open && matches.length > 0}
      <ul class="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
        {#each matches as c, i (c.id)}
          <li>
            <button
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm {i === highlighted ? 'bg-blue-50' : ''}"
              onmousedown={(e) => {
                e.preventDefault();
                choose(c);
              }}
              onmouseenter={() => (highlighted = i)}
            >
              <span>{flagEmoji(c.iso2)}</span>
              <span class="truncate">{cityLabel(c)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else if open && query.trim() && matches.length === 0}
      <div class="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-lg">
        Not covered — only the 554 cities with Numbeo data are available.
      </div>
    {/if}
  {/if}
</div>
