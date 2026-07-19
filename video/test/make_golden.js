'use strict';
// Regenerates golden/payload.golden.json from the fixtures using the CURRENT
// video/payload.js. Run deliberately only: a golden regeneration must be its
// own reviewed commit with every changed path in the diff explained.
// Never invoked by run_tests.js and never by the production workflow.
const fs = require('fs');
const path = require('path');
const { buildPayload, pickMovers } = require('../payload');

const FX = p => JSON.parse(fs.readFileSync(path.join(__dirname, p), 'utf8'));
const meta = FX('fixtures/meta.json');
const stocks = FX('fixtures/sp500.fixture.json');
const generalNews = FX('fixtures/general_news.fixture.json');
const companyNews = FX('fixtures/company_news.fixture.json');
const usedBefore = FX('fixtures/used_before.fixture.json');
const cfg = FX('fixtures/config.default.json');

const movers = pickMovers(stocks, Number(cfg.movers_with_news) || 2); // mirrors make_video.js
const payload = buildPayload({ stocks, generalNews, companyNews, movers, cfg, usedBefore, now: new Date(meta.frozen_now) });

const out = path.join(__dirname, 'golden', 'payload.golden.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
console.log('Golden written:', out);
