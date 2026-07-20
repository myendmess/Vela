import { ui, setRows, setRegistry, getLive, findRow, currentIndex } from './store.svelte.js';
import { fetchRegistry, fetchDataset } from '../lib/data.js';
import { METRICS } from '../lib/metrics.js';
import { bus } from './treemapBus.js';

// ---------------------------------------------------------------------------
// UI-13: URL state — ?index=<id>&metric=<m>&t=<TICKER>
// Read on load, written via history.replaceState on metric/selection change,
// history.pushState on index switch (UI-16), restored on popstate.
// ---------------------------------------------------------------------------

function buildParams({ withTicker = true } = {}) {
  const p = new URLSearchParams();
  p.set('index', ui.indexId);
  if (ui.metric !== '1d') p.set('metric', ui.metric);
  if (withTicker && ui.selectedTicker) p.set('t', ui.selectedTicker);
  return p;
}

function syncURL() {
  history.replaceState(null, '', location.pathname + '?' + buildParams().toString());
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

let loadToken = 0;

export async function loadDataset({ pendingTicker = null } = {}) {
  const token = ++loadToken;
  ui.status = 'loading';
  ui.errorMsg = '';
  try {
    const entry = currentIndex();
    if (!entry) throw new Error('unknown index "' + ui.indexId + '"');
    const { rows, lastModified } = await fetchDataset(entry);
    if (token !== loadToken) return; // superseded by a newer load
    setRows(rows);
    ui.lastModified = lastModified;
    ui.drill = null;
    ui.status = 'ready';
    document.title = `Vela — ${entry.label} Map`;
    if (pendingTicker) {
      const s = findRow(pendingTicker);
      if (s) selectStock(s.ticker, { zoom: true });
    }
  } catch (e) {
    if (token !== loadToken) return;
    ui.status = 'error';
    ui.errorMsg = 'Failed to load data: ' + e;
  }
}

export async function boot() {
  const params = new URLSearchParams(location.search);
  const m = params.get('metric');
  if (m && METRICS[m]) ui.metric = m;
  const pendingTicker = (params.get('t') || '').toUpperCase() || null;
  try {
    const reg = await fetchRegistry();
    setRegistry(reg);
    // ?index=: valid live id → that index; absent/unknown/non-live → sp500.
    const q = (params.get('index') || 'sp500').toLowerCase();
    ui.indexId = getLive()[q] ? q : 'sp500';
    await loadDataset({ pendingTicker });
  } catch (e) {
    ui.status = 'error';
    ui.errorMsg = 'Failed to load data: ' + e;
  }
}

// UI-4: Retry from the error card.
export function retryLoad() {
  if (!getLive() || !Object.keys(getLive()).length) boot();
  else loadDataset();
}

// ---------------------------------------------------------------------------
// User actions
// ---------------------------------------------------------------------------

export function setMetric(m) {
  if (!METRICS[m] || m === ui.metric) return;
  ui.metric = m;
  syncURL();
}

export function selectStock(ticker, { zoom = false } = {}) {
  const s = findRow(ticker);
  if (!s) return;
  ui.selectedTicker = s.ticker;
  if (ui.isMobile && ui.sheet === 'closed') ui.sheet = 'peek'; // UI-1
  if (zoom) {
    const sec = s.gics_sector || 'Unknown', ind = s.gics_sub_industry || 'Other';
    // Mobile (leafDepth:1): re-rooting to a node deeper than the laid-out
    // depth blanks the treemap, so zoom to the sector instead — the industry
    // is then one tap away. Desktop zooms straight to the industry.
    const id = ui.isMobile ? 'S:' + sec : 'I:' + sec + '|' + ind;
    ui.drill = ui.isMobile ? { sector: sec } : { sector: sec, industry: ind };
    if (bus.zoomTo && ui.status === 'ready') bus.zoomTo(id);
    else bus.pendingZoom = id;
  }
  syncURL();
}

export function dismissSheet() {
  ui.sheet = 'closed';
  ui.selectedTicker = null;
  syncURL();
}

// UI-16: client-side index switching (chips) — pushState, no page reload;
// metric preserved, selection dropped.
export async function switchIndex(id) {
  if (id === ui.indexId || !getLive()[id]) return;
  ui.indexId = id;
  ui.selectedTicker = null;
  ui.sheet = 'closed';
  ui.drill = null;
  history.pushState(null, '', location.pathname + '?' + buildParams({ withTicker: false }).toString());
  await loadDataset();
}

export async function onPopState() {
  const p = new URLSearchParams(location.search);
  const m = p.get('metric');
  ui.metric = m && METRICS[m] ? m : '1d';
  const q = (p.get('index') || 'sp500').toLowerCase();
  const id = getLive()[q] ? q : 'sp500';
  const t = (p.get('t') || '').toUpperCase() || null;
  if (id !== ui.indexId) {
    ui.indexId = id;
    ui.selectedTicker = null;
    ui.sheet = 'closed';
    ui.drill = null;
    await loadDataset({ pendingTicker: t });
  } else if (t && findRow(t)) {
    selectStock(t);
  } else {
    ui.selectedTicker = null;
    ui.sheet = 'closed';
  }
}

// ---------------------------------------------------------------------------
// UI-5: drill state (ECharts' built-in breadcrumb is disabled; we track the
// path ourselves — our dispatches are the only thing that changes the zoom).
// ---------------------------------------------------------------------------

export function drillInto(nodeId) {
  if (nodeId.startsWith('I:')) {
    const [sector, industry] = nodeId.slice(2).split('|');
    ui.drill = { sector, industry };
  } else if (nodeId.startsWith('S:')) {
    ui.drill = { sector: nodeId.slice(2) };
  }
}

export function drillToSector(sector) {
  ui.drill = { sector };
  bus.zoomTo?.('S:' + sector);
}

export function drillBack() {
  if (!ui.drill) return;
  if (ui.drill.industry) drillToSector(ui.drill.sector);
  else drillReset();
}

export function drillReset() {
  ui.drill = null;
  bus.reset?.();
}

// UI-18: start the registry+dataset fetch immediately at module scope,
// before any component mounts.
boot();
