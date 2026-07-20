<script>
  import { ui } from './store.svelte.js';
  import { retryLoad } from './actions.js';
</script>

<!-- UI-4: centered error card with message, Retry, and a link back to the globe -->
<div class="w-full h-full flex items-center justify-center p-4">
  <div class="max-w-sm w-full rounded-lg border border-[#1e222d] bg-[#11131a] p-5 text-center fade-in">
    <div class="text-2xl mb-2" aria-hidden="true">⚠</div>
    <p class="text-sm text-slate-300 mb-1">Couldn't load market data.</p>
    <p class="text-xs text-slate-400 break-words mb-4">{ui.errorMsg}</p>
    <button
      type="button"
      onclick={retryLoad}
      class="text-xs font-semibold px-4 py-2 min-h-11 min-w-24 rounded-md bg-amber-400 text-[#0c0d12] hover:bg-amber-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400">Retry</button>
    <div class="mt-3">
      <a href="../" class="text-xs text-slate-400 hover:text-amber-400 focus-visible:outline-2 focus-visible:outline-amber-400">← Back to globe</a>
    </div>
  </div>
</div>
