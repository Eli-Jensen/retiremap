<script lang="ts">
  import { app, meta } from '../state.svelte.ts';
  import { RAMP } from '../math/color.ts';

  const gradient = `linear-gradient(to right, ${RAMP.join(', ')})`;
  const labels = $derived(
    app.view === 'reverse'
      ? { left: 'comfortably affordable', mid: 'break-even', right: 'out of reach' }
      : { left: '½× your cost', mid: 'same', right: '2×+ your cost' },
  );
</script>

<div class="pointer-events-auto w-64 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
  <div class="h-2.5 rounded-full" style="background: {gradient}"></div>
  <div class="mt-1 flex justify-between text-[10px] text-slate-500">
    <span>{labels.left}</span>
    <span>{labels.mid}</span>
    <span>{labels.right}</span>
  </div>
  <p class="mt-1.5 text-[10px] text-slate-400">Numbeo snapshot {meta.snapshotDate} · {meta.cityCount} cities · BLS CE 2024</p>
</div>
