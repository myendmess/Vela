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
const golden = deepFreeze(FX('golden/payload.golden.json'));

// date-string rendering depends on the Node/ICU build — warn, don't fail (framework B3)
const major = v => String(v).replace(/^v/, '').split('.')[0];
if (meta.node_version && major(meta.node_version) !== major(process.version)) {
  console.warn('WARN: Node major differs from fixture capture (' + meta.node_version + ' vs ' + process.version + ') — date-string-only golden diffs may be environmental.');
}

const now = new Date(meta.frozen_now);
const movers = deepFreeze(pickMovers(stocks, Number(cfgDefault.movers_with_news) || 2)); // mirrors make_video.js

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
const run = over => buildPayload({ stocks, generalNews, companyNews, movers, cfg: deepFreeze({ ...cfgDefault, ...over }), usedBefore, now });
const goldenTexts = allTexts(golden);
let testNo = 2;
function flagTest(name, over, checks) {
  const p = run(over);
  checkInvariants(p, name);
  assert.notDeepStrictEqual(p, golden, name + ': flag ON produced no change');
  checks(p, allTexts(p));
  console.log('TEST ' + (testNo++) + ' (' + name + '): ok');
}

// V-2: equal-weight vs cap-weight line on the breadth slide
flagTest('show_equal_weight', { show_equal_weight: true }, (p, texts) => {
  assert.ok(/Equal-wt {2}[+-]\d/.test(texts), 'Equal-wt line missing');
  assert.ok(!/Equal-wt/.test(goldenTexts), 'golden unexpectedly contains Equal-wt');
});

// V-4: near-52w highs/lows counts on the breadth slide — exact counts, mirroring
// the production filters, so the counting logic itself is asserted (not just the line)
const validRows = stocks.filter(s => s && s.ticker && s.perf && typeof s.perf['1d'] === 'number');
const expHi = validRows.filter(s => typeof s.wk52_position === 'number' && s.wk52_position >= 0.98).length;
const expLo = validRows.filter(s => typeof s.wk52_position === 'number' && s.wk52_position <= 0.02).length;
flagTest('show_hl_counts', { show_hl_counts: true }, (p, texts) => {
  assert.ok(texts.includes('near 52w highs ' + expHi + ' · lows ' + expLo), 'highs/lows counts wrong or missing (expected ' + expHi + '/' + expLo + ')');
});

// V-3: 52w markers on the gainer/loser lists + range/1y context on mover headline slides
// (fixtures pin the top gainer at wk52_position 0.97 and the top loser at 0.03)
flagTest('show_52w_context', { show_52w_context: true }, (p, texts) => {
  assert.ok(texts.includes('▲52wH'), 'gainer-list 52w-high marker missing');
  assert.ok(texts.includes('▼52wL'), 'loser-list 52w-low marker missing');
  assert.ok(/52w range 97%/.test(texts), 'top-gainer 52w-range context missing');
  assert.ok(/52w range 3%/.test(texts), 'top-loser 52w-range context missing');
});

// V-8: sub-industry label on mover headline slides
flagTest('show_subindustry', { show_subindustry: true }, (p, texts) => {
  const g1 = movers.find(m => m.side === 'gainer');
  const rec = stocks.find(s => s && s.ticker === g1.ticker);
  assert.ok(rec && rec.gics_sub_industry, 'fixture: top gainer lacks sub-industry');
  assert.ok(texts.includes(String(rec.gics_sub_industry).toUpperCase()), 'sub-industry line missing on mover slide');
});

