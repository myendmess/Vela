<script>
  import { ui, getRows, currentIndex } from './store.svelte.js';
  import { METRICS, metricVal, metricStr, metricTextColor, wavg } from '../lib/metrics.js';
  import { fmtB, tvURL } from '../lib/format.js';
  import Sparkline from '../lib/Sparkline.svelte';
  import PeerList from './PeerList.svelte';

  // variant 'sidebar' renders the full desktop inspector; variant 'sheet'
  // skips the ticker/price header (the sheet's peek row already shows it,
  // UI-1) and shows a compact TradingView row instead.
  let { stock, variant = 'sidebar' } = $props();

  const CUR = $derived.by(() => {
    void ui.registryVersion;
    void ui.indexId;
    return currentIndex()?.cur ?? '';
  });

  const v = $derived(metricVal(stock, ui.metric));
  const secRows = $derived.by(() => {
    void ui.dataVersion;
    return getRows().filter((r) => r.gics_sector === stock.gics_sector);
  });
  const peers = $derived.by(() => {
    void ui.dataVersion;
    return getRows()
      .filter((r) => r.gics_sub_industry === stock.gics_sub_industry)
      .sort((a, b) => b.market_cap - a.market_cap);
  });
  const sv = $derived(wavg(secRows, ui.metric));
  const iv = $derived(wavg(peers, ui.metric));

  const tvClass =
    'text-[11px] font-semibold px-2.5 py-1 rounded-md bg-[#2962ff] hover:bg-[#1e4fd6] text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400';
</script>

<div class="flex-1 min-h-0 flex flex-col fade-in">
  {#if variant === 'sidebar'}
    <div class="px-4 pt-3 pb-2 border-b border-[#1e222d]">
      <div class="flex items-center gap-2">
        <span class="text-xl font-extrabold tracking-tight">{stock.ticker}</span>
        <a href={tvURL(stock.ticker)} target="_blank" rel="noopener" class="ml-auto {tvClass}">View on TradingView ↗</a>
      </div>
      <div class="text-sm text-slate-400 mt-0.5">{stock.name}</div>
      <div class="text-[11px] text-slate-400">{stock.gics_sector} · {stock.gics_sub_industry}</div>
    </div>

    <div class="px-4 py-3 border-b border-[#1e222d] flex items-center gap-3">
      <span class="text-2xl font-bold tnum">{stock.price != null ? CUR + stock.price.toFixed(2) : '—'}</span>
      <span class="text-base font-semibold tnum" style="color:{metricTextColor(v, ui.metric)}">{metricStr(v, ui.metric)}</span>
      <span class="ml-auto"><Sparkline spark={stock.spark} w={110} h={28} /></span>
    </div>
  {:else}
    <div class="px-4 py-2 border-b border-[#1e222d] flex items-center gap-2 text-[11px] text-slate-400">
      <span class="truncate">{stock.gics_sector} · {stock.gics_sub_industry}</span>
      <a href={tvURL(stock.ticker)} target="_blank" rel="noopener" class="ml-auto shrink-0 {tvClass}">TradingView ↗</a>
    </div>
  {/if}

  <div class="px-4 py-2.5 border-b border-[#1e222d] grid grid-cols-3 gap-2 text-[11px] text-slate-400">
    <div>
      <div class="text-slate-500">52w range</div>
      <!-- UI-19: currency symbol in the 52w range line -->
      <div class="text-slate-300 tnum">{CUR}{stock.wk52_low}–{CUR}{stock.wk52_high}</div>
    </div>
    <div>
      <div class="text-slate-500">52w pos</div>
      <div class="text-slate-300 tnum">{stock.wk52_position != null ? (stock.wk52_position * 100).toFixed(0) + '%' : 'n/a'}</div>
    </div>
    <div>
      <div class="text-slate-500">Mkt cap</div>
      <div class="text-slate-300 tnum">{fmtB(stock.market_cap, CUR)}</div>
    </div>
  </div>

  <div class="px-4 py-2.5 border-b border-[#1e222d] bg-white/[0.02] text-xs">
    <div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Context — <span>{METRICS[ui.metric].label}</span></div>
    <div class="flex justify-between gap-2 py-0.5">
      <span class="text-slate-400 truncate">{stock.gics_sector} ({secRows.length})</span>
      <span class="font-semibold tnum shrink-0" style="color:{metricTextColor(sv, ui.metric)}">{metricStr(sv, ui.metric, 1)}</span>
    </div>
    <div class="flex justify-between gap-2 py-0.5">
      <span class="text-slate-400 truncate">{stock.gics_sub_industry} ({peers.length})</span>
      <span class="font-semibold tnum shrink-0" style="color:{metricTextColor(iv, ui.metric)}">{metricStr(iv, ui.metric, 1)}</span>
    </div>
  </div>

  <div class="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-500 shrink-0">
    Industry peers · <span>{METRICS[ui.metric].label}</span>
  </div>
  <PeerList {peers} {stock} />
</div>
