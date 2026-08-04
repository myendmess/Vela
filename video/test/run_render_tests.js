'use strict';
// Tests for the local ffmpeg renderer (video/render.js) and its font metrics
// (video/font.js) - plain Node, zero dependencies, same style as run_tests.js.
//
// The graph tests use a stub font, so they run anywhere. The font-parser tests
// and the end-to-end smoke render need Montserrat / ffmpeg on the machine and
// SKIP (loudly) when either is missing, rather than failing a dev's laptop.
// Run: node video/test/run_render_tests.js   (exit 0 + "PASS" = pass)

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { readFont, wrap } = require('../font');
const { buildGraph, timelineDuration, renderLocal, findFont } = require('../render');

let passed = 0, skipped = 0;
const test = (name, fn) => { fn(); console.log('TEST (' + name + '): ok'); passed++; };
const skip = (name, why) => { console.log('SKIP (' + name + '): ' + why); skipped++; };

// every char is half the font size wide - keeps the expected widths obvious
const stubFont = { unitsPerEm: 1000, hasGlyph: () => true, measure: (t, size) => String(t).length * size * 0.5 };

// ---- wrap() ----
test('wrap keeps a fitting line verbatim', () => {
  // double spaces are column separators in payload.js - collapsing them retightens every stat slide
  assert.deepStrictEqual(wrap(stubFont, 'AMZN  +15.30%', 40, 1000), ['AMZN  +15.30%']);
});

test('wrap breaks a long line on word boundaries', () => {
  const lines = wrap(stubFont, 'aaa bbb ccc ddd', 40, 140); // 140px = 7 chars
  assert.ok(lines.length > 1, 'expected a wrap');
  assert.ok(lines.every(l => stubFont.measure(l, 40) <= 140), 'a wrapped line still overflows: ' + JSON.stringify(lines));
  assert.strictEqual(lines.join(' '), 'aaa bbb ccc ddd', 'wrapping lost or reordered words');
});

test('wrap hard-splits a word wider than the line', () => {
  const lines = wrap(stubFont, 'supercalifragilistic', 40, 140);
  assert.ok(lines.length > 1, 'expected the word to be split');
  assert.ok(lines.every(l => stubFont.measure(l, 40) <= 140), 'a split chunk still overflows');
  assert.strictEqual(lines.join(''), 'supercalifragilistic', 'splitting lost characters');
});

test('wrap preserves blank lines as spacing', () => {
  assert.deepStrictEqual(wrap(stubFont, 'a\n\nb', 40, 1000), ['a', '', 'b']);
});

// ---- font.js against the real font, when present ----
let realFont = null;
try { realFont = readFont(findFont()); } catch (e) { /* reported as a skip below */ }

if (!realFont) {
  skip('font metrics', 'Montserrat not installed (apt-get install -y fonts-montserrat)');
} else {
  test('font metrics are sane and scale linearly', () => {
    assert.ok(realFont.unitsPerEm > 0, 'unitsPerEm not read');
    const w = realFont.measure('MARKET BREADTH', 44);
    assert.ok(w > 0, 'zero-width measurement');
    assert.ok(Math.abs(realFont.measure('MARKET BREADTH', 88) - w * 2) < 0.01, 'measurement is not linear in size');
    assert.ok(realFont.measure('WWW', 44) > realFont.measure('iii', 44), 'advances look uniform - hmtx not parsed?');
  });

  test('font covers the glyphs payload.js draws', () => {
    for (const ch of '▲▼·≈…%+-.&$') {
      assert.ok(realFont.hasGlyph(ch.codePointAt(0)), 'font is missing ' + JSON.stringify(ch) + ' - it would render as tofu');
    }
  });

  test('an unmapped codepoint measures without throwing', () => {
    assert.ok(realFont.measure('一', 44) > 0, 'missing glyph should fall back to notdef width');
  });
}

