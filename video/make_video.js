'use strict';

// Daily S&P 500 recap Short: build -> render (ffmpeg) -> upload (YouTube).
// Zero npm dependencies (Node 18+ global fetch). Runs in GitHub Actions
// (.github/workflows/daily-video.yml) or locally: node video/make_video.js --dry-run
//
// Env: FINNHUB_API_KEY, YT_CLIENT_ID, YT_CLIENT_SECRET,
//      YT_REFRESH_TOKEN, PLAYLIST_ID (optional, overrides config.json)
// Missing YouTube secrets = graceful skip (exit 0), so the scheduled run stays
// green until secrets are configured. See video/README.md.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { buildPayload, pickMovers } = require('./payload');
const { renderLocal } = require('./render');

const cfg = require('./config.json');
const REPO_ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(REPO_ROOT, 'globe', 'dashboard', 'data', 'sp500.json');
const DRY_RUN = process.argv.includes('--dry-run');
// --render-only [file]: build and render, then stop before uploading - the way
// to eyeball a real mp4 (locally, or as a CI artifact) without publishing it
const RENDER_ONLY = process.argv.includes('--render-only');
const RENDER_OUT = (() => {
  const i = process.argv.indexOf('--render-only');
  const next = i >= 0 ? process.argv[i + 1] : null;
  return next && !next.startsWith('--') ? next : 'recap.mp4';
})();
// sp500.json is committed ~23:00 UTC, ~7h before the 06:00 UTC run. globe.yml
// only commits when data changes, so a weekend / US holiday / stalled pipeline
// leaves the file much older (>=31h) - the guard skips those so we never post a
// duplicate recap of an unchanged close. Only enforced on scheduled runs.
const MAX_DATA_AGE_HOURS = 18;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// video/state.json remembers which headlines past videos used (14-day window)
// so no headline ever appears in two videos. Committed back by the workflow.
const STATE_FILE = path.join(__dirname, 'state.json');

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { used_headlines: Array.isArray(s.used_headlines) ? s.used_headlines : [] };
  } catch (e) {
    return { used_headlines: [] };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

async function jfetch(url, opts, what) {
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(what + ' failed: HTTP ' + res.status + ' - ' + text.slice(0, 300));
  return text ? JSON.parse(text) : {};
}

// hours since the data file's last commit; null if unknown (shallow clone, no git)
function dataAgeHours() {
  try {
    const ct = execSync('git log -1 --format=%ct -- "globe/dashboard/data/sp500.json"', {
      cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
    return ct ? (Date.now() / 1000 - Number(ct)) / 3600 : null;
  } catch (e) {
    return null;
  }
}

async function getNews(movers) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    log('FINNHUB_API_KEY not set - skipping news slides (video still renders).');
    return { generalNews: [], companyNews: [] };
  }
  let generalNews = [];
  try {
    generalNews = await jfetch('https://finnhub.io/api/v1/news?category=general&token=' + key, {}, 'Finnhub general news');
  } catch (e) {
    log('WARN:', e.message);
  }
  const companyNews = [];
  const to = new Date().toISOString().slice(0, 10);
  // window = since the previous trading day: Tuesday recaps Monday, whose moves
  // are often driven by weekend news, so look back 4 days; otherwise 2 is enough
  const lookbackDays = new Date().getUTCDay() === 2 ? 4 : 2;
  const from = new Date(Date.now() - lookbackDays * 864e5).toISOString().slice(0, 10);
  for (const m of movers) {
    try {
      const items = await jfetch(
        `https://finnhub.io/api/v1/company-news?symbol=${m.ticker}&from=${from}&to=${to}&token=${key}`,
        {}, 'Finnhub company news ' + m.ticker
      );
      companyNews.push(...items);
    } catch (e) {
      log('WARN:', e.message);
    }
    await sleep(300); // stay far below Finnhub's 60 req/min
  }
  return { generalNews, companyNews };
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.YT_CLIENT_ID,
    client_secret: process.env.YT_CLIENT_SECRET,
    refresh_token: process.env.YT_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });
  const json = await jfetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  }, 'Google token refresh');
  return json.access_token;
}

