// Formatting helpers ported byte-faithfully from globe/dashboard/index.html —
// output numbers must match the old page exactly.

export const pctStr = (v, d = 2) =>
  v == null ? 'n/a' : (v >= 0 ? '+' : '') + v.toFixed(d) + '%';

export const fmtB = (v, cur) => cur + (v / 1e9).toFixed(v >= 1e11 ? 0 : 1) + 'B';

export const tvURL = (t) =>
  'https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(t);

// Geometry half of the old sparkSVG() — rendering lives in Sparkline.svelte.
export function sparkPoints(spark, w = 64, h = 18) {
  if (!spark || spark.length < 2) return null;
  const mn = Math.min(...spark), mx = Math.max(...spark), rng = (mx - mn) || 1;
  const pts = spark
    .map((v, i) => `${(i / (spark.length - 1) * w).toFixed(1)},${(h - ((v - mn) / rng) * h).toFixed(1)}`)
    .join(' ');
  const up = spark[spark.length - 1] >= spark[0];
  return { pts, up };
}
