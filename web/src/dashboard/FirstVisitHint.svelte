<script>
  // UI-14: one dismissible line overlaid on the map, first visit only.
  const KEY = 'vela.mapHintDismissed';
  function seen() {
    try {
      return !!localStorage.getItem(KEY);
    } catch {
      return true; // storage unavailable → never show
    }
  }
  let show = $state(!seen());
  function dismiss() {
    try {
      localStorage.setItem(KEY, '1');
    } catch { /* ignore */ }
    show = false;
  }
</script>

{#if show}
  <div class="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-1rem)] flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-[#131722]/95 border border-[#1e222d] text-[11px] text-slate-300 shadow-lg fade-in">
    <span class="truncate">Each box is a stock — size = market cap, color = today's move. Tap any box.</span>
    <button
      type="button"
      aria-label="Dismiss hint"
      onclick={dismiss}
      class="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400">✕</button>
  </div>
{/if}
