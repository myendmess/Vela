<script>
  // Svelte port of globe/index.html — MapLibre GL globe of the index registry.
  //
  // No API key needed: MapLibre GL JS (open source) renders the globe, and the
  // country shapes are Natural Earth data (public domain) self-hosted from the
  // world-atlas package as a build asset (UI-18 — no CDN at runtime).
  //
  // indexes.json (shared with dashboard/) is the single source of truth: every
  // dataset has a scope — country (S&P 500 → US), region (STOXX 600 → member
  // countries as one hover group), or world (VWCE → allocation-colored globe).
  import maplibregl from 'maplibre-gl';
  import { feature } from 'topojson-client';
  import { onMount } from 'svelte';
  import { registryPromise, topologyPromise, fetchWeights, NUM_TO_ISO2 } from './data.js';
  import VelaLogo from '../lib/VelaLogo.svelte';
  import Toast from '../lib/Toast.svelte';
  import BottomSheet from '../lib/BottomSheet.svelte';
  import AllMarketsPanel from './AllMarketsPanel.svelte';
  import AllMarketsList from './AllMarketsList.svelte';

  // UI-7: touch devices get a preview sheet instead of blind navigation.
  const isTouch = window.matchMedia('(hover: none)').matches;

  const NONE = ['__none__']; // match/in expressions reject empty arrays
  const codesOr = (a) => (a.length ? a : NONE);

  let status = $state('loading'); // 'loading' | 'ready' | 'error'
  let registry = $state(null); // indexes.json (also the error-overlay fallback list)
  let worldEntry = $state(null); // the world-scope entry (VWCE), if any
  let mode = $state('markets'); // 'markets' | 'world'
  let worldLegend = $state('');

  // Desktop hover tooltip / click picker; touch preview sheet.
  let tip = $state(null); // { kind, x, y, name, ... }
  let picker = $state(null); // { x, y, name, items }
  let preview = $state(null); // { name, items, world? }
  let sheetState = $state('full');
  let pickerEl = $state(null);
  let toastEl;

  let byCountry = {}; // ISO2 -> [{id, label, status, scope}]
  let vwce = null; // lazily fetched {as_of, source, weights}
  let mapEl;
  let map;
  let FILL_COLOR_MARKETS, FILL_OPACITY_MARKETS;

  const fmtW = (w) => (w >= 1 ? w.toFixed(1) : w.toFixed(2));

  function processRegistry(reg) {
    registry = reg;
    for (const [id, e] of Object.entries(reg)) {
      const entry = { id, ...e };
      if (e.scope.type === 'country') {
        (byCountry[e.scope.code] = byCountry[e.scope.code] || []).push(entry);
      } else if (e.scope.type === 'region') {
        for (const c of e.scope.countries) (byCountry[c] = byCountry[c] || []).push(entry);
      } else if (e.scope.type === 'world') {
        worldEntry = entry;
      }
    }
  }

  const regionMembersOf = (iso) => {
    const regions = (byCountry[iso] || []).filter((e) => e.scope.type === 'region');
    return regions.length ? regions.flatMap((e) => e.scope.countries) : null;
  };

  function init(topo) {
    const liveCodes = Object.keys(byCountry).filter((c) => byCountry[c].some((e) => e.status === 'live'));
    const soonCodes = Object.keys(byCountry).filter((c) => !byCountry[c].some((e) => e.status === 'live'));

    const countries = feature(topo, topo.objects.countries);
    countries.features.forEach((f) => { f.properties.iso = NUM_TO_ISO2[+f.id] || ''; });
    map.addSource('countries', { type: 'geojson', data: countries });

    map.addLayer({ id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': '#171c2b' } });
    map.addLayer({
      id: 'land-outline', type: 'line', source: 'countries',
      paint: { 'line-color': '#262e42', 'line-width': 0.5 },
    });
    // Region hover group: filter is swapped to the hovered region's member list.
    map.addLayer({
      id: 'region-hover', type: 'fill', source: 'countries',
      filter: ['in', ['get', 'iso'], ['literal', NONE]],
      paint: { 'fill-color': '#3bcdf0', 'fill-opacity': 0.14 },
    });

    FILL_COLOR_MARKETS = [
      'match', ['get', 'iso'],
      codesOr(liveCodes), '#fbbf24',
      codesOr(soonCodes), '#3bcdf0',
      'rgba(0,0,0,0)',
    ];
    FILL_OPACITY_MARKETS = [
      'match', ['get', 'iso'],
      codesOr(liveCodes), 0.55,
      codesOr(soonCodes), 0.22,
      0,
    ];
    map.addLayer({
      id: 'country-fill', type: 'fill', source: 'countries',
      paint: { 'fill-color': FILL_COLOR_MARKETS, 'fill-opacity': FILL_OPACITY_MARKETS },
    });
    map.addLayer({
      id: 'country-outline', type: 'line', source: 'countries',
      filter: ['in', ['get', 'iso'], ['literal', codesOr(liveCodes)]],
      paint: { 'line-color': '#fbbf24', 'line-width': 1.2 },
    });

    map.on('mousemove', 'country-fill', onCountryMove);
    map.on('mouseleave', 'country-fill', onCountryLeave);
    map.on('click', 'country-fill', onCountryClick);
    map.on('click', onMapClick); // runs after the layer handler above

    status = 'ready';
  }

  function onCountryMove(e) {
    if (isTouch) return; // touch taps go through the preview sheet instead
    const f = e.features[0];
    const iso = f.properties.iso;
    const name = f.properties.name;

    if (mode === 'world') {
      const w = vwce && vwce.weights[iso];
      tip = { kind: 'world', x: e.point.x, y: e.point.y, name, weight: w ?? null };
      map.getCanvas().style.cursor = w != null ? 'pointer' : '';
      return;
    }

    const assoc = byCountry[iso];
    const members = regionMembersOf(iso);
    map.setFilter('region-hover', ['in', ['get', 'iso'], ['literal', members || NONE]]);
    if (!assoc) {
      tip = null;
      map.getCanvas().style.cursor = '';
      return;
    }
    map.getCanvas().style.cursor = 'pointer';
    tip = {
      kind: 'markets', x: e.point.x, y: e.point.y, name,
      anyLive: assoc.some((x) => x.status === 'live'),
      items: assoc,
    };
  }

  function onCountryLeave() {
    tip = null;
    map.getCanvas().style.cursor = '';
    map.setFilter('region-hover', ['in', ['get', 'iso'], ['literal', NONE]]);
  }

  function onCountryClick(e) {
    picker = null;
    const f = e.features[0];
    const iso = f.properties.iso;
    const name = f.properties.name;

    if (mode === 'world') {
      if (!vwce || vwce.weights[iso] == null || !worldEntry) return;
      if (isTouch) {
        // UI-7: preview sheet with the world entry + this country's weight.
        preview = { name, items: [worldEntry], world: { weight: vwce.weights[iso] } };
        sheetState = 'full';
        return;
      }
      if (worldEntry.status === 'live') location.href = `dashboard/?index=${worldEntry.id}`;
      else toastEl.show(`${worldEntry.label} — coming soon`);
      return;
    }

    const assoc = byCountry[iso];
    if (!assoc) return;

    if (isTouch) {
      // UI-7: never navigate blindly on tap — open the preview sheet.
      preview = { name, items: assoc };
      sheetState = 'full';
      tip = null;
      return;
    }

    const live = assoc.filter((x) => x.status === 'live');
    if (assoc.length === 1) {
      if (live.length) location.href = `dashboard/?index=${live[0].id}`;
      else toastEl.show(`${name} — ${assoc[0].label} coming soon`);
      return;
    }
    if (!live.length) {
      toastEl.show(`${name} — ${assoc.map((x) => x.label).join(', ')} coming soon`);
      return;
    }
    // Several indices, at least one live → picker.
    picker = {
      name,
      items: assoc,
      x: Math.min(e.point.x + 10, window.innerWidth - 210),
      y: Math.min(e.point.y + 10, window.innerHeight - 30 - assoc.length * 30),
    };
    tip = null;
  }

  // Tapping ocean or an unrelated country closes the preview sheet.
  function onMapClick(e) {
    const hits = map.queryRenderedFeatures(e.point, { layers: ['country-fill'] });
    const iso = hits[0]?.properties?.iso ?? '';
    const relevant = mode === 'world' ? vwce != null && vwce.weights[iso] != null : !!byCountry[iso];
    if (!relevant) preview = null;
  }

  // ---------- world (VWCE allocation) mode ----------
  async function enterWorld() {
    if (!worldEntry) return;
    if (!vwce) {
      try {
        vwce = await fetchWeights(worldEntry);
      } catch {
        toastEl.show(`Couldn't load ${worldEntry.label} weights — try again`);
        return;
      }
    }
    // sqrt scale (US ≈ 57% would otherwise make every other country invisible),
    // with a brightness floor so even 0.02% members are faintly lit.
    const maxW = Math.max(...Object.values(vwce.weights));
    const pairs = [];
    for (const [iso, w] of Object.entries(vwce.weights)) {
      const t = 0.12 + 0.88 * Math.sqrt(w / maxW);
      const c = [23 + (251 - 23) * t, 28 + (191 - 28) * t, 43 + (36 - 43) * t].map(Math.round);
      pairs.push(iso, `rgb(${c[0]},${c[1]},${c[2]})`);
    }
    map.setPaintProperty('country-fill', 'fill-color', ['match', ['get', 'iso'], ...pairs, 'rgba(0,0,0,0)']);
    map.setPaintProperty('country-fill', 'fill-opacity', ['match', ['get', 'iso'], Object.keys(vwce.weights), 0.9, 0]);
    map.setLayoutProperty('country-outline', 'visibility', 'none');
    map.setFilter('region-hover', ['in', ['get', 'iso'], ['literal', NONE]]);
    worldLegend = `0 → ${maxW.toFixed(1)}% of ${worldEntry.label} · as of ${vwce.as_of}`;
    picker = null;
    tip = null;
    preview = null;
    mode = 'world';
  }

  function exitWorld() {
    map.setPaintProperty('country-fill', 'fill-color', FILL_COLOR_MARKETS);
    map.setPaintProperty('country-fill', 'fill-opacity', FILL_OPACITY_MARKETS);
    map.setLayoutProperty('country-outline', 'visibility', 'visible');
    tip = null;
    preview = null;
    mode = 'markets';
  }

  function onWindowKey(e) {
    if (e.key === 'Escape') picker = null;
  }
  // UI-19: picker closes on outside click, not just Escape.
  function onDocPointerDown(e) {
    if (picker && pickerEl && !pickerEl.contains(e.target)) picker = null;
  }
  // Keyboard users land on the first live link when the picker opens.
  $effect(() => {
    if (picker && pickerEl) pickerEl.querySelector('a')?.focus();
  });

  onMount(() => {
    map = new maplibregl.Map({
      container: mapEl,
      style: {
        version: 8,
        projection: { type: 'globe' },
        sky: {
          'sky-color': '#0b101f',
          'horizon-color': '#141928',
          'fog-color': '#0c0d12',
          'sky-horizon-blend': 0.6,
          'horizon-fog-blend': 0.6,
          'fog-ground-blend': 0.7,
          'atmosphere-blend': 0.35,
        },
        sources: {},
        layers: [
          { id: 'ocean', type: 'background', paint: { 'background-color': '#101522' } },
        ],
      },
      zoom: 1.4,
      center: [10, 25],
      attributionControl: { compact: true, customAttribution: 'Natural Earth · MapLibre' },
      // UI-19: on touch, one-finger drag scrolls the page instead of fighting
      // the globe; two-finger pinch/pan still zooms and moves the map.
      cooperativeGestures: isTouch,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.scrollZoom.disable();
    map.dragRotate.enable();
    if (import.meta.env.DEV) window.__vela_map = map; // dev-only debug handle

    registryPromise.then(processRegistry).catch(() => {});
    Promise.all([
      new Promise((resolve) => map.on('load', resolve)),
      registryPromise,
      topologyPromise,
    ])
      .then(([, , topo]) => init(topo))
      .catch((err) => {
        console.error('globe init failed:', err);
        status = 'error';
      });

    return () => map.remove();
  });
</script>

<svelte:window onkeydown={onWindowKey} />
<svelte:document onpointerdown={onDocPointerDown} />

<!-- ============ TOP NAV ============ -->
<header class="absolute top-0 inset-x-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 border-b border-[#1e222d] bg-[#0c0d12]/80 backdrop-blur">
  <VelaLogo />
  <h1 class="text-[15px] font-bold m-0">Global <span class="text-amber-400">Market Map</span></h1>
  <!-- UI-7: hint visible on mobile too, with touch wording -->
  <p class="text-xs text-slate-400 basis-full order-last md:order-none md:basis-auto">
    {isTouch ? 'Tap a highlighted region to preview its market' : 'Click a highlighted region to open its market'}
  </p>

  <div class="ml-auto flex items-center gap-3 text-[11px]">
    {#if mode === 'markets'}
      <span class="flex items-center gap-3">
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>Live</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#3bcdf0]/50 inline-block"></span>Coming soon</span>
      </span>
    {:else}
      <span class="flex items-center gap-1.5">
        <span class="inline-block w-24 h-2.5 rounded-full" style="background:linear-gradient(90deg,#171c2b,#fbbf24)"></span>
        <span class="text-slate-400">{worldLegend}</span>
      </span>
    {/if}
    {#if worldEntry}
      <button
        type="button"
        aria-pressed={mode === 'world'}
        aria-label="Toggle VWCE world allocation view"
        onclick={() => (mode === 'markets' ? enterWorld() : exitWorld())}
        class="max-md:min-h-11 px-3 py-1.5 rounded-md border transition-colors font-semibold focus-visible:outline-2 focus-visible:outline-[#3bcdf0] {mode === 'world'
          ? 'border-[#3bcdf0] text-[#3bcdf0] bg-[#3bcdf0]/10'
          : 'border-[#1e222d] text-slate-300 hover:border-[#3bcdf0] hover:text-[#3bcdf0]'}">
        🌍 VWCE World
      </button>
    {/if}
    <a
      href="dashboard/"
      class="max-md:min-h-11 inline-flex items-center px-3 py-1.5 rounded-md border border-[#1e222d] text-slate-300 hover:border-amber-400 hover:text-amber-400 transition-colors font-semibold focus-visible:outline-2 focus-visible:outline-amber-400">
      Skip to dashboard →
    </a>
  </div>
</header>

<!-- id rule in app.css (not a Tailwind class): MapLibre's own stylesheet sets
     `.maplibregl-map { position: relative }` unlayered, which outranks
     Tailwind v4's layered utilities — same fix as the original page. -->
<div id="globe" bind:this={mapEl} aria-label="Interactive globe of world markets"></div>

<!-- Hover tooltip (desktop only) -->
{#if tip}
  <div
    class="absolute z-20 pointer-events-none px-3 py-2 rounded-md bg-[#131722]/95 border border-[#1e222d] text-xs shadow-2xl shadow-black/50"
    style="left:{tip.x + 14}px;top:{tip.y + 14}px">
    {#if tip.kind === 'world'}
      {#if tip.weight != null}
        <b class="text-amber-400">{tip.name}</b><br />{fmtW(tip.weight)}% of {worldEntry?.label}
      {:else}
        <b class="text-slate-400">{tip.name}</b><br />not in the index
      {/if}
    {:else}
      <b class={tip.anyLive ? 'text-amber-400' : 'text-[#3bcdf0]'}>{tip.name}</b>
      {#each tip.items as x (x.id)}
        <br />{#if x.status === 'live'}{x.label} — click to open{:else}<span class="text-slate-400">{x.label} — coming soon</span>{/if}
      {/each}
    {/if}
  </div>
{/if}

<!-- Multi-index picker (countries with more than one associated index) -->
{#if picker}
  <div
    bind:this={pickerEl}
    role="dialog"
    aria-label="{picker.name} indices"
    class="absolute z-30 min-w-[190px] rounded-md bg-[#131722]/95 border border-[#1e222d] text-xs shadow-2xl shadow-black/50 overflow-hidden"
    style="left:{picker.x}px;top:{picker.y}px">
    <div class="px-3 py-1.5 border-b border-[#1e222d] text-slate-400 font-semibold">{picker.name}</div>
    {#each picker.items as x (x.id)}
      {#if x.status === 'live'}
        <a
          href="dashboard/?index={x.id}"
          class="block px-3 py-1.5 text-amber-300 hover:bg-[#1e222d] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-400">{x.label} →</a>
      {:else}
        <div class="px-3 py-1.5 text-slate-400 cursor-default">{x.label} · coming soon</div>
      {/if}
    {/each}
  </div>
{/if}

<!-- UI-7: touch preview sheet — explicit open button instead of blind tap-navigation -->
{#if preview}
  <BottomSheet
    bind:sheet={sheetState}
    ondismiss={() => (preview = null)}
    peekEnabled={false}
    escapeEnabled={!picker}
    heightClass="h-auto max-h-[75dvh]"
    ariaLabel="{preview.name} markets">
    {#snippet header()}
      <div class="px-4 pb-2">
        <div class="text-lg font-extrabold tracking-tight">{preview.name}</div>
        <div class="text-xs text-slate-400 mt-0.5">
          {#if preview.world}
            {fmtW(preview.world.weight)}% of {worldEntry?.label}
          {:else}
            {preview.items.length === 1 ? '1 index' : preview.items.length + ' indices'}
          {/if}
        </div>
      </div>
    {/snippet}
    <div class="px-4 py-3 space-y-2">
      {#each preview.items as x (x.id)}
        {#if x.status === 'live'}
          <a
            href="dashboard/?index={x.id}"
            class="flex items-center gap-3 min-h-11 px-3 rounded-md border border-amber-400/40 bg-amber-400/10 text-amber-300 font-semibold text-sm hover:bg-amber-400/20 focus-visible:outline-2 focus-visible:outline-amber-400">
            <span>Open {x.label} →</span>
            <span class="ml-auto text-[11px] font-normal uppercase tracking-wide text-amber-400/80">live</span>
          </a>
        {:else}
          <div class="flex items-center gap-3 min-h-11 px-3 rounded-md border border-[#1e222d] text-sm text-slate-400">
            <span>{x.label}</span>
            <span class="ml-auto text-[11px] uppercase tracking-wide text-[#3bcdf0]/80">coming soon</span>
          </div>
        {/if}
      {/each}
    </div>
  </BottomSheet>
{/if}

<!-- UI-8: fat-finger-proof / keyboard / screen-reader path to every market -->
{#if registry && status !== 'error'}
  <AllMarketsPanel {registry} />
{/if}

<Toast bind:this={toastEl} position="bottom-20 md:bottom-8" />

<!-- Shown only if the registry / country shapes fail to download -->
{#if status === 'error'}
  <div class="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#0c0d12] px-6 py-10 text-center">
    <div class="max-w-md w-full space-y-3">
      <h2 class="text-lg font-bold text-amber-400">Couldn't load the globe</h2>
      <p class="text-sm text-slate-400">
        The index registry or the country shapes failed to download. Refresh to retry,
        or jump straight to the dashboard.
      </p>
      <a
        href="dashboard/"
        class="inline-flex items-center mt-2 px-4 py-2 min-h-11 rounded-md border border-[#1e222d] text-slate-300 hover:border-amber-400 hover:text-amber-400 transition-colors font-semibold text-sm focus-visible:outline-2 focus-visible:outline-amber-400">
        Skip to dashboard →
      </a>
      {#if registry}
        <!-- UI-8: the market list still works even when the globe can't render -->
        <div class="mt-6 rounded-lg border border-[#1e222d] bg-[#11131a] text-left overflow-hidden">
          <div class="px-3 py-2 border-b border-[#1e222d] text-xs font-semibold text-slate-400">All markets</div>
          <AllMarketsList {registry} />
        </div>
      {/if}
    </div>
  </div>
{/if}
