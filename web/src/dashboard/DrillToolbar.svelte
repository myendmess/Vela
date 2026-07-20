<script>
  import { ui, currentIndex } from './store.svelte.js';
  import { drillBack, drillReset, drillToSector } from './actions.js';
  import { METRICS, legendEndpoints } from '../lib/metrics.js';
  import { LEGEND_GRADIENT } from '../lib/color.js';

  const idx = $derived.by(() => {
    void ui.registryVersion;
    void ui.indexId;
    return currentIndex();
  });
  const ends = $derived(legendEndpoints(ui.metric));

  // UI-6: freshness stamp from the dataset's Last-Modified header;
  // shows nothing when the header is absent or unparseable.
  const stamp = $derived.by(() => {
    if (!ui.lastModified) return '';
    const d = new Date(ui.lastModified);
    if (isNaN(d.getTime())) return '';
    return 'Data: ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + ', close';
  });
</script>

<!-- UI-5: slim drill toolbar — path + back button + legend (moved from footer) -->
<div class="shrink-0 flex items-center gap-2 md:gap-3 px-2 md:px-4 py-0.5 border-b border-[#1e222d] text-xs">
  <button
    type="button"
    aria-label={ui.drill?.industry ? 'Back to sector' : 'Back to full map'}
    disabled={!ui.drill}
    onclick={drillBack}
    class="min-w-11 min-h-11 flex items-center justify-center rounded-md text-lg leading-none cursor-pointer text-slate-300 hover:bg-[#1a2030] disabled:opacity-30 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-amber-400">‹</button>

  <nav class="flex items-center gap-1 min-w-0 whitespace-nowrap overflow-hidden" aria-label="Drill path">
    {#if ui.drill}
      <button
        type="button"
        onclick={drillReset}
        class="text-slate-400 hover:text-amber-400 cursor-pointer truncate focus-visible:outline-2 focus-visible:outline-amber-400">{idx?.label ?? ''}</button>
      <span class="text-slate-500 shrink-0">›</span>
      {#if ui.drill.industry}
        <button
          type="button"
          onclick={() => drillToSector(ui.drill.sector)}
          class="text-slate-400 hover:text-amber-400 cursor-pointer truncate focus-visible:outline-2 focus-visible:outline-amber-400">{ui.drill.sector}</button>
        <span class="text-slate-500 shrink-0">›</span>
        <span class="text-slate-200 font-semibold truncate">{ui.drill.industry}</span>
      {:else}
        <span class="text-slate-200 font-semibold truncate">{ui.drill.sector}</span>
      {/if}
    {:else}
      <span class="text-slate-200 font-semibold truncate">{idx?.label ?? ''}</span>
    {/if}
  </nav>

  {#if stamp}
    <span class="hidden sm:inline text-slate-400 shrink-0">{stamp}</span>
  {/if}

  <div class="flex items-center gap-2 ml-auto shrink-0 text-[11px] text-slate-400">
    <span class="tnum">{ends.lo}</span>
    <span class="w-24 md:w-40 h-2.5 rounded" style="background:{LEGEND_GRADIENT}"></span>
    <span class="tnum">{ends.hi}</span>
    <span class="hidden md:inline">color = {METRICS[ui.metric].label}</span>
  </div>
</div>
