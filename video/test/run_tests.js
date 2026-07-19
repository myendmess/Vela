'use strict';
// Regression harness for video/payload.js — plain Node, zero dependencies.
// TEST 1: with default config, buildPayload output must be deep-equal to the
// golden baseline (proves any change is strictly additive behind absent flags).
// Fixtures are immutable and deep-frozen; video/state.json is never touched.
// Run: node video/test/run_tests.js   (exit 0 + "PASS" = pass, anything else = fail)
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { buildPayload, pickMovers } = require('../payload');

const FX = p => JSON.parse(fs.readFileSync(path.join(__dirname, p), 'utf8'));
const deepFreeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };

const meta = FX('fixtures/meta.json');
const stocks = deepFreeze(FX('fixtures/sp500.fixture.json'));
const generalNews = deepFreeze(FX('fixtures/general_news.fixture.json'));
const companyNews = deepFreeze(FX('fixtures/company_news.fixture.json'));
const usedBefore = deepFreeze(FX('fixtures/used_before.fixture.json'));
const cfgDefault = deepFreeze(FX('fixtures/config.default.json'));
const golden = FX('golden/payload.golden.json');

// date-string rendering depends on the Node/ICU build — warn, don't fail (framework B3)
const major = v => String(v).replace(/^v/, '').split('.')[0];
if (meta.node_version && major(meta.node_version) !== major(process.version)) {
  console.warn('WARN: Node major differs from fixture capture (' + meta.node_version + ' vs ' + process.version + ') — date-string-only golden diffs may be environmental.');
}

const now = new Date(meta.frozen_now);
const movers = pickMovers(stocks, Number(cfgDefault.movers_with_news) || 2); // mirrors make_video.js

// ---- shared invariants (platform limits + contracts) ----
const allTexts = p => p.timeline.tracks.flatMap(tr => tr.clips).map(c => c.asset && c.asset.text).filter(Boolean).join('\n');
const duration = p => Math.max(...p.timeline.tracks.flatMap(tr => tr.clips.map(c => c.start + c.length)));
const allHeadlines = new Set([...generalNews, ...companyNews].filter(n => n && n.headline).map(n => n.headline));
function checkInvariants(p, label) {
  assert.ok(duration(p) <= 90, label + ': duration ' + duration(p).toFixed(1) + 's exceeds 90s budget');
  assert.ok(p.youtube.title.length <= 100, label + ': title exceeds 100 chars');
  assert.ok(p.youtube.tags.length <= 480, label + ': tags exceed 480 chars');
  assert.deepStrictEqual(p.output, { format: 'mp4', size: { width: 1080, height: 1920 }, fps: 25 }, label + ': output shape changed');
  for (const h of p.used_headlines) {
    assert.ok(allHeadlines.has(h), label + ': used_headlines contains a non-original string: ' + h);
  }
}

// ---- TEST 1: golden regression with defaults ----
const actual = buildPayload({ stocks, generalNews, companyNews, movers, cfg: cfgDefault, usedBefore, now });
assert.deepStrictEqual(actual, golden, 'DEFAULT-CONFIG OUTPUT DIVERGED FROM GOLDEN BASELINE');
checkInvariants(actual, 'default');
console.log('TEST 1 (golden regression, defaults): ok — ' + duration(actual).toFixed(1) + 's, title "' + actual.youtube.title + '"');

// ---- TEST 2..N: flag-ON targeted assertions (one block per config flag; added by each feature change) ----

// ---- final: defaults still golden after all other runs (cross-contamination check) ----
assert.deepStrictEqual(
  buildPayload({ stocks, generalNews, companyNews, movers, cfg: cfgDefault, usedBefore, now }),
  golden,
  'default output changed after flag runs — input mutation suspected'
);
console.log('PASS');
