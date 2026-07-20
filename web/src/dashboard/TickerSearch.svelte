<script>
  import { ui, getRows } from './store.svelte.js';
  import { selectStock } from './actions.js';

  // UI-9: proper combobox/listbox/option semantics, arrow-key navigation with
  // visible highlight, Enter selects highlighted (first by default), Escape
  // closes, "No matches" row, ≥44px rows on mobile.
  // overlay = mobile full-width variant living inside the header (UI-3).
  let { overlay = false } = $props();

  let q = $state('');
  let open = $state(false);
  let hi = $state(0);
  let inputEl = $state(null);

  const matches = $derived.by(() => {
    void ui.dataVersion;
    const s = q.trim();
    if (!s) return [];
    const Q = s.toUpperCase();
    // ticker-prefix OR name-substring, max 8 (byte-faithful port)
    return getRows()
      .filter((r) => r.ticker.toUpperCase().startsWith(Q) || r.name.toUpperCase().includes(Q))
      .slice(0, 8);
  });

  $effect(() => {
    void matches;
    hi = 0;
  });

  $effect(() => {
    if (overlay && inputEl) inputEl.focus();
  });

  const expanded = $derived(open && q.trim().length > 0);

  function close() {
    open = false;
    if (overlay) ui.searchOpen = false;
  }
  function choose(r) {
    q = '';
    close();
    selectStock(r.ticker, { zoom: true });
  }
  function onKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (matches.length) { open = true; hi = (hi + 1) % matches.length; }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (matches.length) { open = true; hi = (hi - 1 + matches.length) % matches.length; }
    } else if (e.key === 'Enter') {
      if (expanded && matches.length) choose(matches[hi] ?? matches[0]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }
</script>

<div class={overlay ? 'absolute inset-0 z-50 bg-[#0c0d12] flex items-center gap-2 px-3' : 'relative ml-auto w-56'}>
  <input
    bind:this={inputEl}
    type="text"
    role="combobox"
    aria-expanded={expanded}
    aria-controls="search-listbox"
    aria-activedescendant={expanded && matches.length ? `search-opt-${hi}` : undefined}
    aria-autocomplete="list"
    aria-label="Search ticker or company"
    placeholder="Search ticker or company…"
    autocomplete="off"
    value={q}
    oninput={(e) => { q = e.target.value; open = true; }}
    onkeydown={onKey}
    class="{overlay ? 'flex-1 min-w-0' : 'w-full'} bg-[#131722] border border-[#1e222d] text-slate-200 rounded-md px-3 py-1.5 text-xs outline-none focus:border-amber-400 focus-visible:outline-2 focus-visible:outline-amber-400 placeholder:text-slate-500" />
  {#if overlay}
    <button
      type="button"
      aria-label="Close search"
      onclick={close}
      class="shrink-0 min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-slate-200 cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-amber-400">✕</button>
  {/if}

  <div
    id="search-listbox"
    role="listbox"
    aria-label="Search results"
    class="absolute {overlay ? 'top-full left-3 right-3' : 'top-9 inset-x-0'} bg-[#131722] border border-[#1e222d] rounded-md z-40 max-h-72 overflow-auto shadow-2xl shadow-black/50 {expanded ? '' : 'hidden'}">
    {#if matches.length}
      {#each matches as r, i (r.ticker)}
        <button
          type="button"
          role="option"
          id="search-opt-{i}"
          aria-selected={i === hi}
          onclick={() => choose(r)}
          onpointerenter={() => (hi = i)}
          class="w-full text-left px-3 py-1.5 text-xs cursor-pointer flex gap-2 items-center max-md:min-h-11 hover:bg-[#1a2030] {i === hi ? 'bg-[#1a2030]' : ''}">
          <b class="text-amber-400">{r.ticker}</b><span class="text-slate-400 truncate">{r.name}</span>
        </button>
      {/each}
    {:else}
      <div class="px-3 py-2 text-xs text-slate-400 max-md:min-h-11 flex items-center">No matches</div>
    {/if}
  </div>
</div>