// V-5: sector 1w rotation framing; unknown horizon values must fall back to default output
flagTest('sector_trend_horizon=1w', { sector_trend_horizon: '1w' }, (p, texts) => {
  assert.ok(/\(1w [+-]\d/.test(texts), '1w sector trend missing');
});
assert.deepStrictEqual(run({ sector_trend_horizon: '5y' }), golden, 'unknown sector_trend_horizon must reproduce default output');
console.log('TEST ' + (testNo++) + ' (sector_trend_horizon unknown-value fallback): ok');

// V-9: dollar market-value change on the top mover of each side
flagTest('show_dollar_moves', { show_dollar_moves: true }, (p, texts) => {
  assert.ok(/≈ \$\d+(\.\d)?B market value (added|lost)/.test(texts), 'dollar move line missing');
});

// S-3: full company names in description + tags (comma-safe)
flagTest('seo_full_names', { seo_full_names: true }, p => {
  const g1 = movers.find(m => m.side === 'gainer');
  const rec = stocks.find(s => s && s.ticker === g1.ticker);
  assert.ok(p.youtube.description.includes('(' + rec.name + ')'), 'gainer full name missing in description');
  assert.ok(p.youtube.tags.includes(String(rec.name).replace(/,/g, '').trim()), 'gainer name tag missing');
  assert.ok(!p.youtube.tags.split(',').some(t => t === ''), 'empty tag introduced');
});

// S-4: data-transparency + disclaimer lines in the description
flagTest('seo_disclaimer', { seo_disclaimer: true }, p => {
  assert.ok(p.youtube.description.includes('not financial advice'), 'disclaimer missing');
  assert.ok(p.youtube.description.includes('not the official index print'), 'data-transparency line missing');
  assert.ok(!golden.youtube.description.includes('not financial advice'), 'golden unexpectedly has disclaimer');
});

// S-5: finance-literate long-tail tags incl. the day's leading sector
flagTest('seo_longtail_tags', { seo_longtail_tags: true }, p => {
  assert.ok(p.youtube.tags.includes('market breadth'), 'longtail tag missing');
  assert.ok(p.youtube.tags.includes('sector rotation'), 'longtail tag missing');
  assert.ok(/ sector(,|$)/.test(p.youtube.tags), 'leading-sector tag missing');
});

// S-6: the day's stats written into the description body
flagTest('seo_stats_description', { seo_stats_description: true }, p => {
  assert.ok(/🔼 Sectors: .+ · .+ · .+/.test(p.youtube.description), 'sector stats line missing');
  assert.ok(/🔽 Laggards: /.test(p.youtube.description), 'laggards line missing');
});

// S-6 interaction: EW + H/L lines join the description only when their own flags are on
flagTest('seo_stats_description+breadth flags', { seo_stats_description: true, show_equal_weight: true, show_hl_counts: true }, p => {
  assert.ok(/⚖️ Equal-weight: [+-]/.test(p.youtube.description), 'equal-weight description line missing');
  assert.ok(/📌 Near 52-week highs: \d+ · lows: \d+/.test(p.youtube.description), 'highs/lows description line missing');
});

// S-7: hashtag reorder (first three are what YouTube surfaces)
flagTest('seo_hashtag_order', { seo_hashtag_order: true }, p => {
  const last = p.youtube.description.split('\n').pop();
  assert.strictEqual(last, '#SP500 #StockMarket #MarketRecap #Shorts #Investing #Stocks #FinanceNews', 'hashtag order wrong');
});

// all wave-1 flags together: no crash, invariants hold, combined content present
flagTest('all wave-1 flags', {
  show_equal_weight: true, show_hl_counts: true, show_52w_context: true, show_subindustry: true,
  show_dollar_moves: true, sector_trend_horizon: '1w', seo_full_names: true, seo_disclaimer: true,
  seo_longtail_tags: true, seo_stats_description: true, seo_hashtag_order: true
}, (p, texts) => {
  assert.ok(/Equal-wt/.test(texts) && /\(1w /.test(texts) && /market value/.test(texts), 'combined content missing');
});

// ---- final: defaults still golden after all other runs (cross-contamination check) ----
assert.deepStrictEqual(
  buildPayload({ stocks, generalNews, companyNews, movers, cfg: cfgDefault, usedBefore, now }),
  golden,
  'default output changed after flag runs — input mutation suspected'
);
console.log('PASS');
