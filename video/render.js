'use strict';

// Local video renderer: turns the timeline built by payload.js into an mp4 with
// ffmpeg, replacing the Shotstack render API (which bills 1 credit per render,
// sandbox included). Free, no watermark, no polling for a remote job.
//
// The timeline keeps its Shotstack shape - payload.js is unchanged and its
// golden tests still pass - so it now reads as this project's own scene format:
//   tracks[0] is the TOP layer (drawn last), each clip has start/length,
//   position + offset (fractions of canvas size, +y is UP), and one asset:
//     text  -> one drawtext per wrapped line, faded via an alpha expression
//     shape -> drawbox (rectangle only; the accent bar under headings)
//     image -> a looped input overlaid with an alpha fade (the logo)
// Everything is composited in a single ffmpeg pass over a solid colour source.
//
// Requires: ffmpeg (libfreetype) and the Montserrat ExtraBold font on PATH -
// see .github/workflows/daily-video.yml for how CI installs both.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { readFont, wrap } = require('./font');

const FADE = 0.35;              // seconds; Shotstack's fade transition, shortened to suit 3-8s slides
const AUDIO_FADE_IN = 1.5;
const AUDIO_FADE_OUT = 2;

const FONT_CANDIDATES = [
  '/usr/share/fonts/opentype/montserrat/Montserrat-ExtraBold.otf',
  '/usr/share/fonts/truetype/montserrat/Montserrat-ExtraBold.ttf',
  '/usr/local/share/fonts/Montserrat-ExtraBold.otf',
  '/Library/Fonts/Montserrat-ExtraBold.otf'
];

