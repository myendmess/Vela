# video/ — daily S&P 500 recap Short (YouTube)

Third pipeline: turns `mapping/dashboard/data/sp500.json` + Finnhub headlines into a
~50–75s vertical video (Shotstack) and publishes it to YouTube as a Short, every
trading morning. Zero npm dependencies — plain Node 18+.

| | |
|---|---|
| Script | `video/make_video.js` (orchestrator) + `video/payload.js` (pure builder) |
| Workflow | `.github/workflows/daily-video.yml` |
| Schedule (cron UTC) | `0 6 * * 2-6` (Tue–Sat 06:00 UTC — after the 23:00 UTC data refresh, recaps the previous US close) |
| Data sources | repo's own `sp500.json` + **Finnhub** (news, free tier) + **Shotstack** stage (render, free tier, watermarked) |
| Output | public YouTube Short + optional playlist add |

## Video content
Intro → market breadth → best/worst sectors → top 5 gainers → "why it moved"
headline per big gainer → top 5 losers → same for losers → general market
headlines → outro pointing to the live heatmap. Title/description/tags are
generated daily from the actual movers (SEO). Tune `movers_with_news`,
`general_headlines`, branding and `playlist_id` in `video/config.json`.

## Secrets (repo Settings → Secrets and variables → Actions)
- `FINNHUB_API_KEY` — already exists (long-term scan). News degrades gracefully without it.
- `SHOTSTACK_API_KEY` — the **stage** key from dashboard.shotstack.io.
- `YT_CLIENT_ID`, `YT_CLIENT_SECRET` — the Google Cloud OAuth client (same one used for n8n).
- `YT_REFRESH_TOKEN` — obtain once, locally:
  1. Google Cloud Console → Credentials → the OAuth client → add redirect URI `http://localhost:8765/callback`.
  2. **Publish the OAuth consent screen** (Testing-mode refresh tokens expire after 7 days — useless for CI).
  3. `node video/get_refresh_token.js <CLIENT_ID> <CLIENT_SECRET>` → open the printed URL → sign in with the channel account → copy the printed token.

Until all secrets are set, scheduled runs log `SKIPPED` and exit green — nothing breaks.

## Behavior notes
- **Staleness guard:** if `sp500.json`'s last commit is older than 40 h, the run skips instead of posting a stale video.
- **Graceful degradation:** any Finnhub failure just removes news slides; a Shotstack failure or upload failure fails the run loudly.
- Quota: 1 upload = 1,600 + playlist add = 50 of YouTube's 10,000 daily units.
- Test from the Actions tab: *Daily Recap Video → Run workflow → dry_run = true* builds the payload without rendering or uploading.
- The n8n version of this pipeline (local, `D:\Claude\Automate`) produces identical videos and can stay as a manual backup.
