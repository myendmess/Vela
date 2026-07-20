// Globe data plumbing. Runtime fetch ONLY for live data (registry, VWCE
// weights) — the world topology is a self-hosted build asset (UI-18): the
// world-atlas countries file is imported with ?url so Vite serves/emits it as
// a hashed asset and the page makes zero third-party runtime requests.
//
// UI-18: both fetches start at module scope — importing this module kicks
// them off before the Svelte tree mounts.
import topoUrl from './countries-110m.json?url';
import { DAY } from '../lib/data.js';

// The globe page sits at the site root, so the registry is a sibling of the
// page (dev: /indexes.json; GitHub Pages: /Vela/indexes.json).
const registryHref = () => new URL('indexes.json', document.baseURI).href;

export const registryPromise = fetch(registryHref() + '?v=' + DAY).then((r) => {
  if (!r.ok) throw new Error('registry download failed: ' + r.status);
  return r.json();
});

export const topologyPromise = fetch(topoUrl).then((r) => {
  if (!r.ok) throw new Error('countries download failed: ' + r.status);
  return r.json();
});

// Keep early failures quiet until GlobeApp attaches its own handlers.
registryPromise.catch(() => {});
topologyPromise.catch(() => {});

// Lazy world-scope weights (data/vwce.json), same daily cache-bust as the
// registry.
export async function fetchWeights(entry) {
  const r = await fetch(new URL(entry.weights, document.baseURI).href + '?v=' + DAY);
  if (!r.ok) throw new Error('weights HTTP ' + r.status);
  return r.json();
}

// world-atlas keys countries by ISO 3166-1 numeric id; the registry and the
// VWCE weights use alpha-2. Covers every country any scope or weight can name.
export const NUM_TO_ISO2 = {
  840: 'US', 124: 'CA', 484: 'MX', 76: 'BR', 152: 'CL', 170: 'CO', 604: 'PE',
  826: 'GB', 372: 'IE', 250: 'FR', 276: 'DE', 380: 'IT', 724: 'ES', 620: 'PT',
  528: 'NL', 56: 'BE', 442: 'LU', 40: 'AT', 756: 'CH', 208: 'DK', 752: 'SE',
  578: 'NO', 246: 'FI', 616: 'PL', 203: 'CZ', 348: 'HU', 300: 'GR', 792: 'TR',
  392: 'JP', 156: 'CN', 344: 'HK', 158: 'TW', 410: 'KR', 356: 'IN', 702: 'SG',
  360: 'ID', 458: 'MY', 764: 'TH', 608: 'PH', 36: 'AU', 554: 'NZ',
  376: 'IL', 682: 'SA', 784: 'AE', 634: 'QA', 414: 'KW', 710: 'ZA', 818: 'EG',
};
