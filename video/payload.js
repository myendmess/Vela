'use strict';

// Builds the Shotstack render payload + YouTube SEO metadata for the daily
// S&P 500 recap Short. Pure function - same logic as the n8n "Build Shotstack
// payload" Code node, so the two pipelines produce identical videos.

// Finnhub's "general" feed mixes in world/politics stories - keep market-related headlines only
const MARKET_RE = /\b(stocks?|shares?|markets?|S&P|Nasdaq|Dow|Wall Street|Fed|Federal Reserve|rate cut|interest rate|inflation|earnings|profit|revenue|guidance|IPO|merger|acquisition|Treasury|bonds?|yields?|oil|crude|OPEC|dollar|euro|econom(?:y|ic)|GDP|jobs report|tariffs?|crypto|bitcoin|ETF|investors?|trading|rally|sell-?off|chipmaker|semiconductors?)\b/i;

function validStocks(stocks) {
  return (stocks || []).filter(s => s && s.ticker && s.perf && typeof s.perf['1d'] === 'number');
}

// top n gainers + top n losers, the ones that get "why it moved" headline slides
function pickMovers(stocks, n) {
  const sorted = [...validStocks(stocks)].sort((a, b) => b.perf['1d'] - a.perf['1d']);
  return [
    ...sorted.slice(0, n).map(s => ({ ticker: s.ticker, name: s.name, move: s.perf['1d'], side: 'gainer' })),
    ...sorted.slice(-n).reverse().map(s => ({ ticker: s.ticker, name: s.name, move: s.perf['1d'], side: 'loser' }))
  ];
}

// Sources that reliably produce market-relevant, non-clickbait headlines
const GOOD_SOURCES = /reuters|bloomberg|cnbc|marketwatch|wall street|wsj|barron|yahoo|financial times|associated press|investing\.com|seeking ?alpha/i;

