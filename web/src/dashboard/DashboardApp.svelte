<script>
  import { ui, getRows, currentIndex } from './store.svelte.js';
  import { retryLoad } from './actions.js';
  import { METRICS } from '../lib/metrics.js';
  import HeaderBar from './HeaderBar.svelte';
  import DrillToolbar from './DrillToolbar.svelte';
  import Treemap from './Treemap.svelte';
  import TreemapSkeleton from './TreemapSkeleton.svelte';
  import ErrorCard from '../lib/ErrorCard.svelte';
  import StockInspector from './StockInspector.svelte';
  import InspectorSheet from './InspectorSheet.svelte';
  import FirstVisitHint from './FirstVisitHint.svelte';

  const statusText = $derived.by(() => {
    if (ui.status === 'loading') return 'Loading…';
    if (ui.status === 'error') return ui.errorMsg;
    void ui.dataVersion;
    void ui.registryVersion;
    const label = currentIndex()?.label ?? '';
    return `${label} · ${getRows().length} names · color = ${METRICS[ui.metric].label}`;
  });
</script>

<div class="flex h-full flex-col overflow-hidden">
  <HeaderBar />
  <DrillToolbar />

  <!-- workspace: mobile = full-height map (sheet overlays); md–lg = stacked
       scroll (map 55dvh + inspector below, as before); lg+ = map 75% / sidebar 25% -->
  <main class="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-4 gap-2 px-3 py-2 overflow-hidden md:overflow-y-auto lg:overflow-hidden">
    <section
      class="relative flex-1 min-h-0 md:flex-none md:h-[55dvh] lg:h-auto lg:col-span-3 rounded-lg border border-[#1e222d] overflow-hidden bg-[#0a0b0f]"
      aria-label="Market treemap">
      {#if ui.status === 'error'}
        <!-- UI-4: error card with message, Retry, and a link back to the globe -->
        <ErrorCard detail={ui.errorMsg} onretry={retryLoad}>
          <div class="mt-3">
            <a href="../" class="text-xs text-slate-400 hover:text-amber-400 focus-visible:outline-2 focus-visible:outline-amber-400">← Back to globe</a>
          </div>
        </ErrorCard>
      {:else}
        {#if ui.dataVersion > 0}
          <Treemap />
        {/if}
        {#if ui.status === 'loading'}
          <div class="absolute inset-0 z-10"><TreemapSkeleton /></div>
        {/if}
        {#if ui.status === 'ready'}
          <FirstVisitHint />
        {/if}
      {/if}
    </section>

    <aside
      class="hidden md:flex min-h-[24rem] lg:min-h-0 lg:col-span-1 rounded-lg border border-[#1e222d] bg-[#11131a] flex-col overflow-hidden"
      aria-label="Stock inspector">
      <StockInspector />
    </aside>
  </main>

  <footer class="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 border-t border-[#1e222d] text-[11px] text-slate-400">
    <span aria-live="polite">{statusText}</span>
    <span class="ml-auto">size = market cap · research only — not advice ·
      <a class="text-amber-400 hover:underline focus-visible:outline-2 focus-visible:outline-amber-400" href="https://myendmess.github.io" target="_blank" rel="noopener">myendmess.github.io</a></span>
  </footer>
</div>

{#if ui.isMobile}
  <InspectorSheet />
{/if}
