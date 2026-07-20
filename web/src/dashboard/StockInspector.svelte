<script>
  import { ui, findRow } from './store.svelte.js';
  import InspectorContent from './InspectorContent.svelte';

  const stock = $derived.by(() => {
    void ui.dataVersion;
    return ui.selectedTicker ? findRow(ui.selectedTicker) : null;
  });
</script>

{#if !stock}
  <div class="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm px-6 text-center">
    <span class="text-2xl">⌖</span>
    <p>Click a tile to inspect a stock.<br /><span class="text-xs">Click a sector title to isolate it.</span></p>
  </div>
{:else}
  <InspectorContent {stock} />
{/if}
