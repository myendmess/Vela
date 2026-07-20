<script>
  // ECharts wrapper — owns the chart instance. Tree-shaken import: treemap
  // chart + tooltip + canvas renderer only (echarts pinned at 5.5.0).
  import * as echarts from 'echarts/core';
  import { TreemapChart } from 'echarts/charts';
  import { TooltipComponent } from 'echarts/components';
  import { CanvasRenderer } from 'echarts/renderers';
  import { onMount } from 'svelte';
  import { ui, getRows, currentIndex } from './store.svelte.js';
  import { buildTree } from './tree.js';
  import { METRICS, metricVal, metricStr } from '../lib/metrics.js';
  import { pctStr, fmtB } from '../lib/format.js';
  import { pctColor } from '../lib/color.js';
  import { bus } from './treemapBus.js';
  import { selectStock, drillInto, dismissSheet } from './actions.js';

  echarts.use([TreemapChart, TooltipComponent, CanvasRenderer]);

  let el;
  let chart = null;

  // Tile label — byte-faithful port, except pos52 renders unsigned (UI-15).
  function labelFormatter(p) {
    const v = p.data && p.data.mval;
    if (v == null) return p.name;
    const s = ui.metric === 'pos52' ? Math.round(v) + '%' : (v >= 0 ? '+' : '') + Math.round(v) + '%';
    return `${p.name}\n${s}`;
  }

  function tooltipFormatter(info) {
    const CUR = currentIndex()?.cur ?? '';
    const d = info.data && info.data._raw;
    if (!d) return `<b>${info.name}</b><br>${fmtB(info.value, CUR)}`;
    let html =
      `<b>${d.ticker}</b> — ${d.name}<br>` +
      `<span style="color:#8b97a7">${CUR}${d.price} · 1D <span style="color:${pctColor(d.perf && d.perf['1d'])}">${pctStr(d.perf && d.perf['1d'])}</span></span>`;
    if (ui.metric !== '1d')
      html += `<br><span style="color:#8b97a7">${METRICS[ui.metric].label} ${metricStr(metricVal(d, ui.metric), ui.metric)}</span>`;
    return html + `<br><span style="color:#61708d;font-size:11px">click to inspect ↗</span>`;
  }

  // SERIES_BASE port. Changes vs the old page:
  // - breadcrumb disabled (UI-5 — the drill toolbar replaces it)
  // - upperLabel gets a " ›" affordance signaling tappability (UI-5)
  // - leafDepth:1 on mobile (UI-2 — sector-first view)
  function seriesBase(mobile) {
    return {
      type: 'treemap', roam: false, nodeClick: false,
      width: '100%', height: '100%', top: 0, left: 0, right: 0, bottom: 0,
      ...(mobile ? { leafDepth: 1 } : {}),
      label: { show: true, color: '#fff', fontSize: 11, fontWeight: 600, lineHeight: 13, formatter: labelFormatter },
      upperLabel: { show: true, height: 20, color: '#cbd5e1', fontSize: 11, formatter: (p) => p.name + ' ›' },
      itemStyle: { borderColor: '#0c0d12', borderWidth: 1, gapWidth: 1 },
      levels: [
        { itemStyle: { borderColor: '#0c0d12', borderWidth: 5, gapWidth: 5 }, upperLabel: { show: true, color: '#fbbf24', fontWeight: 700 } },
        { itemStyle: { borderColor: '#0c0d12', borderWidth: 2, gapWidth: 2 } },
        { itemStyle: { borderWidth: 1, gapWidth: 1 } },
      ],
      breadcrumb: { show: false },
    };
  }

  function fullOption() {
    return {
      backgroundColor: 'transparent',
      tooltip: {
        // UI-19: no tooltip on touch devices — the sheet peek replaces it.
        show: !ui.isTouch,
        backgroundColor: 'rgba(19,23,34,.94)', borderColor: '#1e222d',
        textStyle: { color: '#e6edf3', fontSize: 12 },
        formatter: tooltipFormatter,
      },
      series: [{
        ...seriesBase(ui.isMobile),
        data: buildTree(getRows(), ui.metric, { groupStats: ui.isMobile }),
      }],
    };
  }

  // Desktop (full 3-level view): treemapZoomToNode = the old "isolate"
  // behavior. Mobile (leafDepth:1, UI-2): drilling means re-rooting —
  // treemapRootToNode is what ECharts' built-in drill uses; zoomToNode does
  // not reveal children in leafDepth mode. Used for clicks on visible nodes
  // and for pendingZoom right after a fresh option apply.
  function zoomRaw(id) {
    if (!chart) return;
    try {
      chart.dispatchAction({
        type: ui.isMobile ? 'treemapRootToNode' : 'treemapZoomToNode',
        seriesIndex: 0,
        targetNodeId: id,
      });
    } catch (e) { /* node may not exist */ }
  }

  // External zoom requests (search select, drill toolbar, deep links) can
  // arrive while the mobile view is rooted elsewhere; re-rooting to a node
  // outside the current layout blanks the treemap, so re-apply the full
  // option first, then dispatch on the next frame.
  function zoomTo(id) {
    if (!chart) return;
    if (ui.isMobile) {
      chart.setOption(fullOption(), true);
      requestAnimationFrame(() => zoomRaw(id));
    } else {
      zoomRaw(id);
    }
  }

  // Reset = re-apply the full option with notMerge, which drops the zoom state.
  function reset() {
    if (chart) chart.setOption(fullOption(), true);
  }

  onMount(() => {
    chart = echarts.init(el, null, { renderer: 'canvas' });
    if (import.meta.env.DEV) window.__chart = chart; // debug only, dev builds only
    // leaf click = anchor in inspector; group click (sector/industry title or
    // mobile group tile) = isolate it and track the drill path (UI-5).
    chart.on('click', (p) => {
      if (p.data && p.data._raw) {
        selectStock(p.data._raw.ticker);
      } else if (p.data && p.data.id) {
        // UI-1: on mobile, tapping the map anywhere but a stock tile
        // dismisses the sheet (tiles cover the canvas, so blank-area taps
        // are rare — treat group taps as "tap map" too).
        if (ui.isMobile && ui.sheet !== 'closed') dismissSheet();
        zoomRaw(p.data.id); // clicked node is visible — direct dispatch is safe
        drillInto(p.data.id);
      }
    });
    // UI-1: tap on map background dismisses the mobile sheet.
    chart.getZr().on('click', (e) => {
      if (!e.target && ui.isMobile && ui.sheet !== 'closed') dismissSheet();
    });
    const ro = new ResizeObserver(() => chart && chart.resize());
    ro.observe(el);
    bus.zoomTo = zoomTo;
    bus.reset = reset;
    return () => {
      ro.disconnect();
      bus.zoomTo = null;
      bus.reset = null;
      bus.pendingZoom = null;
      chart.dispose();
      chart = null;
    };
  });

  // dataVersion / layout change → full option (notMerge; resets zoom).
  // metric-only change → setOption on the live instance, never re-init
  // (parity with the old refresh()).
  let prev = { dv: -1, layout: '' };
  $effect(() => {
    const dv = ui.dataVersion;
    const m = ui.metric;
    const layout = ui.isMobile + '|' + ui.isTouch;
    if (!chart || dv === 0) return;
    if (dv !== prev.dv || layout !== prev.layout) {
      chart.setOption(fullOption(), true);
      if (bus.pendingZoom) {
        const id = bus.pendingZoom;
        bus.pendingZoom = null;
        requestAnimationFrame(() => zoomRaw(id)); // option was just applied fresh
      }
    } else {
      chart.setOption({ series: [{ data: buildTree(getRows(), m, { groupStats: ui.isMobile }) }] });
    }
    prev = { dv, layout };
  });
</script>

<div bind:this={el} class="w-full h-full"></div>
