<script>
  import { METRIC_OPTIONS } from '../lib/metrics.js';
  import { ui } from './store.svelte.js';
  import { setMetric } from './actions.js';

  // compact = mobile header variant (UI-3); metric stays a native select.
  let { compact = false } = $props();

  const cls =
    'bg-[#131722] border border-[#1e222d] text-slate-200 rounded-md px-2 py-1 text-xs outline-none cursor-pointer focus:border-amber-400 focus-visible:outline-2 focus-visible:outline-amber-400';
</script>

{#if compact}
  <select
    aria-label="Color by"
    value={ui.metric}
    onchange={(e) => setMetric(e.target.value)}
    class="{cls} max-w-28">
    {#each METRIC_OPTIONS as [val, label]}
      <option value={val}>{label}</option>
    {/each}
  </select>
{:else}
  <label class="flex items-center gap-1.5 text-[11px] text-slate-400">
    Color by
    <select value={ui.metric} onchange={(e) => setMetric(e.target.value)} class={cls}>
      {#each METRIC_OPTIONS as [val, label]}
        <option value={val}>{label}</option>
      {/each}
    </select>
  </label>
{/if}