// ---- buildGraph ----
const samplePayload = {
  output: { format: 'mp4', size: { width: 1080, height: 1920 }, fps: 25 },
  timeline: {
    background: '#0b0e14',
    soundtrack: { src: 'https://example.com/music.mp3', volume: 0.4 },
    tracks: [
      { clips: [{ asset: { type: 'image', src: 'https://example.com/logo.png' }, start: 0, length: 3, position: 'center', offset: { x: 0, y: 0.26 }, scale: 0.34 }] },
      { clips: [{ asset: { type: 'text', text: "It's 50%: a \"quoted\" headline\nsecond line", font: { family: 'Montserrat ExtraBold', color: '#ffffff', size: '44', lineHeight: 1.5 }, width: 920, height: 700 }, start: 0.2, length: 4, position: 'center', offset: { x: 0, y: 0.03 } }] },
      { clips: [{ asset: { type: 'shape', shape: 'rectangle', fill: { color: '#fbbf24', opacity: 1 }, width: 120, height: 8, rectangle: { width: 120, height: 8, cornerRadius: 4 } }, start: 0.1, length: 4.8, position: 'center', offset: { x: 0, y: 0.245 } }] }
    ]
  }
};

const tempDirs = [];
function graphFor(payload) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-graph-test-'));
  tempDirs.push(workDir);
  const images = new Map();
  for (const tr of payload.timeline.tracks) {
    for (const c of tr.clips) if (c.asset.type === 'image') images.set(c.asset.src, '/tmp/fake-logo.png');
  }
  const res = buildGraph(payload, {
    W: 1080, H: 1920, fps: 25, duration: timelineDuration(payload.timeline),
    font: stubFont, fontFile: '/tmp/fake-font.otf', workDir: workDir, images: images,
    audio: payload.timeline.soundtrack ? '/tmp/fake-audio.mp3' : null
  });
  return Object.assign(res, { workDir: workDir });
}

test('timelineDuration spans the last clip', () => {
  assert.ok(Math.abs(timelineDuration(samplePayload.timeline) - 4.9) < 1e-9); // shape: 0.1 + 4.8
});

test('graph chains every filter label end to end', () => {
  const { graph } = graphFor(samplePayload);
  const lines = graph.split(';\n');
  assert.ok(/^color=c=0x0b0e14:s=1080x1920:r=25:d=4\.9\[bg\]$/.test(lines[0]), 'background source wrong: ' + lines[0]);
  assert.ok(graph.includes('[vout]'), 'no video output label');
  assert.ok(graph.includes('[aout]'), 'no audio output label');
  // every consumed label must have been produced by an earlier line
  const produced = new Set();
  for (const line of lines) {
    const consumes = (line.match(/^(\[[^\]]+\])+/) || [''])[0].match(/\[([^\]]+)\]/g) || [];
    for (const c of consumes) {
      const name = c.slice(1, -1);
      if (/^\d+:[va]$/.test(name)) continue; // an ffmpeg input, not a filter label
      assert.ok(produced.has(name), 'filter consumes an unproduced label ' + c + ': ' + line);
    }
    for (const p of line.match(/\[([a-z]+\d*)\]$/g) || []) produced.add(p.slice(1, -1));
  }
});

test('graph indexes ffmpeg inputs from 0 (the colour source is a filter, not an input)', () => {
  const { graph, inputs, hasAudio } = graphFor(samplePayload);
  assert.strictEqual(inputs.length, 2, 'expected one image input + one audio input');
  assert.ok(graph.includes('[0:v]scale='), 'first -i must be referenced as [0:v], not [1:v]');
  assert.ok(hasAudio && graph.includes('[1:a]volume='), 'audio input index is wrong');
  assert.ok(!/\[2:[va]\]/.test(graph), 'graph references an input that was never added');
});

test('graph carries no NaN or undefined values', () => {
  const { graph } = graphFor(samplePayload);
  for (const bad of ['NaN', 'undefined', 'null', 'Infinity']) {
    assert.ok(!graph.includes(bad), 'graph contains "' + bad + '": ' + graph.split('\n').find(l => l.includes(bad)));
  }
  // a tiny offset formatted as "1e-7" is not a valid filter expression
  // (hex colours like 0x0b0e14 look like exponents, so drop them first)
  const noColors = graph.replace(/0x[0-9a-fA-F]{6}/g, '');
  assert.ok(!/\d[eE][+-]?\d/.test(noColors), 'graph contains exponent notation: ' + noColors.split('\n').find(l => /\d[eE][+-]?\d/.test(l)));
});

