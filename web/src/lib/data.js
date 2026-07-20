// Registry + dataset fetching. Runtime fetch ONLY — data JSON is never
// imported at build time.
//
// "Registry-anchored resolution": the registry lives at ../indexes.json
// relative to the page; each index's `file` (e.g. "data/sp500.json") resolves
// against new URL('dashboard/', registryUrl). This works both in dev
// (/dashboard/ + /indexes.json) and on GitHub Pages
// (/Vela/globe/dashboard/ + /Vela/globe/indexes.json).

// Daily cache-bust: data refreshes once a day, so a date-stamped URL keeps
// browsers from serving yesterday's JSON without disabling caching entirely.
export const DAY = new Date().toISOString().slice(0, 10);

export const registryUrl = () => new URL('../indexes.json', document.baseURI);

export async function fetchRegistry() {
  const r = await fetch(registryUrl().href + '?v=' + DAY);
  if (!r.ok) throw new Error('registry HTTP ' + r.status);
  return r.json();
}

export async function fetchDataset(entry) {
  const url = new URL(entry.file, new URL('dashboard/', registryUrl()));
  const r = await fetch(url.href + '?v=' + DAY);
  if (!r.ok) throw new Error('dataset HTTP ' + r.status);
  // UI-6: freshness stamp from the HTTP Last-Modified header (may be absent).
  const lastModified = r.headers.get('last-modified');
  const rows = await r.json();
  return { rows, lastModified };
}
