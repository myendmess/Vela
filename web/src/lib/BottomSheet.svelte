<script>
  // Shared bottom sheet (UI-1 / UI-7): peek ↔ full states with pointer-drag,
  // swipe-down dismiss and Escape. Plain pointer events + CSS transforms, no
  // library. All app state stays in the caller — content arrives via snippets.
  let {
    sheet = $bindable('peek'), // 'peek' | 'full'
    ondismiss, // user swiped/escaped the sheet away
    ariaLabel = 'Details',
    peek = 110, // visible height in peek state (px)
    peekEnabled = true, // false: no peek state — drag down from full dismisses
    escapeEnabled = true,
    heightClass = 'h-[80dvh]',
    header, // snippet: summary row inside the drag region
    children, // snippet: scrollable full-state content
  } = $props();

  let sheetH = $state(0);
  let dragging = $state(false);
  let dragDY = $state(0);
  let startY = 0;
  let startT = 0;

  const baseOffset = $derived(sheet === 'full' ? 0 : Math.max(0, sheetH - peek));
  const offset = $derived(
    dragging ? Math.min(Math.max(baseOffset + dragDY, 0), sheetH) : baseOffset
  );

  function pd(e) {
    dragging = true;
    dragDY = 0;
    startY = e.clientY;
    startT = performance.now();
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pm(e) {
    if (!dragging) return;
    dragDY = e.clientY - startY;
  }
  function pu() {
    if (!dragging) return;
    dragging = false;
    const dy = dragDY;
    dragDY = 0;
    // Tap (no real drag): toggle peek ↔ full. Note the click event itself
    // retargets to this div because of setPointerCapture, so the handle
    // button's onclick only fires for keyboard activation.
    if (Math.abs(dy) < 5) {
      toggle();
      return;
    }
    const dt = performance.now() - startT;
    const vel = dy / Math.max(dt, 1); // px per ms
    if (sheet === 'peek') {
      if (dy < -40 || vel < -0.5) sheet = 'full';
      else if (dy > 60 || vel > 0.5) ondismiss?.();
    } else if (sheet === 'full') {
      if (dy > 60 || vel > 0.5) {
        if (peekEnabled) sheet = 'peek';
        else ondismiss?.();
      }
    }
  }
  function pc() {
    dragging = false;
    dragDY = 0;
  }
  function toggle() {
    if (!peekEnabled) return;
    sheet = sheet === 'peek' ? 'full' : 'peek';
  }
  function onWindowKey(e) {
    if (e.key === 'Escape' && escapeEnabled) ondismiss?.();
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<div
  bind:clientHeight={sheetH}
  role="dialog"
  aria-label={ariaLabel}
  class="fixed inset-x-0 bottom-0 z-50 {heightClass} bg-[#11131a] border-t border-x border-[#1e222d] rounded-t-xl flex flex-col shadow-2xl shadow-black/60 sheet-anim {dragging ? 'sheet-dragging' : ''}"
  style="transform:translateY({offset}px)">
  <!-- drag/tap region: handle + peek header -->
  <div
    role="group"
    aria-label="Sheet drag handle and summary"
    class="shrink-0 touch-none select-none"
    onpointerdown={pd}
    onpointermove={pm}
    onpointerup={pu}
    onpointercancel={pc}>
    <button
      type="button"
      aria-label={peekEnabled ? (sheet === 'full' ? 'Collapse details' : 'Expand details') : 'Close'}
      onclick={peekEnabled ? toggle : () => ondismiss?.()}
      class="w-full py-2 flex justify-center cursor-grab focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-400">
      <span class="w-10 h-1 rounded-full bg-[#2a2e39]"></span>
    </button>
    {@render header?.()}
  </div>

  <div
    inert={sheet !== 'full' ? true : undefined}
    class="flex-1 min-h-0 overflow-y-auto overscroll-contain border-t border-[#1e222d] flex flex-col pb-[env(safe-area-inset-bottom)]">
    {@render children?.()}
  </div>
</div>

<style>
  .sheet-anim {
    transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
  }
  .sheet-dragging {
    transition: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet-anim {
      transition: none;
    }
  }
</style>
