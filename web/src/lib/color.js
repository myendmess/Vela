// Color scales ported byte-faithfully from globe/dashboard/index.html —
// output strings must match the old page exactly.

// deep red → dark gray → vivid green
export const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
export const C_DOWN = [242, 54, 69], C_MID = [54, 58, 69], C_UP = [8, 153, 129];

export function colorRet(v, range) {
  if (v == null) return '#2a2e39';
  const t = Math.max(-1, Math.min(1, v / range));
  const c = t >= 0 ? lerp(C_MID, C_UP, t) : lerp(C_MID, C_DOWN, -t);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function colorPos(p) {
  if (p == null) return '#2a2e39';
  const c = p < 0.5 ? lerp(C_DOWN, C_MID, p / 0.5) : lerp(C_MID, C_UP, (p - 0.5) / 0.5);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export const pctColor = (v) => (v == null ? '#8b97a7' : v >= 0 ? 'var(--up)' : 'var(--down)');

// Legend gradient (formerly inline in the footer, now in the drill toolbar).
export const LEGEND_GRADIENT =
  'linear-gradient(90deg,#f23645,#803039 35%,#363a45 50%,#1e5f52 65%,#089981)';
