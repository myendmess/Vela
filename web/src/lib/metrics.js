import { colorRet, colorPos, pctColor } from './color.js';
import { pctStr } from './format.js';

// UI-15: the old internally-inconsistent "low" metric ("Gain from 52w Low",
// colored by colorPos but numbered as gain-from-low) is replaced by "pos52"
// (52-Week Position): value = wk52_position*100 (0–100%), color = colorPos,
// legend "52w low → 52w high". Label, color, number and legend now agree.
export const METRICS = {
  '1d': { label: '1-Day', range: 3 },
  '1w': { label: '1-Week', range: 6 },
  '1m': { label: '1-Month', range: 12 },
  '3m': { label: '3-Month', range: 25 },
  '6m': { label: '6-Month', range: 40 },
  '1y': { label: '1-Year', range: 60 },
  mtd: { label: 'Month-to-Date', range: 12 },
  pos52: { label: '52-Week Position' },
};

// <option> list (long labels match the old <select>).
export const METRIC_OPTIONS = [
  ['1d', '1-Day'],
  ['1w', '1-Week'],
  ['1m', '1-Month'],
  ['3m', '3-Month (Quarter)'],
  ['6m', '6-Month (Half)'],
  ['1y', '1-Year'],
  ['mtd', 'Month-to-Date'],
  ['pos52', '52-Week Position'],
];

export const metricVal = (s, metric) =>
  metric === 'pos52'
    ? (s.wk52_position != null ? s.wk52_position * 100 : null)
    : (s.perf ? s.perf[metric] : null);

export const metricColor = (s, metric) =>
  metric === 'pos52'
    ? colorPos(s.wk52_position)
    : colorRet(metricVal(s, metric), METRICS[metric].range);

// String for a metric value: signed % for returns, unsigned 0–100% for pos52.
export const metricStr = (v, metric, d = 2) =>
  metric === 'pos52' ? (v == null ? 'n/a' : v.toFixed(0) + '%') : pctStr(v, d);

// Text color for a metric value (v already in metricVal units).
export const metricTextColor = (v, metric) =>
  metric === 'pos52' ? (v == null ? '#8b97a7' : colorPos(v / 100)) : pctColor(v);

// Cap-weighted average of the current metric over a set of rows (byte-faithful port).
export function wavg(rows, metric) {
  let n = 0, d = 0;
  for (const r of rows) {
    const v = metricVal(r, metric);
    if (v == null || !r.market_cap) continue;
    n += v * r.market_cap;
    d += r.market_cap;
  }
  return d ? n / d : null;
}

// Fill color for a sector/industry group given its cap-weighted metric value.
export const groupColor = (v, metric) =>
  metric === 'pos52'
    ? colorPos(v == null ? null : v / 100)
    : colorRet(v, METRICS[metric].range);

export const legendEndpoints = (metric) =>
  metric === 'pos52'
    ? { lo: '52w low', hi: '52w high' }
    : { lo: '−' + METRICS[metric].range + '%', hi: '+' + METRICS[metric].range + '%' };
