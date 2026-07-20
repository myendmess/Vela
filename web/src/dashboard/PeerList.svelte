<script>
  import { ui } from './store.svelte.js';
  import { metricVal, metricStr, metricTextColor } from '../lib/metrics.js';
  import { selectStock } from './actions.js';
  import Sparkline from '../lib/Sparkline.svelte';

  let { peers, stock } = $props();
</script>

<!-- UI-10: peer rows are real <button>s with visible focus rings -->
<div class="flex-1 min-h-0 overflow-y-auto">
  {#each peers as p (p.ticker)}
    {@const pv = metricVal(p, ui.metric)}
    <button
      type="button"
      onclick={() => selectStock(p.ticker)}
      class="w-full text-left grid grid-cols-[46px_64px_1fr_66px] gap-2 items-center px-4 py-1.5 text-[13px] cursor-pointer border-t border-[#161b26] hover:bg-[#1a2030] max-md:min-h-11 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-400 {p.ticker === stock.ticker ? 'bg-[#1c2433]' : ''}">
      <span class="font-bold">{p.ticker}</span>
      <span><Sparkline spark={p.spark} /></span>
      <span class="text-right tnum">{p.price != null ? p.price.toFixed(2) : '—'}</span>
      <span class="text-right font-semibold tnum" style="color:{metricTextColor(pv, ui.metric)}">{metricStr(pv, ui.metric)}</span>
    </button>
  {/each}
</div>
