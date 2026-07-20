// Tiny imperative bridge to the live ECharts instance owned by Treemap.svelte.
// Actions call bus.zoomTo/bus.reset; if the chart isn't mounted yet (e.g. a
// ?t= deep link arriving with the first dataset), the zoom is parked in
// pendingZoom and consumed by Treemap after its next full option apply.
export const bus = {
  zoomTo: null, // (nodeId) => void
  reset: null, // () => void
  pendingZoom: null, // nodeId | null
};
