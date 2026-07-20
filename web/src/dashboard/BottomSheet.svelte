<script>
  // UI-1: mobile bottom-sheet inspector. Tap a tile → peek (~110px); drag up →
  // full (scrollable, same content as the desktop sidebar); swipe down / tap
  // map / Escape dismisses. Plain pointer events + CSS transforms, no library.
  import { ui, findRow, currentIndex } from './store.svelte.js';
  import { dismissSheet } from './actions.js';
  import { metricVal, metricStr, metricTextColor } from '../lib/metrics.js';
  import Sparkline from '../lib/Sparkline.svelte';
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

  const PEEK = 110; // visible height in peek state (px)
  let sheetH = $state(0);
  let dragging = $state(false);
  let dragDY = $state(0);
  let startY = 0;
  let startT = 0;

  const baseOffset = $derived(ui.sheet === 'full' ? 0 : Math.max(0, sheetH - PEEK));
  const offset = $derived(
    dragging ? Math.min(Math.max(baseOffset + dragDY, 0), sheetH) : baseOffset
  );

  function pd(e) {
    dragging = true;
    dragDY = 0;
    startY = e.clientY;
    startT = performance.now();
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pm(e) {
    if (!dragging) return;
    dragDY = e.clientY - startY;
  }
  function pu() {
    if (!dragging) return;
    dragging = false;
    const dy = dragDY;
    dragDY = 0;
    // Tap (no real drag): toggle peek ↔ full. Note the click event itself
    // retargets to this div because of setPointerCapture, so the handle
    // button's onclick only fires for keyboard activation.
    if (Math.abs(dy) < 5) {
      toggle();
      return;
    }
    const dt = performance.now() - startT;
    const vel = dy / Math.max(dt, 1); // px per ms
    if (ui.sheet === 'peek') {
      if (dy < -40 || vel < -0.5) ui.sheet = 'full';
      else if (dy > 60 || vel > 0.5) dismissSheet();
    } else if (ui.sheet === 'full') {
      if (dy > 60 || vel > 0.5) ui.sheet = 'peek';
    }
  }
  function pc() {
    dragging = false;
    dragDY = 0;
  }
  function toggle() {
    ui.sheet = ui.sheet === 'peek' ? 'full' : 'peek';
  }
  function onWindowKey(e) {
    // Escape dismisses the sheet (the search overlay's Escape takes priority).
    if (e.key === 'Escape' && ui.sheet !== 'closed' && !ui.searchOpen) dismissSheet();
  }
</script>

<svelte:window onkeydown={onWindowKey} />

{#if stock && ui.sheet !== 'closed'}
  <div
    bind:clientHeight={sheetH}
    role="dialog"
    aria-label="Stock inspector"
    class="fixed inset-x-0 bottom-0 z-50 h-[80dvh] bg-[#11131a] border-t border-x border-[#1e222d] rounded-t-xl flex flex-col shadow-2xl shadow-black/60 sheet-anim {dragging ? 'sheet-dragging' : ''}"
    style="transform:translateY({offset}px)">
    <!-- drag/tap region: handle + peek header -->
    <div
      role="group"
      aria-label="Sheet drag handle and summary"
      class="shrink-0 touch-none select-none"
      onpointerdown={pd}
      onpointermove={pm}
      onpointerup={pu}
      onpointercancel={pc}>
      <button
        type="button"
        aria-label={ui.sheet === 'full' ? 'Collapse details' : 'Expand details'}
        onclick={toggle}
        class="w-full py-2 flex justify-center cursor-grab focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-400">
        <span class="w-10 h-1 rounded-full bg-[#2a2e39]"></span>
      </button>
      <div class="px-4 pb-2">
        <div class="flex items-center gap-2">
          <span class="text-lg font-extrabold tracking-tight">{stock.ticker}</span>
          <span class="text-xl font-bold tnum">{stock.price != null ? CUR + stock.price.toFixed(2) : '—'}</span>
          <span class="text-sm font-semibold tnum" style="color:{metricTextColor(v, ui.metric)}">{metricStr(v, ui.metric)}</span>
          <span class="ml-auto"><Sparkline spark={stock.spark} w={80} h={22} /></span>
        </div>
        <div class="text-[11px] text-slate-400 truncate mt-0.5">{stock.name}</div>
      </div>
    </div>

    <div
      inert={ui.sheet !== 'full' ? true : undefined}
      class="flex-1 min-h-0 overflow-y-auto overscroll-contain border-t border-[#1e222d] flex flex-col pb-[env(safe-area-inset-bottom)]">
      <InspectorContent {stock} variant="sheet" />
    </div>
  </div>
{/if}

<style>
  .sheet-anim {
    transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
  }
  .sheet-dragging {
    transition: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet-anim {
      transition: none;
    }
  }
</style>
