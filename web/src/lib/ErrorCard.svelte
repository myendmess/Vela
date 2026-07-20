<script>
  // UI-4: centered error card — message, optional detail + Retry, and
  // caller-provided extra content (links, fallback lists) via children.
  let { message = "Couldn't load market data.", detail = '', onretry, children } = $props();
</script>

<div class="w-full h-full flex items-center justify-center p-4">
  <div class="max-w-sm w-full rounded-lg border border-[#1e222d] bg-[#11131a] p-5 text-center fade-in">
    <div class="text-2xl mb-2" aria-hidden="true">⚠</div>
    <p class="text-sm text-slate-300 mb-1">{message}</p>
    {#if detail}
      <p class="text-xs text-slate-400 break-words mb-4">{detail}</p>
    {/if}
    {#if onretry}
      <button
        type="button"
        onclick={onretry}
        class="text-xs font-semibold px-4 py-2 min-h-11 min-w-24 rounded-md bg-amber-400 text-[#0c0d12] hover:bg-amber-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400">Retry</button>
    {/if}
    {@render children?.()}
  </div>
</div>
