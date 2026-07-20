<script>
  // UI-19: unified toast. Callers grab the instance (bind:this) and call
  // show('message') — it appears bottom-center and auto-hides. The live
  // region stays mounted so screen readers announce the change.
  let { position = 'bottom-8' } = $props();
  let msg = $state('');
  let timer;

  export function show(message, ms = 2200) {
    clearTimeout(timer);
    msg = message;
    timer = setTimeout(() => (msg = ''), ms);
  }

  $effect(() => () => clearTimeout(timer));
</script>

<div
  role="status"
  aria-live="polite"
  class="fixed z-40 left-1/2 -translate-x-1/2 pointer-events-none {position}">
  {#if msg}
    <div class="px-4 py-2 rounded-full bg-[#131722] border border-[#3bcdf0]/40 text-xs text-slate-200 shadow-2xl shadow-black/50 toast-in">{msg}</div>
  {/if}
</div>

<style>
  .toast-in {
    animation: toast-in 0.2s ease;
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast-in {
      animation: none;
    }
  }
</style>
