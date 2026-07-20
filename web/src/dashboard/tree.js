import { metricVal, metricColor, wavg, groupColor } from '../lib/metrics.js';

// Treemap data with explicit node ids so we can zoom programmatically
// (S:/I:/T: prefixes — byte-faithful port of buildTree()).
//
// groupStats (UI-2, mobile only): with leafDepth:1 the sector/industry group
// nodes render as tiles themselves, so they need a cap-weighted metric value
// (wavg) and a fill color. On desktop the groups are left untouched to keep
// exact visual parity with the old page.
export function buildTree(rows, metric, { groupStats = false } = {}) {
  const sectors = {};
  for (const r of rows) {
    const sec = r.gics_sector || 'Unknown', ind = r.gics_sub_industry || 'Other';
    (sectors[sec] = sectors[sec] || {});
    (sectors[sec][ind] = sectors[sec][ind] || []).push(r);
  }
  return Object.entries(sectors).map(([sec, inds]) => {
    const node = {
      name: sec,
      id: 'S:' + sec,
      children: Object.entries(inds).map(([ind, stocks]) => {
        const inode = {
          name: ind,
          id: 'I:' + sec + '|' + ind,
          children: stocks.map((s) => ({
            name: s.ticker,
            id: 'T:' + s.ticker,
            value: s.market_cap,
            mval: metricVal(s, metric),
            itemStyle: { color: metricColor(s, metric) },
            _raw: s,
          })),
        };
        if (groupStats) {
          const iv = wavg(stocks, metric);
          inode.mval = iv;
          inode.itemStyle = { color: groupColor(iv, metric) };
        }
        return inode;
      }),
    };
    if (groupStats) {
      const all = [].concat(...Object.values(inds));
      const sv = wavg(all, metric);
      node.mval = sv;
      node.itemStyle = { color: groupColor(sv, metric) };
    }
    return node;
  });
}
