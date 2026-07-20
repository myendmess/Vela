<script>
  // UI-8: collapsible "All markets" panel. Trigger floats bottom-center on
  // mobile, bottom-left on desktop (clear of the MapLibre controls at
  // bottom-right). Closes on Escape and on outside click (UI-19 policy).
  import AllMarketsList from './AllMarketsList.svelte';

  let { registry } = $props();

  let open = $state(false);
  let rootEl = $state(null);
  let btnEl = $state(null);

  function onDocPointerDown(e) {
    if (open && rootEl && !rootEl.contains(e.target)) open = false;
  }
  function onKey(e) {
    if (e.key === 'Escape' && open) {
      open = false;
      btnEl?.focus();
    }
  }
</script>

<svelte:document onpointerdown={onDocPointerDown} />
<svelte:window onkeydown={onKey} />

<div
  class="absolute z-20 bottom-4 left-1/2 -translate-x-1/2 md:left-4 md:translate-x-0 flex flex-col items-center md:items-start"
  bind:this={rootEl}>
  {#if open}
    <nav
      id="all-markets-panel"
      aria-label="All markets"
      class="mb-2 w-72 max-w-[calc(100vw-2rem)] max-h-[50dvh] overflow-y-auto rounded-lg border border-[#1e222d] bg-[#131722]/95 backdrop-blur shadow-2xl shadow-black/50 fade-in">
      <AllMarketsList {registry} />
    </nav>
  {/if}
  <button
    type="button"
    bind:this={btnEl}
    aria-expanded={open}
    aria-controls="all-markets-panel"
    onclick={() => (open = !open)}
    class="min-h-11 px-4 rounded-full border border-[#1e222d] bg-[#131722]/90 backdrop-blur text-xs font-semibold text-slate-200 shadow-lg shadow-black/40 hover:border-amber-400 hover:text-amber-400 transition-colors focus-visible:outline-2 focus-visible:outline-amber-400">
    All markets {open ? '▴' : '▾'}
  </button>
</div>
