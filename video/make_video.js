'use strict';

// Daily S&P 500 recap Short: build -> render (Shotstack) -> upload (YouTube).
// Zero npm dependencies (Node 18+ global fetch). Runs in GitHub Actions
// (.github/workflows/daily-video.yml) or locally: node video/make_video.js --dry-run
//
// Env: FINNHUB_API_KEY, SHOTSTACK_API_KEY, YT_CLIENT_ID, YT_CLIENT_SECRET,
//      YT_REFRESH_TOKEN, PLAYLIST_ID (optional, overrides config.json)
// Missing YouTube/Shotstack secrets = graceful skip (exit 0), so the scheduled
// run stays green until secrets are configured. See video/README.md.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { buildPayload, pickMovers } = require('./payload');

const cfg = require('./config.json');
const REPO_ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(REPO_ROOT, 'mapping', 'dashboard', 'data', 'sp500.json');
const DRY_RUN = process.argv.includes('--dry-run');
const SHOTSTACK_BASE = 'https://api.shotstack.io/' + (cfg.shotstack_env || 'stage');
const MAX_DATA_AGE_HOURS = 40; // sp500.json refreshes nightly at 23:00 UTC

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function jfetch(url, opts, what) {
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(what + ' failed: HTTP ' + res.status + ' - ' + text.slice(0, 300));
  return text ? JSON.parse(text) : {};
}

// hours since the data file's last commit; null if unknown (shallow clone, no git)
function dataAgeHours() {
  try {
    const ct = execSync('git log -1 --format=%ct -- "mapping/dashboard/data/sp500.json"', {
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
  const from = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
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

async function renderVideo(payload) {
  const headers = { 'Content-Type': 'application/json', 'x-api-key': process.env.SHOTSTACK_API_KEY };
  const submit = await jfetch(SHOTSTACK_BASE + '/render', {
    method: 'POST', headers,
    body: JSON.stringify({ timeline: payload.timeline, output: payload.output })
  }, 'Shotstack submit');
  const id = submit.response.id;
  log('Render submitted:', id);

  for (let i = 0; i < 40; i++) {
    await sleep(15000);
    const check = await jfetch(SHOTSTACK_BASE + '/render/' + id, { headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY } }, 'Shotstack status');
    const status = check.response.status;
    log('Render status:', status);
    if (status === 'done') return check.response.url;
    if (status === 'failed') throw new Error('Shotstack render failed: ' + (check.response.error || 'unknown reason'));
  }
  throw new Error('Shotstack render timed out after 10 minutes');
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
  const status = { privacyStatus: 'public', selfDeclaredMadeForKids: false, embeddable: true };

  const boundary = 'recap' + Date.now();
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ snippet, status }) +
    `\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

  const json = await jfetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
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

  if (!DRY_RUN) {
    const age = dataAgeHours();
    if (age !== null && age > MAX_DATA_AGE_HOURS) {
      log(`SKIPPED: sp500.json is ${age.toFixed(0)}h old (> ${MAX_DATA_AGE_HOURS}h) - data pipeline probably didn't run. No video today.`);
      return;
    }
    if (age !== null) log('Data age:', age.toFixed(1), 'hours - fresh.');
  }

  // 2. News
  const movers = pickMovers(stocks, Number(cfg.movers_with_news) || 2);
  const { generalNews, companyNews } = await getNews(movers);
  log('News:', generalNews.length, 'general items,', companyNews.length, 'company items for', movers.map(m => m.ticker).join('/'));

  // 3. Build payload
  const payload = buildPayload({ stocks, generalNews, companyNews, movers, cfg });
  const tracks = payload.timeline.tracks;
  const duration = Math.max(...tracks.flatMap(tr => tr.clips.map(c => c.start + c.length)));
  log('Payload built:', tracks.length, 'tracks,', tracks.reduce((a, tr) => a + tr.clips.length, 0), 'clips,', duration.toFixed(1) + 's');
  log('Title:', payload.youtube.title);

  if (DRY_RUN) {
    log('DRY RUN - stopping before render/upload. Payload OK.');
    return;
  }

  // 4. Secrets gate: neutral skip so scheduled runs stay green until configured
  const missing = ['SHOTSTACK_API_KEY', 'YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN'].filter(k => !process.env[k]);
  if (missing.length) {
    log('SKIPPED: missing secrets: ' + missing.join(', ') + '. Add them in repo Settings -> Secrets and variables -> Actions (see video/README.md).');
    return;
  }

  // 5. Render + download
  const videoUrl = await renderVideo(payload);
  log('Render done:', videoUrl);
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error('Video download failed: HTTP ' + res.status);
  const videoBuf = Buffer.from(await res.arrayBuffer());
  log('Downloaded', (videoBuf.length / 1048576).toFixed(1), 'MB');

  // 6. Upload + playlist
  const accessToken = await getAccessToken();
  const videoId = await uploadToYouTube(videoBuf, payload.youtube, accessToken);
  log('PUBLISHED: https://www.youtube.com/shorts/' + videoId);

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
