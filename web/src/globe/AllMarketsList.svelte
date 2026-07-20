<script>
  // UI-8: flat list of every registry entry, live first — the fat-finger-proof,
  // keyboard and screen-reader path to each market. Also the error-overlay
  // fallback. Live rows navigate to the dashboard; ≥44px touch targets.
  let { registry } = $props();

  const entries = $derived.by(() => {
    if (!registry) return [];
    const all = Object.entries(registry).map(([id, e]) => ({ id, ...e }));
    return [...all.filter((e) => e.status === 'live'), ...all.filter((e) => e.status !== 'live')];
  });

  const scopeLabel = (e) =>
    e.scope.type === 'world' ? 'World' : e.scope.type === 'region' ? 'Region' : e.scope.code;
</script>

<ul class="divide-y divide-[#1e222d] text-sm">
  {#each entries as e (e.id)}
    <li>
      {#if e.status === 'live'}
        <a
          href="dashboard/?index={e.id}"
          class="flex items-center gap-3 min-h-11 px-3 py-1.5 text-amber-300 font-semibold hover:bg-[#1e222d] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-400">
          <span class="truncate">{e.label}</span>
          <span class="text-[11px] font-normal text-slate-400 uppercase">{scopeLabel(e)}</span>
          <span class="ml-auto" aria-hidden="true">→</span>
        </a>
      {:else}
        <div class="flex items-center gap-3 min-h-11 px-3 py-1.5 text-slate-400">
          <span class="truncate">{e.label}</span>
          <span class="text-[11px] text-slate-400 uppercase">{scopeLabel(e)}</span>
          <span class="ml-auto text-[11px] text-[#3bcdf0]/80">coming soon</span>
        </div>
      {/if}
    </li>
  {/each}
</ul>