test('text goes through a textfile, never inline (quotes/colons/% would break the parser)', () => {
  const { graph, workDir } = graphFor(samplePayload);
  assert.ok(!/[:=]text=/.test(graph), 'text was inlined into the filter graph');
  const files = fs.readdirSync(workDir).filter(f => f.startsWith('text'));
  assert.strictEqual(files.length, 2, 'expected one textfile per rendered line, got ' + files.length);
  const written = files.map(f => fs.readFileSync(path.join(workDir, f), 'utf8'));
  assert.ok(written.includes("It's 50%: a \"quoted\" headline"), 'headline text was altered: ' + JSON.stringify(written));
  assert.ok(graph.includes('expansion=none'), 'drawtext must disable expansion or % is read as a format specifier');
});

test('shape becomes a drawbox with the accent colour', () => {
  const { graph } = graphFor(samplePayload);
  assert.ok(/drawbox=x=480:y=485\.6:w=120:h=8:color=0xfbbf24@1:t=fill/.test(graph), 'accent bar geometry/colour wrong');
});

test('clips are drawn bottom track first so tracks[0] lands on top', () => {
  const { graph } = graphFor(samplePayload);
  assert.ok(graph.indexOf('drawbox') < graph.indexOf('drawtext'), 'shape (last track) must be drawn before text');
  assert.ok(graph.indexOf('drawtext') < graph.indexOf('overlay'), 'image (first track) must be composited last');
});

test('a zero-length clip is skipped rather than emitted', () => {
  const p = JSON.parse(JSON.stringify(samplePayload));
  p.timeline.tracks[1].clips[0].length = 0;
  const { graph } = graphFor(p);
  assert.ok(!graph.includes('drawtext'), 'zero-length clip still produced a filter');
});

// ---- end-to-end smoke render: proves the graph this builds is one ffmpeg accepts ----
let haveFfmpeg = false;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); haveFfmpeg = true; } catch (e) { /* skipped below */ }

async function smokeRender() {
  if (!haveFfmpeg || !realFont) {
    skip('smoke render', (haveFfmpeg ? 'Montserrat' : 'ffmpeg') + ' not installed');
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-smoke-'));
  const out = path.join(dir, 'smoke.mp4');
  // small and short on purpose: this asserts the pipeline runs, not how it looks
  const payload = {
    output: { format: 'mp4', size: { width: 360, height: 640 }, fps: 25 },
    timeline: {
      background: '#0b0e14',
      tracks: [
        { clips: [{ asset: { type: 'text', text: "S&P 500: it's 50% ▲\nsecond line", font: { color: '#4ade80', size: '30', lineHeight: 1.5 }, width: 300, height: 400 }, start: 0, length: 2, position: 'center', offset: { x: 0, y: 0 } }] },
        { clips: [{ asset: { type: 'shape', shape: 'rectangle', fill: { color: '#fbbf24', opacity: 1 }, rectangle: { width: 60, height: 4 } }, start: 0, length: 2, position: 'center', offset: { x: 0, y: 0.2 } }] }
      ]
    }
  };
  try {
    await renderLocal(payload, out);
    assert.ok(fs.existsSync(out) && fs.statSync(out).size > 1000, 'render produced no usable file');
    const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', out]).toString().trim();
    assert.ok(Math.abs(Number(probe) - 2) < 0.25, 'rendered duration ' + probe + 's, expected ~2s');
    console.log('TEST (smoke render): ok');
    passed++;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

smokeRender().then(() => {
  for (const d of tempDirs) fs.rmSync(d, { recursive: true, force: true });
  console.log(passed + ' passed, ' + skipped + ' skipped');
  console.log('PASS');
}).catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