// ffmpeg wants 0xRRGGBB; payload.js speaks CSS #RRGGBB
const color = c => String(c || '#ffffff').replace(/^#/, '0x');
// plain decimals only - exponent notation ("1e-7") is not valid in a filter expression
const num = n => (Math.round(Number(n) * 1e4) / 1e4).toFixed(4).replace(/\.?0+$/, '') || '0';

function findFont() {
  if (process.env.VIDEO_FONT) {
    if (!fs.existsSync(process.env.VIDEO_FONT)) throw new Error('VIDEO_FONT does not exist: ' + process.env.VIDEO_FONT);
    return process.env.VIDEO_FONT;
  }
  for (const p of FONT_CANDIDATES) if (fs.existsSync(p)) return p;
  try {
    const m = execFileSync('fc-match', ['-f', '%{file}', 'Montserrat:weight=extrabold'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    if (m && fs.existsSync(m)) return m;
  } catch (e) { /* fontconfig not installed - fall through to the error below */ }
  throw new Error('Montserrat ExtraBold not found. Install it (apt-get install -y fonts-montserrat) or set VIDEO_FONT to a .otf/.ttf path.');
}

// alpha ramps 0 -> 1 over FADE at the clip's start and back down at its end.
// Clips shorter than 3x FADE get a proportionally shorter fade so they still
// reach full opacity in the middle.
function alphaExpr(start, len) {
  const f = Math.min(FADE, len / 3);
  const end = start + len;
  return `max(0,min(1,min((t-${num(start)})/${num(f)},(${num(end)}-t)/${num(f)})))`;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Asset download failed (HTTP ' + res.status + '): ' + url);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

// a local path stays put; an http(s) src is fetched into workDir - except when
// it points at this repo's own GitHub Pages site, in which case the file is
// already on disk in the checkout (no round trip, and renders keep working when
// Pages is mid-deploy or the run is offline)
async function localAsset(src, workDir, name, repoRoot) {
  if (!/^https?:/i.test(src)) return src;
  const url = new URL(src);
  if (repoRoot && /\.github\.io$/i.test(url.hostname)) {
    const segs = url.pathname.split('/').filter(Boolean);
    // project Pages serve <user>.github.io/<repo>/<path>; user Pages skip <repo>
    for (const rel of [segs.slice(1), segs]) {
      const candidate = path.join(repoRoot, ...rel);
      if (rel.length && candidate.startsWith(repoRoot) && fs.existsSync(candidate)) return candidate;
    }
  }
  const ext = (path.extname(url.pathname) || '').slice(0, 5) || '';
  return download(src, path.join(workDir, name + ext));
}

function timelineDuration(timeline) {
  let d = 0;
  for (const tr of timeline.tracks || []) {
    for (const c of tr.clips || []) d = Math.max(d, (c.start || 0) + (c.length || 0));
  }
  return d;
}

// top-left of an asset box for a Shotstack `position`, before offset is applied
function anchor(position, W, H, aw, ah) {
  const cx = (W - aw) / 2, cy = (H - ah) / 2;
  switch (position || 'center') {
    case 'topLeft': return { x: 0, y: 0 };
    case 'top': return { x: cx, y: 0 };
    case 'topRight': return { x: W - aw, y: 0 };
    case 'left': return { x: 0, y: cy };
    case 'right': return { x: W - aw, y: cy };
    case 'bottomLeft': return { x: 0, y: H - ah };
    case 'bottom': return { x: cx, y: H - ah };
    case 'bottomRight': return { x: W - aw, y: H - ah };
    default: return { x: cx, y: cy };
  }
}

function buildGraph(payload, ctx) {
  const { W, H, fps, duration, font, fontFile, workDir, images, audio } = ctx;
  const timeline = payload.timeline;
  const parts = [];
  const inputs = [];         // extra ffmpeg -i arguments, in order
  let label = 'bg';
  let n = 0;
  const next = () => 'v' + (++n);

  parts.push(`color=c=${color(timeline.background || '#000000')}:s=${W}x${H}:r=${fps}:d=${num(duration)}[bg]`);

  // tracks[0] is the top layer, so composite from the last track backwards
  const tracks = [...(timeline.tracks || [])].reverse();
  let textFileIndex = 0;

  for (const track of tracks) {
    for (const clip of track.clips || []) {
      const a = clip.asset || {};
      const start = clip.start || 0;
      const len = clip.length || 0;
      if (len <= 0) continue;
      const end = start + len;
      const offX = (clip.offset && clip.offset.x) || 0;
      const offY = (clip.offset && clip.offset.y) || 0;
      const enable = `between(t,${num(start)},${num(end)})`;
      const alpha = alphaExpr(start, len);

      if (a.type === 'text') {
        const size = Number((a.font && a.font.size) || 44);
        const lineHeight = Number((a.font && a.font.lineHeight) || 1.5);
        const boxW = Number(a.width || W);
        const lines = wrap(font, a.text, size, boxW);
        const step = size * lineHeight;
        const blockH = lines.length * step;
        // the text box is centred on its anchor point, and the block is centred in the box
        const box = anchor(clip.position, W, H, boxW, Number(a.height || H));
        const cx = box.x + boxW / 2 + offX * W;
        const cy = box.y + Number(a.height || H) / 2 - offY * H;

        lines.forEach((line, i) => {
          if (!line) return;
          // textfile + expansion=none: headlines carry quotes, colons and % signs
          // that would otherwise need escaping (or be read as format specifiers)
          const tf = path.join(workDir, 'text' + (textFileIndex++) + '.txt');
          fs.writeFileSync(tf, line);
          const lineCy = cy - blockH / 2 + i * step + step / 2;
          const out = next();
          parts.push(
            `[${label}]drawtext=fontfile=${fontFile}:textfile=${tf}:expansion=none` +
            `:fontsize=${num(size)}:fontcolor=${color((a.font && a.font.color) || '#ffffff')}` +
            `:alpha='${alpha}':x='${num(cx)}-text_w/2':y='${num(lineCy)}-text_h/2'` +
            `:enable='${enable}'[${out}]`
          );
          label = out;
        });
      } else if (a.type === 'shape') {
        // only the accent bar uses this; drawbox takes a static colour, so the
        // 8px rule cuts in rather than fading - invisible at this size
        const rw = Number((a.rectangle && a.rectangle.width) || a.width || 0);
        const rh = Number((a.rectangle && a.rectangle.height) || a.height || 0);
        if (!rw || !rh) continue;
        const box = anchor(clip.position, W, H, rw, rh);
        const x = box.x + offX * W;
        const y = box.y - offY * H;
        const fill = (a.fill && a.fill.color) || '#ffffff';
        const opacity = a.fill && a.fill.opacity != null ? Number(a.fill.opacity) : 1;
        const out = next();
        parts.push(`[${label}]drawbox=x=${num(x)}:y=${num(y)}:w=${num(rw)}:h=${num(rh)}:color=${color(fill)}@${num(opacity)}:t=fill:enable='${enable}'[${out}]`);
        label = out;
      } else if (a.type === 'image') {
        const file = images.get(a.src);
        if (!file) continue;
        const idx = inputs.length;
        inputs.push(['-loop', '1', '-t', num(duration), '-i', file]);
        const scale = Number(clip.scale || 1);
        const scaled = 'img' + idx;
        const f = Math.min(FADE, len / 3);
        // -1 keeps the source aspect ratio; even width avoids yuv420p rounding
        parts.push(
          `[${idx}:v]scale=w=${num(Math.round(scale * W / 2) * 2)}:h=-1,format=rgba,` +
          `fade=t=in:st=${num(start)}:d=${num(f)}:alpha=1,` +
          `fade=t=out:st=${num(end - f)}:d=${num(f)}:alpha=1[${scaled}]`
        );
        const ax = clip.position === 'topRight' || clip.position === 'right' || clip.position === 'bottomRight'
          ? `main_w-overlay_w+(${num(offX * W)})`
          : clip.position === 'topLeft' || clip.position === 'left' || clip.position === 'bottomLeft'
            ? `${num(offX * W)}`
            : `(main_w-overlay_w)/2+${num(offX * W)}`;
        const ay = /^top/.test(clip.position || '')
          ? `${num(-offY * H)}`
          : /^bottom/.test(clip.position || '')
            ? `main_h-overlay_h-(${num(offY * H)})`
            : `(main_h-overlay_h)/2-${num(offY * H)}`;
        const out = next();
        parts.push(`[${label}][${scaled}]overlay=x='${ax}':y='${ay}':enable='${enable}'[${out}]`);
        label = out;
      }
    }
  }

  parts.push(`[${label}]format=yuv420p[vout]`);

  if (audio) {
    const idx = inputs.length;
    inputs.push(['-i', audio]);
    const vol = timeline.soundtrack && timeline.soundtrack.volume != null ? Number(timeline.soundtrack.volume) : 1;
    const fadeOutAt = Math.max(duration - AUDIO_FADE_OUT, 0);
    // apad covers a soundtrack shorter than the video; atrim cuts a longer one
    parts.push(
      `[${idx}:a]volume=${num(vol)},apad,atrim=0:${num(duration)},asetpts=N/SR/TB,` +
      `afade=t=in:st=0:d=${num(AUDIO_FADE_IN)},afade=t=out:st=${num(fadeOutAt)}:d=${num(AUDIO_FADE_OUT)}[aout]`
    );
  }

  return { graph: parts.join(';\n'), inputs: inputs, hasAudio: !!audio };
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d.toString(); if (err.length > 20000) err = err.slice(-20000); });
    p.on('error', e => reject(new Error('Could not run ffmpeg: ' + e.message + '. Install it (apt-get install -y ffmpeg).')));
    p.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exited ' + code + ':\n' + err.split('\n').slice(-25).join('\n'))));
  });
}

