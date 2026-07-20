<script>
  import { ui, getLive, comingSoonLabels } from './store.svelte.js';
  import { switchIndex } from './actions.js';

  // scroll = mobile variant: one horizontally scrollable row (UI-3), with the
  // coming-soon count chip visible on mobile too.
  let { scroll = false } = $props();

  const live = $derived.by(() => {
    void ui.registryVersion;
    return Object.entries(getLive());
  });
  const soon = $derived.by(() => {
    void ui.registryVersion;
    return comingSoonLabels();
  });

  // Keep chips as real links (middle-click / open-in-new-tab still work);
  // plain left click switches client-side via pushState (UI-16), preserving
  // the current metric.
  function chipHref(id) {
    const p = new URLSearchParams();
    p.set('index', id);
    if (ui.metric !== '1d') p.set('metric', ui.metric);
    return '?' + p.toString();
  }
  function onClick(e, id) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    switchIndex(id);
  }
</script>

<div
  class="flex items-center gap-2 {scroll ? 'overflow-x-auto no-scrollbar px-3 pb-2' : ''}"
  role="group"
  aria-label="Indices">
  {#each live as [id, ix] (id)}
    {#if id === ui.indexId}
      <span class="text-[11px] px-3 py-1 rounded-full bg-amber-400 text-[#0c0d12] font-bold whitespace-nowrap">{ix.label}</span>
    {:else}
      <a
        href={chipHref(id)}
        onclick={(e) => onClick(e, id)}
        class="text-[11px] px-3 py-1 rounded-full border border-amber-400/60 text-amber-300 hover:bg-amber-400 hover:text-[#0c0d12] transition-colors font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400">{ix.label}</a>
    {/if}
  {/each}
  {#if soon.length}
    <span
      class="text-[11px] px-3 py-1 rounded-full border border-[#1e222d] text-slate-400 cursor-default whitespace-nowrap"
      title="{soon.join(', ')} — coming soon">+{soon.length} · Coming Soon</span>
  {/if}
</div>
