# Contributing to Market-Scan

Thanks for your interest! Issues and pull requests are welcome — this is a
solo-maintained portfolio project, so expect friendly but not instant reviews.

## Ground rules

1. **Free-tier only.** The whole point of this project is $0/month. PRs that
   introduce a paid data provider, a paid render tier, or any service that
   can't run on a free plan will be declined — regardless of how good they are.
2. **Degrade gracefully, never crash.** A missing key, a failed API, or an
   empty response must produce a partial artifact or a clean green skip — the
   scheduled runs should never go red because a third party hiccuped. (Real
   failures — render or upload errors — *should* go red; they auto-open an
   issue.)
3. **No secrets in code.** Ever. Keys live in GitHub Actions secrets; local
   development uses a gitignored `.env`.
4. **Keep the provider split.** Finnhub belongs to the long-term scan and the
   video news; Alpha Vantage belongs to the short-term scan. Don't mix them.

## Project map

| Area | Language / runtime | Where it runs | Docs |
|---|---|---|---|
| Scanners (`scripts/`) | Python 3.11, `requests` | GitHub Actions | [README](README.md) |
| Heatmap (`mapping/`) | Python builder + static ECharts page | Actions + GitHub Pages | [`mapping/README.md`](mapping/README.md) |
| Daily video (`video/`) | Node 18+, **zero npm dependencies** | GitHub Actions | [`video/README.md`](video/README.md) |

## Developing & testing

- **Scanners / heatmap:** verified through CI. Open a PR and the conversation
  happens on the diff; there is no local test suite for the Python side yet.
- **Video pipeline:** `node video/make_video.js --dry-run` builds the full
  Shotstack payload and prints the chosen headlines without rendering or
  uploading — this must pass before any `video/` PR.
- **Workflow changes:** test from your branch via the Actions tab
  (*Run workflow → select your branch*), using `dry_run=true` or
  `privacy=private` so nothing public is affected.

## Commit style

Conventional-commits-ish, as in the existing history: `feat(video): …`,
`fix(video): …`, `chore: …`, `docs: …`.

## Code of Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