// Renders `payload` to `outFile`. Returns the output path.
async function renderLocal(payload, outFile, log = () => {}) {
  const out = payload.output || {};
  const W = (out.size && out.size.width) || 1080;
  const H = (out.size && out.size.height) || 1920;
  const fps = out.fps || 25;
  const duration = timelineDuration(payload.timeline);
  if (!duration) throw new Error('Timeline has no clips - nothing to render.');

  const fontFile = findFont();
  const font = readFont(fontFile);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-render-'));
  const repoRoot = path.join(__dirname, '..');

  try {
    // fetch every remote asset once, even if a src repeats across clips
    const images = new Map();
    let i = 0;
    for (const tr of payload.timeline.tracks || []) {
      for (const c of tr.clips || []) {
        const src = c.asset && c.asset.type === 'image' && c.asset.src;
        if (src && !images.has(src)) images.set(src, await localAsset(src, workDir, 'img' + (i++), repoRoot));
      }
    }
    const soundSrc = payload.timeline.soundtrack && payload.timeline.soundtrack.src;
    const audio = soundSrc ? await localAsset(soundSrc, workDir, 'audio', repoRoot) : null;
    if (images.size || audio) log('Assets fetched:', images.size, 'image(s)' + (audio ? ' + soundtrack' : ''));

    const { graph, inputs, hasAudio } = buildGraph(payload, { W, H, fps, duration, font, fontFile, workDir, images, audio });
    const graphFile = path.join(workDir, 'filters.txt');
    fs.writeFileSync(graphFile, graph);

    const args = ['-y', '-hide_banner', '-loglevel', 'error'];
    for (const inp of inputs) args.push(...inp);
    args.push(
      '-filter_complex_script', graphFile,
      '-map', '[vout]',
      ...(hasAudio ? ['-map', '[aout]'] : []),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-r', String(fps), '-t', num(duration), '-movflags', '+faststart'
    );
    if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k');
    args.push(outFile);

    log('Rendering', duration.toFixed(1) + 's at', W + 'x' + H, '(' + graph.split(';').length, 'filters)...');
    const t0 = Date.now();
    await runFfmpeg(args);
    log('Rendered in', ((Date.now() - t0) / 1000).toFixed(0) + 's:', (fs.statSync(outFile).size / 1048576).toFixed(1), 'MB');
    return outFile;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

// buildGraph/timelineDuration/findFont are exported for video/test/run_render_tests.js
module.exports = { renderLocal, buildGraph, timelineDuration, findFont };

// Dev helper: node video/render.js payload.json out.mp4
if (require.main === module) {
  const [payloadFile, outFile] = process.argv.slice(2);
  if (!payloadFile || !outFile) {
    console.error('usage: node video/render.js <payload.json> <out.mp4>');
    process.exit(2);
  }
  renderLocal(JSON.parse(fs.readFileSync(payloadFile, 'utf8')), outFile, (...a) => console.log(...a))
    .catch(e => { console.error('FAILED:', e.message); process.exit(1); });
}
