# Mapping — interactive global market heatmap

Everything for the market-map / dashboard project lives in this folder (`mapping/`).
It is **not** a separate repo — just the self-contained project home inside Vela,
a sibling of `reports/`.

**What it is:** a finviz-style interactive heatmap — pick an index, drill
**Sector → Industry → Stock**, boxes sized by market cap and colored by 52-week position.
Free-tier data only; no API keys in client-side code; no build step (CDN libraries).

**v1 scope:** S&P 500 only. The UI and data model are built for the full global
hierarchy below, but only S&P 500 is populated first; every other node is a "coming
soon" slot the same code fills later.

## Canonical lineage (the selector above the heatmap)
```
Global Markets
├─ Americas
│  ├─ USA       → S&P 500 ◄── v1 ── │ Dow 30 │ Nasdaq Composite │ Russell 2000
│  └─ Canada    → S&P/TSX Composite │ S&P/TSX 60
├─ Europe
│  ├─ Pan-EU    → STOXX 600 │ EURO STOXX 50
│  ├─ Germany   → DAX 40
│  ├─ France    → CAC 40
│  └─ Italy     → FTSE MIB
└─ Asia
   ├─ China     → CSI 300 │ Shanghai Composite │ Shenzhen Component
   ├─ Taiwan    → TAIEX │ FTSE TWSE Taiwan 50
   ├─ Japan     → Nikkei 225 │ TOPIX
   └─ Korea     → KOSPI │ KOSDAQ
                    │
                    └─►  [ heatmap ]  Sector → Industry → Stock
                         size = market cap · color = 52-week position
```
**Region → Country → Index** is the navigation selector; choosing an index loads its
dataset and renders the Sector → Industry → Stock treemap.

## Architecture (free-tier + secure)
A finviz-style map is a frontend over a *pre-aggregated* dataset — not live per-visitor
API calls (impossible on free tier, and would expose keys). So:
```
[GitHub Actions batch job]        writes      [Live web app]
pull universe, classify       ──── data/*.json ───►  ECharts treemap, drill-down,
sector/industry, compute                              hover, index selector
52-wk position (rate-limited)                         (loads JSON, no keys)
        ▲ runs on a schedule                                 served via GitHub Pages
```
The web app's *interactivity* is fully live in the browser; the *data* is a scheduled
near-EOD snapshot (same freshness finviz free gives).

## Data sources (validated 2026-06-28 — all keyless)
| Field | Source | Call |
|---|---|---|
| Constituents + **GICS** sector/sub-industry | datahub `s-and-p-500-companies/constituents.csv` | 1 bulk |
| Market cap + price (+ NASDAQ sector/industry) | NASDAQ screener `api/screener/stocks?download=true` | 1 bulk (~7k rows) |
| 52-week high/low | NASDAQ `api/quote/<sym>/summary?assetclass=stocks` | per-symbol (needs `User-Agent`) |

- `wk52_position = (price − low) / (high − low)`, clamped 0–1 → the color metric.
- Group the treemap by **GICS** sector → sub-industry (cleaner than NASDAQ's classification).
- **Scaling caveat:** the bulk calls cover sector/industry/mcap/price in 2 requests, but
  52-week needs ~503 **per-symbol** NASDAQ calls — rate-limit politely. If NASDAQ throttles
  at full scale, **Finnhub `/stock/metric` (CI secret) is the fallback** for 52-week.
- Spike artifact: `data/sp500.sample.json` (18 rows).

## Internal layout
```
mapping/
├─ scripts/     # batch builders: fetch universe -> data/*.json (Python, rate-limited)
├─ data/        # generated datasets, e.g. sp500.json (one file per index)
└─ dashboard/   # the static web app: index.html + JS (ECharts via CDN) + assets
```

## Build & deploy
- **Hosting:** GitHub Pages, **Deploy from a branch** (`main` / root). The repo-root
  `index.html` redirects `…/Vela/` → `…/Vela/mapping/dashboard/`; `.nojekyll`
  serves files as-is. Live: **https://myendmess.github.io/Vela/**.
- **Builder:** `scripts/build_sp500.py` → writes `dashboard/data/sp500.json`. Runs in CI
  (Python 3.11). Env: `RATE_SLEEP`, `LIMIT` (cap symbols for testing), `FINNHUB_API_KEY`
  (optional 52-week fallback). No local Python on the dev box — verify via CI.
- **Workflow:** `.github/workflows/mapping.yml` (schedule `0 23 * * 1-5` + `workflow_dispatch`)
  rebuilds the data and commits it to `main`; branch-deploy auto-republishes. (No Pages-deploy
  steps — that's only for the "GitHub Actions" source, which we are not using.)
- **Portfolio integration:** link/embed the live URL from the portfolio (a Projects card /
  iframe), not built into the portfolio repo.

## Known risk
US data (v1) is free-tier-friendly. Non-US index constituents + per-stock fundamentals
(EU / China / Taiwan / Japan / Korea) are scarce-to-paywalled on free tiers — the global
expansion may stall on **data availability**, not code. Architected to scale regardless.

## Conventions
- Free-tier only; never embed an API key in `dashboard/` (client-side).
- No build step / framework — plain HTML/CSS/JS + CDN libs (matches the portfolio's ethos).
- Builders degrade gracefully: a missing key / failed source = partial data, never a crash.
- One JSON dataset per index in `data/`; adding an index = new data file + un-grey its selector node.

## Index registry & global rollout (v2, 2026-07-07)

The dashboard is now **index-agnostic**: `?index=<id>` selects the dataset
(`?index=ftse-mib`; default `sp500`, so the original URL is unchanged). The nav
chips are generated from a small `INDEXES` registry in `dashboard/index.html`
(label, data file, breadcrumb path, currency symbol).

**Adding an index = three pieces, no app changes beyond one registry line:**
1. `data/<index>_universe.csv` — constituents (`ticker,yahoo,name,sector,sub_industry`).
   For FTSE MIB this is a **self-updating cache**: the builder refreshes it from
   Wikipedia's constituents table every run (rebalances land automatically;
   Wikipedia unreachable = committed CSV fallback). Zero manual maintenance.

2. `scripts/build_<index>.py` — emits `dashboard/data/<index>.json` in the exact
   `sp500.json` schema (see `build_ftsemib.py` for the yfinance-based template;
   refuses to overwrite good data if <60% of names build).
3. One entry in the `INDEXES` registry + a step in `mapping.yml`.

**Live so far:** `sp500` (NASDAQ APIs), `ftse-mib` (Yahoo via yfinance — Milan
listings aren't on NASDAQ's endpoints; Stooq is the documented fallback if Yahoo
sours on CI runners). All three pipelines (mapping + both scanners) open a
GitHub Issue automatically on failure — silent breakage is designed out.

**Candidate next indices** (all reachable with the same yfinance pattern):
| Index | Universe source | Yahoo suffix |
|---|---|---|
| DAX 40 (Germany) | hand-curated, 40 names | `.DE` |
| CAC 40 (France) | hand-curated, 40 names | `.PA` |
| STOXX 600 (Europe) | large — needs a maintained constituents source first | mixed |
| FTSE 100 (UK) | hand-curated, 100 names | `.L` |
| Nikkei 225 (Japan) | hand-curated, 225 names | `.T` |
| KOSPI (Korea) | availability spotty on free tiers | `.KS` |

Longer-term: a landing hierarchy (Global Markets → Region → Country → Index)
rendered from the registry, replacing the flat chip row once >4 indices exist.