function buildPayload({ stocks, generalNews, companyNews, movers, cfg, usedBefore, now = new Date() }) {
  const clean = validStocks(stocks);
  if (clean.length < 50) {
    throw new Error(`Only ${clean.length} tickers loaded from sp500.json - aborting so we don't render a broken video.`);
  }

  // Never repeat a headline shown in a previous video (usedBefore comes from video/state.json)
  const usedEver = new Set((usedBefore || []).map(h => String(h)));
  const nowSec = now.getTime() / 1000;

  const marketNews = (generalNews || []).filter(n =>
    n && n.headline && !usedEver.has(n.headline) &&
    MARKET_RE.test(n.headline + ' ' + (n.summary || '')));

  // Prefer headlines from the last 24h; if the feed has none (rare), fall back to
  // any unused market headline so the news section doesn't silently vanish.
  const freshNews = marketNews.filter(n => (n.datetime || 0) >= nowSec - 24 * 3600);
  const pool = freshNews.length ? freshNews : marketNews;
  const score = n => (GOOD_SOURCES.test(n.source || '') ? 2 : 0)
    + ((n.headline.length >= 40 && n.headline.length <= 140) ? 1 : 0)
    - (/[?!]$/.test(n.headline.trim()) ? 1 : 0);
  const news = [...pool].sort((a, b) => (score(b) - score(a)) || ((b.datetime || 0) - (a.datetime || 0)));

  const moverList = (movers || []).filter(m => m && m.ticker);
  const compNews = (companyNews || []).filter(n => n && n.headline && n.related && !usedEver.has(n.headline));

  // ---- Stats ----
  const fmt = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  const up = clean.filter(s => s.perf['1d'] > 0).length;
  const down = clean.filter(s => s.perf['1d'] < 0).length;
  const flat = clean.length - up - down;

  const totCap = clean.reduce((a, s) => a + (s.market_cap || 0), 0);
  const idxMove = clean.reduce((a, s) => a + (s.market_cap || 0) * s.perf['1d'], 0) / (totCap || 1);

  const sectors = {};
  for (const s of clean) {
    const k = s.gics_sector || 'Other';
    if (!sectors[k]) sectors[k] = { cap: 0, wsum: 0 };
    sectors[k].cap += s.market_cap || 0;
    sectors[k].wsum += (s.market_cap || 0) * s.perf['1d'];
  }
  const SHORT = {
    'Information Technology': 'Tech',
    'Communication Services': 'Comms',
    'Consumer Discretionary': 'Consumer Disc.',
    'Consumer Staples': 'Staples'
  };
  const secList = Object.entries(sectors)
    .map(([name, v]) => ({ name: SHORT[name] || name, move: v.wsum / (v.cap || 1) }))
    .sort((a, b) => b.move - a.move);

  const byMove = [...clean].sort((a, b) => b.perf['1d'] - a.perf['1d']);
  const gainers = byMove.slice(0, 5);
  const losers = byMove.slice(-5).reverse();

  // ---- Slide builder (one Shotstack track per text layer so clips never overlap) ----
  const GREEN = '#4ade80', RED = '#f87171', WHITE = '#ffffff', GRAY = '#9ca3af';
  const ACCENT = cfg.accent_color || '#fbbf24';

  const heading = [], accent = [], bodyA = [], bodyB = [], footer = [];
  let t = 0;

  function textClip(text, o) {
    return {
      asset: {
        type: 'text',
        text: text,
        font: { family: 'Montserrat ExtraBold', color: o.color || WHITE, size: String(o.size || 44), lineHeight: o.lineHeight || 1.5 },
        alignment: { horizontal: 'center', vertical: 'center' },
        width: o.w || 920,
        height: o.h || 700
      },
      start: o.start,
      length: o.length,
      position: 'center',
      offset: { x: 0, y: o.y || 0 },
      transition: { in: 'fade', out: 'fade' }
    };
  }

  function slide(o) {
    const start = t;
    const len = o.len;
    if (o.head) {
      heading.push(textClip(o.head, { color: o.headColor || WHITE, size: 58, y: 0.30, h: 160, start: start + 0.1, length: len - 0.2 }));
      accent.push({
        asset: {
          type: 'shape', shape: 'rectangle',
          fill: { color: ACCENT, opacity: 1 },
          stroke: { color: ACCENT, width: '0' },
          width: 120, height: 8,
          rectangle: { width: 120, height: 8, cornerRadius: 4 }
        },
        start: start + 0.1,
        length: len - 0.2,
        position: 'center',
        offset: { x: 0, y: 0.245 },
        transition: { in: 'fade', out: 'fade' }
      });
    }
    if (o.a) bodyA.push(textClip(o.a, { color: o.aColor || WHITE, size: o.aSize || 44, y: 0.03, h: 760, start: start + 0.2, length: len - 0.4 }));
    if (o.b) bodyB.push(textClip(o.b, { color: o.bColor || GRAY, size: o.bSize || 36, y: -0.27, h: 420, start: start + 0.2, length: len - 0.4 }));
    if (o.foot !== false) footer.push(textClip(cfg.site_label, { color: GRAY, size: 26, y: -0.44, h: 60, start: start, length: len }));
    t += len;
  }

  const usedHeadlines = new Set(usedEver); // dedupe within this run AND against past videos
  const consumed = [];                      // headlines this run actually puts on screen

  const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Finnhub tags generic wrap-ups with many tickers; a mover's slide must actually
  // be ABOUT the company - otherwise the headline implies a false explanation for
  // the move. Better no slide than a misleading one.
  function mentionsCompany(n, ticker, name) {
    const text = n.headline + ' ' + (n.summary || '');
    if (new RegExp('\\b' + escapeRe(ticker) + '\\b').test(text)) return true;
    const first = String(name || '').split(/[\s,.]+/)[0];
    return !!(first && first.length > 2 && new RegExp('\\b' + escapeRe(first), 'i').test(text));
  }

  function headlineFor(m) {
    const matches = compNews
      .filter(n => String(n.related).split(',').includes(m.ticker)
        && !usedHeadlines.has(n.headline)
        && mentionsCompany(n, m.ticker, m.name))
      .sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
    if (!matches.length) return null;
    usedHeadlines.add(matches[0].headline);
    consumed.push(matches[0].headline);
    return matches[0];
  }

  function newsSlide(head, headColor, item) {
    const headline = String(item.headline).replace(/\s+/g, ' ').trim();
    const trimmed = headline.length > 140 ? headline.slice(0, 137) + '…' : headline;
    const len = Math.min(Math.max(4 + trimmed.split(' ').length * 0.28, 5), 8);
    slide({
      len: len,
      head: head,
      headColor: headColor,
      a: trimmed, aSize: 42,
      b: String(item.source || '').toUpperCase(), bSize: 28
    });
  }

  function tickerNewsSlides(side, color) {
    for (const m of moverList.filter(x => x.side === side)) {
      const n = headlineFor(m);
      if (n) newsSlide(m.ticker + '  ' + fmt(m.move), color, n);
    }
  }

  // ---- Slides ----
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  slide({ len: 3, a: 'S&P 500\nDAILY RECAP', aSize: 72, b: dateStr + '\nat last close', bSize: 32 });

  slide({
    len: 5,
    head: 'MARKET BREADTH',
    a: 'Index move  ' + fmt(idxMove) + '\n\n▲ ' + up + ' advancing\n▼ ' + down + ' declining' + (flat ? '\n· ' + flat + ' flat' : ''),
    aColor: idxMove >= 0 ? GREEN : RED,
    aSize: 48
  });

  slide({
    len: 6,
    head: 'SECTORS',
    a: secList.slice(0, 3).map(s => s.name + '  ' + fmt(s.move)).join('\n'),
    aColor: GREEN, aSize: 46,
    b: secList.slice(-3).map(s => s.name + '  ' + fmt(s.move)).join('\n'),
    bColor: RED, bSize: 46
  });

  slide({
    len: 6,
    head: 'TOP GAINERS',
    a: gainers.map(s => s.ticker + '  ' + fmt(s.perf['1d'])).join('\n'),
    aColor: GREEN, aSize: 50
  });

  tickerNewsSlides('gainer', GREEN);

  slide({
    len: 6,
    head: 'TOP LOSERS',
    a: losers.map(s => s.ticker + '  ' + fmt(s.perf['1d'])).join('\n'),
    aColor: RED, aSize: 50
  });

  tickerNewsSlides('loser', RED);

  const genCountRaw = Number(cfg.general_headlines);
  const genCount = Number.isFinite(genCountRaw) && genCountRaw >= 0 ? genCountRaw : 2;

  // Topic diversity: two headlines sharing >=2 significant words are the same
  // story from different outlets - show the best one and move on.
  const STOP = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'with', 'from', 'this', 'that',
    'will', 'have', 'has', 'was', 'more', 'than', 'into', 'over', 'after', 'amid', 'says', 'say',
    'said', 'new', 'its', 'their', 'how', 'why', 'what', 'stocks', 'stock', 'market', 'markets',
    'shares', 'wall', 'street']);
  const sigWords = h => new Set((String(h).toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(w => !STOP.has(w)));
  const chosenTopics = [];
  let shown = 0;
  for (const n of news) {
    if (shown >= genCount) break;
    if (usedHeadlines.has(n.headline)) continue;
    const words = sigWords(n.headline);
    if (chosenTopics.some(ws => [...words].filter(x => ws.has(x)).length >= 2)) continue;
    chosenTopics.push(words);
    usedHeadlines.add(n.headline);
    consumed.push(n.headline);
    newsSlide('IN THE NEWS', WHITE, n);
    shown++;
  }

  slide({ len: 4, a: 'Explore the full\ninteractive heatmap', aSize: 54, b: cfg.site_label, bColor: ACCENT, bSize: 34, foot: false });

  // ---- Logo (optional; empty logo_url = no logo, nothing breaks) ----
  const logoClips = [];
  if (cfg.logo_url) {
    // hero logo above the title on the intro slide
    logoClips.push({
      asset: { type: 'image', src: cfg.logo_url },
      start: 0, length: 3,
      position: 'center', offset: { x: 0, y: 0.26 }, scale: 0.34,
      transition: { in: 'fade', out: 'fade' }
    });
    // small persistent corner mark for the rest of the video.
    // The Shotstack stage watermark ROAMS across the top ~8% band (seen at both
    // top-left and top-right in real renders), so sit below the band entirely.
    logoClips.push({
      asset: { type: 'image', src: cfg.logo_url },
      start: 3, length: Math.max(t - 3, 0.1),
      position: 'topRight', offset: { x: -0.05, y: -0.13 }, scale: 0.12,
      transition: { in: 'fade' }
    });
  }

  // ---- Assemble payload (first track = top layer) ----
  const tracks = [
    { clips: logoClips },
    { clips: heading },
    { clips: accent },
    { clips: bodyA },
    { clips: bodyB },
    { clips: footer }
  ].filter(tr => tr.clips.length > 0);

  const timeline = { background: '#0b0e14', tracks: tracks };
  if (cfg.sound_url) {
    timeline.soundtrack = { src: cfg.sound_url, effect: 'fadeInFadeOut', volume: 0.4 };
  }

  // ---- YouTube SEO metadata ----
  const fmt1 = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const topG = gainers[0];
  const topL = losers[0];
  const dShort = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const siteUrl = cfg.site_url || ('https://' + cfg.site_label);

  const title = ('S&P 500 Today: ' + topG.ticker + ' ' + fmt1(topG.perf['1d']) + ', ' + topL.ticker + ' ' + fmt1(topL.perf['1d']) + ' | Market Recap ' + dShort + ' #Shorts').slice(0, 100);

  const description = [
    "Today's S&P 500 recap: market breadth, sector performance, top gainers & losers, and the headlines moving stocks.",
    '',
    '📈 Top gainer: ' + topG.ticker + ' ' + fmt(topG.perf['1d']),
    '📉 Top loser: ' + topL.ticker + ' ' + fmt(topL.perf['1d']),
    '📊 Index move: ' + fmt(idxMove) + ' (' + up + ' up / ' + down + ' down)',
    '',
    'Free interactive S&P 500 heatmap: ' + siteUrl,
    '',
    'New recap every trading day - subscribe so you never miss the market open prep.',
    '',
    '#Shorts #StockMarket #SP500 #Investing #MarketRecap #Stocks #FinanceNews'
  ].join('\n');

  const tickerTags = [...gainers, ...losers].map(s => s.ticker);
  const tags = [
    'stock market today', 'sp500', 's&p 500', 'market recap', 'daily market update',
    'top gainers', 'top losers', 'stock news', 'investing', 'finance news',
    'stock market news', 'market analysis', ...tickerTags
  ].join(',').slice(0, 480);

  return {
    timeline: timeline,
    output: { format: 'mp4', size: { width: 1080, height: 1920 }, fps: 25 },
    youtube: { title: title, description: description, tags: tags },
    used_headlines: consumed
  };
}

module.exports = { buildPayload, pickMovers, MARKET_RE };
