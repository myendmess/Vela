<script>
  import { ui, currentIndex } from './store.svelte.js';
  import VelaLogo from './VelaLogo.svelte';
  import IndexChips from './IndexChips.svelte';
  import MetricSelect from './MetricSelect.svelte';
  import TickerSearch from './TickerSearch.svelte';

  const idx = $derived.by(() => {
    void ui.registryVersion;
    void ui.indexId;
    return currentIndex();
  });
</script>

{#if ui.isMobile}
  <!-- UI-3: compact sticky mobile header — primary bar ≤56px (h-14) -->
  <header class="shrink-0 border-b border-[#1e222d]">
    <div class="relative flex items-center gap-2 px-3 h-14">
      <VelaLogo class="w-7 h-7" />
      <span class="text-sm font-bold truncate min-w-0">{idx?.label ?? 'Market Map'}</span>
      <div class="ml-auto flex items-center gap-1.5 shrink-0">
        <MetricSelect compact />
        <button
          type="button"
          aria-label="Search ticker or company"
          onclick={() => (ui.searchOpen = true)}
          class="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-slate-200 cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-amber-400">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
        </button>
      </div>
      {#if ui.searchOpen}
        <TickerSearch overlay />
      {/if}
    </div>
    <IndexChips scroll />
  </header>
{:else}
  <!-- Desktop header — ported from globe/dashboard/index.html -->
  <header class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 border-b border-[#1e222d] shrink-0">
    <VelaLogo class="w-9 h-9" />
    <h1 class="text-[15px] font-bold m-0">Market <span class="text-amber-400">Map</span></h1>

    <a
      href="../"
      class="text-xs text-slate-400 hover:text-amber-400 transition-colors focus-visible:outline-2 focus-visible:outline-amber-400"
      title="Back to region globe">← Globe</a>

    <nav class="hidden md:block text-xs text-slate-400" aria-label="Index path">
      {#each idx?.path ?? [] as p}
        {p} <span class="mx-1">›</span>
      {/each}
      <span class="text-slate-200 font-semibold">{idx?.label ?? ''}</span>
    </nav>

    <IndexChips />

    <MetricSelect />

    <TickerSearch />
  </header>
{/if}
