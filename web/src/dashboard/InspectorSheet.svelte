<script>
  // UI-1: mobile bottom-sheet inspector. Tap a tile → peek (~110px); drag up →
  // full (scrollable, same content as the desktop sidebar); swipe down / tap
  // map / Escape dismisses. Sheet mechanics live in lib/BottomSheet.svelte —
  // this wrapper supplies the stock-specific state and content.
  import { ui, findRow, currentIndex } from './store.svelte.js';
  import { dismissSheet } from './actions.js';
  import { metricVal, metricStr, metricTextColor } from '../lib/metrics.js';
  import Sparkline from '../lib/Sparkline.svelte';
  import BottomSheet from '../lib/BottomSheet.svelte';
  import InspectorContent from './InspectorContent.svelte';

  const stock = $derived.by(() => {
    void ui.dataVersion;
    return ui.selectedTicker ? findRow(ui.selectedTicker) : null;
  });
  const CUR = $derived.by(() => {
    void ui.registryVersion;
    void ui.indexId;
    return currentIndex()?.cur ?? '';
  });
  const v = $derived(stock ? metricVal(stock, ui.metric) : null);
</script>

{#if stock && ui.sheet !== 'closed'}
  <BottomSheet
    bind:sheet={ui.sheet}
    ondismiss={dismissSheet}
    escapeEnabled={!ui.searchOpen}
    ariaLabel="Stock inspector">
    {#snippet header()}
      <div class="px-4 pb-2">
        <div class="flex items-center gap-2">
          <span class="text-lg font-extrabold tracking-tight">{stock.ticker}</span>
          <span class="text-xl font-bold tnum">{stock.price != null ? CUR + stock.price.toFixed(2) : '—'}</span>
          <span class="text-sm font-semibold tnum" style="color:{metricTextColor(v, ui.metric)}">{metricStr(v, ui.metric)}</span>
          <span class="ml-auto"><Sparkline spark={stock.spark} w={80} h={22} /></span>
        </div>
        <div class="text-[11px] text-slate-400 truncate mt-0.5">{stock.name}</div>
      </div>
    {/snippet}
    <InspectorContent {stock} variant="sheet" />
  </BottomSheet>
{/if}
