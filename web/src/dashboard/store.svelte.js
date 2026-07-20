// Reactive UI state (Svelte 5 runes) + non-reactive data holders.
//
// The ~500-row dataset is deliberately kept OUT of Svelte reactivity: it lives
// in a plain module-level array; `ui.dataVersion` is bumped whenever it is
// replaced so derived views know to recompute.

export const ui = $state({
  status: 'loading', // 'loading' | 'ready' | 'error'
  errorMsg: '',
  indexId: 'sp500',
  metric: '1d',
  selectedTicker: null,
  drill: null, // null | { sector } | { sector, industry }
  sheet: 'closed', // mobile bottom sheet: 'closed' | 'peek' | 'full'
  searchOpen: false, // mobile search overlay
  dataVersion: 0,
  registryVersion: 0,
  lastModified: null, // raw Last-Modified header string or null
  isMobile: false, // < 768px
  isTouch: false, // (hover: none)
});

let rows = [];
export const getRows = () => rows;
export function setRows(r) {
  rows = r;
  ui.dataVersion++;
}
export const findRow = (ticker) => rows.find((r) => r.ticker === ticker) ?? null;

let registry = null; // full registry (live + coming soon)
let live = {}; // live entries only
export const getRegistry = () => registry;
export const getLive = () => live;
export function setRegistry(reg) {
  registry = reg;
  live = {};
  for (const [id, e] of Object.entries(reg)) if (e.status === 'live') live[id] = e;
  ui.registryVersion++;
}

export const currentIndex = () => live[ui.indexId] ?? null;
export const comingSoonLabels = () =>
  registry ? Object.values(registry).filter((e) => e.status !== 'live').map((e) => e.label) : [];
