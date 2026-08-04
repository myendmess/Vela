# video/ — daily S&P 500 recap Short (YouTube)

Third pipeline: turns `globe/dashboard/data/sp500.json` + Finnhub headlines into a
~50–75s vertical video (rendered locally with ffmpeg) and publishes it to YouTube
as a Short, every trading morning. Zero npm dependencies — plain Node 18+.

| | |
|---|---|
| Script | `video/make_video.js` (orchestrator) + `video/payload.js` (pure builder) + `video/render.js` (ffmpeg renderer) |
| Workflow | `.github/workflows/daily-video.yml` |
| Schedule (cron UTC) | `0 6 * * 2-6` (Tue–Sat 06:00 UTC — after the 23:00 UTC data refresh, recaps the previous US close) |
| Data sources | repo's own `sp500.json` + **Finnhub** (news, free tier) |
| Rendering | **ffmpeg**, in the Actions runner — free, unlimited, no watermark |
| Output | public YouTube Short + optional playlist add |

## Video content
Intro → market breadth → best/worst sectors → top 5 gainers → "why it moved"
headline per big gainer → top 5 losers → same for losers → general market
headlines → outro pointing to the live heatmap. Title/description/tags are
generated daily from the actual movers (SEO).

Everything tunable in `video/config.json`:

| key | purpose |
|---|---|
| `movers_with_news` / `general_headlines` | how many headline slides |
| `playlist_id` | playlist every upload is added to (blank = skip) |
| `privacy_status` | `public` / `unlisted` / `private` |
| `notify_subscribers` | `true` pings subscribers on each upload (drives Shorts velocity) |
| `accent_color` / `sound_url` / `site_*` | branding |

## Secrets (repo Settings → Secrets and variables → Actions)
- `FINNHUB_API_KEY` — already exists (long-term scan). News degrades gracefully without it.
- `YT_CLIENT_ID`, `YT_CLIENT_SECRET` — the Google Cloud OAuth client (same one used for n8n).
- `YT_REFRESH_TOKEN` — obtain once, locally:
  1. Google Cloud Console → Credentials → the OAuth client → add redirect URI `http://localhost:8765/callback`.
  2. **Publish the OAuth consent screen** (Testing-mode refresh tokens expire after 7 days — useless for CI).
  3. `node video/get_refresh_token.js <CLIENT_ID> <CLIENT_SECRET>` → open the printed URL → sign in with the channel account → copy the printed token.

Until all secrets are set, scheduled runs log `SKIPPED` and exit green — nothing breaks.

## Rendering (ffmpeg, local)
`video/render.js` composites the timeline into an mp4 in a single ffmpeg pass —
no render API, no per-render cost, no watermark. The workflow installs what it
needs; to render on your own machine:

```bash
sudo apt-get install -y ffmpeg fonts-montserrat      # macOS: brew install ffmpeg + install Montserrat
node video/make_video.js --render-only recap.mp4     # build + render, stop before upload
node video/render.js video/test/golden/payload.golden.json out.mp4   # render a saved payload
```

- **Font:** Montserrat ExtraBold, found automatically in the usual system paths
  or via `fc-match`; override with `VIDEO_FONT=/path/to/font.otf`. Text is wrapped
  using the font's real advance widths (`video/font.js` reads them straight out of
  the `cmap`/`hmtx` tables), which is what keeps headlines inside the 920 px box.
- **Assets:** the logo is read from the checkout rather than fetched when its URL
  points at this repo's own Pages site; the soundtrack is downloaded per run.
- **Tests:** `node video/test/run_render_tests.js` covers wrapping, font metrics,
  the generated filter graph, and an end-to-end smoke render (the graph and
  wrapping tests use a stub font, so they run without ffmpeg installed).

## News selection (quality rules)
- **General headlines:** market-keyword filtered, then only items **<24 h old**, ranked by
  source quality (Reuters/Bloomberg/CNBC/etc. first) and recency; clickbait ("...?!") demoted.
  If the feed has nothing fresh, falls back to the best unused older headline.
- **Company headlines:** fetched since the previous trading day (4-day window on Tuesdays
  to cover weekend news), newest first.
- **No repeats, ever:** every headline shown is recorded in `video/state.json` (14-day
  rolling window, committed back by the workflow) and excluded from future videos.

## Failure alerts
Any failed run automatically opens (or comments on) a GitHub Issue titled
*"Daily video pipeline failed"* with a link to the log. Test it any time:
*Run workflow → `simulate_failure = true`* — the run fails on purpose and the issue appears.

## Behavior notes
- **Freshness guard (scheduled runs only):** if `sp500.json`'s last commit is older than 18 h the scheduled run skips. Because `globe.yml` only commits when data changes, a weekend / US holiday / stalled pipeline leaves the file ≥31 h old — so this prevents posting a duplicate recap of an unchanged close. Manual `workflow_dispatch` runs bypass the guard so you can always trigger one on demand.
- **Graceful degradation:** any Finnhub failure just removes news slides; a render or upload failure fails the run loudly.
- Quota: 1 upload = 1,600 + playlist add = 50 of YouTube's 10,000 daily units.
- **Testing from the Actions tab** (*Daily Recap Video → Run workflow*):
  - `dry_run = true` → builds the payload only, no render/upload.
  - `render_only = true` → renders the real mp4 and attaches it to the run as the `recap-mp4` artifact, without uploading to YouTube. The way to preview a change.
  - `dry_run = false`, `privacy = private` → full real run but the video lands **private** so you can verify it before making it public. Leave `privacy` blank to use `config.json`.
- The n8n version of this pipeline (local, `D:\Claude\Automate`) produces identical videos and can stay as a manual backup.