async function uploadToYouTube(videoBuf, meta, accessToken) {
  const snippet = {
    title: meta.title,
    description: meta.description,
    tags: meta.tags.split(','),
    categoryId: '25',
    defaultLanguage: 'en'
  };
  const status = {
    privacyStatus: process.env.YT_PRIVACY || cfg.privacy_status || 'public',
    selfDeclaredMadeForKids: false,
    embeddable: true
  };

  const boundary = 'recap' + Date.now();
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ snippet, status }) +
    `\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

  const notify = cfg.notify_subscribers === false ? 'false' : 'true';
  const json = await jfetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status&notifySubscribers=' + notify, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'multipart/related; boundary=' + boundary
    },
    body: Buffer.concat([head, videoBuf, tail])
  }, 'YouTube upload');
  return json.id;
}

async function addToPlaylist(videoId, playlistId, accessToken) {
  await jfetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } }
    })
  }, 'YouTube playlist add');
}

async function main() {
  // 1. Load data + staleness guard (skip rather than post a duplicate of an old close)
  const stocks = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  log('Loaded', stocks.length, 'tickers from sp500.json');

  const enforceFreshness = !DRY_RUN && process.env.SCHEDULED_RUN === 'true';
  const age = dataAgeHours();
  if (age !== null) log('Data age:', age.toFixed(1), 'hours' + (enforceFreshness ? '' : ' (freshness guard off - manual/dry run)'));
  if (enforceFreshness && age !== null && age > MAX_DATA_AGE_HOURS) {
    log(`SKIPPED: sp500.json is ${age.toFixed(0)}h old (> ${MAX_DATA_AGE_HOURS}h) - last night's refresh produced no update (weekend / US holiday / stalled pipeline), so there's nothing new to recap. No video today.`);
    return;
  }

  // 2. News
  const movers = pickMovers(stocks, Number(cfg.movers_with_news) || 2);
  const { generalNews, companyNews } = await getNews(movers);
  log('News:', generalNews.length, 'general items,', companyNews.length, 'company items for', movers.map(m => m.ticker).join('/'));

  // 3. Build payload (usedBefore = headlines already shown in past videos)
  const state = loadState();
  const payload = buildPayload({ stocks, generalNews, companyNews, movers, cfg, usedBefore: state.used_headlines.map(e => e.h) });

  const allNews = [...generalNews, ...companyNews];
  for (const h of payload.used_headlines) {
    const item = allNews.find(n => n && n.headline === h);
    const ageH = item && item.datetime ? ((Date.now() / 1000 - item.datetime) / 3600).toFixed(1) + 'h old' : 'age unknown';
    log(`Headline used (${ageH}):`, h.slice(0, 90));
  }
  const tracks = payload.timeline.tracks;
  const duration = Math.max(...tracks.flatMap(tr => tr.clips.map(c => c.start + c.length)));
  log('Payload built:', tracks.length, 'tracks,', tracks.reduce((a, tr) => a + tr.clips.length, 0), 'clips,', duration.toFixed(1) + 's');
  log('Title:', payload.youtube.title);

  if (DRY_RUN) {
    log('DRY RUN - stopping before render/upload. Payload OK.');
    return;
  }

  if (RENDER_ONLY) {
    await renderLocal(payload, RENDER_OUT, log);
    log('RENDER ONLY - wrote ' + RENDER_OUT + ', stopping before upload.');
    return;
  }

  // 4. Secrets gate: neutral skip so scheduled runs stay green until configured
  const missing = ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN'].filter(k => !process.env[k]);
  if (missing.length) {
    log('SKIPPED: missing secrets: ' + missing.join(', ') + '. Add them in repo Settings -> Secrets and variables -> Actions (see video/README.md).');
    return;
  }

  // 5. Render locally with ffmpeg (no render API, no per-render cost)
  const outFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vela-video-')), 'recap.mp4');
  let videoBuf;
  try {
    await renderLocal(payload, outFile, log);
    videoBuf = fs.readFileSync(outFile);
  } finally {
    fs.rmSync(path.dirname(outFile), { recursive: true, force: true });
  }

  // 6. Upload + playlist
  const accessToken = await getAccessToken();
  const videoId = await uploadToYouTube(videoBuf, payload.youtube, accessToken);
  log('PUBLISHED: https://www.youtube.com/shorts/' + videoId);

  // remember this run's headlines so future videos never repeat them (14-day window)
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  state.used_headlines = [
    ...state.used_headlines.filter(e => e.d >= cutoff),
    ...payload.used_headlines.map(h => ({ h: h, d: today }))
  ];
  saveState(state);
  log('News memory updated:', state.used_headlines.length, 'headlines in the 14-day window');

  const playlistId = process.env.PLAYLIST_ID || cfg.playlist_id;
  if (playlistId) {
    try {
      await addToPlaylist(videoId, playlistId, accessToken);
      log('Added to playlist', playlistId);
    } catch (e) {
      log('WARN: playlist add failed (video is still published):', e.message);
    }
  }
}

main().catch(e => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
