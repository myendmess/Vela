#!/usr/bin/env python3
"""Build the FTSE MIB dataset for the market-map heatmap.

Same output schema as build_sp500.py (the web app is index-agnostic), different
sources — Milan listings aren't on the NASDAQ APIs:
1. Constituents -> Wikipedia's FTSE MIB table (self-updating: rebalances land
   here within days). The committed ftsemib_universe.csv is a merged CACHE and
   the automatic fallback when Wikipedia is unreachable/unparseable — known
   tickers keep their curated sector labels, new entrants get ICB-derived ones,
   departures are dropped, and the refreshed CSV is committed back by CI.
   ZERO manual maintenance by design.
2. Prices, ~1y history, market cap  -> Yahoo Finance via the `yfinance` library
   (keyless; handles Yahoo's crumb/cookie dance and polite pacing for us)

Writes ``globe/dashboard/data/ftsemib.json`` — flat array grouped by the web
app as Sector -> Sub-Industry -> Stock. Degrades gracefully: a failed ticker is
skipped (logged), never a crashed build.

Env vars:
  RATE_SLEEP   seconds between Yahoo calls (default 0.5)
  LIMIT        cap number of symbols (testing; default all)

Output is mechanical market data for visualization — NOT financial advice.
"""

from __future__ import annotations

import csv
import html as html_mod
import json
import logging
import os
import re
import time
from datetime import timedelta
from pathlib import Path

import requests
import yfinance as yf

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("build_ftsemib")

RATE_SLEEP = float(os.getenv("RATE_SLEEP", "0.5"))
LIMIT = int(os.getenv("LIMIT", "0"))
SPARK_POINTS = 30  # keep identical to build_sp500.py so sparklines render the same

ROOT = Path(__file__).resolve().parents[1]
UNIVERSE = ROOT / "data" / "ftsemib_universe.csv"
OUT_PATH = ROOT / "dashboard" / "data" / "ftsemib.json"


WIKI_URL = "https://en.wikipedia.org/wiki/FTSE_MIB"
UA = {"User-Agent": "Mozilla/5.0 (VelaBot; market heatmap; github.com/myendmess/Vela)"}

# Coarse ICB -> (sector, sub_industry) for NEW index entrants only; known
# tickers keep their curated labels from the CSV. Unmapped ICB values pass
# through as-is - the treemap just shows a new group, never crashes.
# Keys = the exact ICB labels observed on the Wikipedia table (2026-07), plus
# plausible variants. Unmapped values pass through as their own group.
ICB_MAP = {
    "Banks": ("Financials", "Banks"),
    "Insurance": ("Financials", "Insurance"),
    "Financial Services": ("Financials", "Diversified Financial Services"),
    "Utilities": ("Utilities", "Multi-Utilities"),
    "Health Care": ("Health Care", "Health Care"),
    "Aerospace": ("Industrials", "Aerospace & Defense"),
    "Aerospace & Defense": ("Industrials", "Aerospace & Defense"),
    "Shipbuilding": ("Industrials", "Shipbuilding & Defense"),
    "Automobiles and Parts": ("Consumer Discretionary", "Automobiles"),
    "Automobiles": ("Consumer Discretionary", "Automobiles"),
    "Technology": ("Information Technology", "Technology"),
    "Telecommunications": ("Communication Services", "Telecom Services"),
    "Energy": ("Energy", "Oil & Gas"),
    "Oil & Gas": ("Energy", "Oil & Gas"),
    "Basic Materials": ("Materials", "Materials"),
    "Construction and Materials": ("Materials", "Construction Materials"),
    "Consumer Products and Services": ("Consumer Discretionary", "Consumer Products"),
    "Consumer Goods": ("Consumer Discretionary", "Consumer Goods"),
    "Consumer Services": ("Consumer Discretionary", "Consumer Services"),
    "Gambling": ("Consumer Discretionary", "Casinos & Gaming"),
    "Industrials": ("Industrials", "Industrial Goods"),
    "Industrial Goods and Services": ("Industrials", "Industrial Goods"),
    "Food, Beverage and Tobacco": ("Consumer Staples", "Food & Beverage"),
    "Food & Beverage": ("Consumer Staples", "Food & Beverage"),
    "Retail": ("Consumer Discretionary", "Retail"),
    "Media": ("Communication Services", "Media"),
}

_TAGS = re.compile(r"<[^>]+>")


def _text(cell: str) -> str:
    return html_mod.unescape(_TAGS.sub("", cell)).strip()


def fetch_wiki_constituents() -> list[dict] | None:
    """Current constituents from Wikipedia's table: [{yahoo, name, icb}]. None on any failure."""
    try:
        r = requests.get(WIKI_URL, headers=UA, timeout=30)
        r.raise_for_status()
        page = r.text.replace("\n", "")
        out = []
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page):
            tds = re.findall(r"<td[^>]*>(.*?)</td>", row)
            if len(tds) < 3:
                continue
            m = re.fullmatch(r"([A-Z0-9]{1,6})\.MI", _text(tds[0]))
            if not m:
                continue
            name = _text(tds[1])
            icb = _text(tds[-1])
            if name:
                out.append({"yahoo": _text(tds[0]), "name": name, "icb": icb})
        # sanity: a broken parse or vandalized page must not nuke the universe
        if not 25 <= len(out) <= 60:
            log.warning("Wikipedia parse gave %d rows - ignoring", len(out))
            return None
        return out
    except Exception as e:  # noqa: BLE001
        log.warning("Wikipedia constituents fetch failed: %s", e)
        return None


def _read_csv() -> list[dict]:
    with UNIVERSE.open(encoding="utf-8") as f:
        return [
            {"ticker": r["ticker"].strip(), "yahoo": r["yahoo"].strip(),
             "name": r["name"].strip(),
             "gics_sector": r["sector"].strip() or "Unknown",
             "gics_sub_industry": r["sub_industry"].strip() or "Other"}
            for r in csv.DictReader(f) if r.get("ticker")
        ]


def get_universe() -> list[dict]:
    """Wikipedia-refreshed constituents, merged with the curated CSV cache.

    Wikipedia down/unparseable -> committed CSV as-is (graceful). Otherwise the
    CSV is rewritten to mirror the live index and gets committed by the workflow.
    """
    cached = {r["ticker"]: r for r in _read_csv()}
    wiki = fetch_wiki_constituents()
    if wiki is None:
        rows = list(cached.values())
        log.info("Universe (CSV fallback): %d names", len(rows))
        return rows

    rows, added = [], []
    for w in wiki:
        tkr = w["yahoo"].removesuffix(".MI")
        if tkr in cached:
            rows.append(cached[tkr])           # keep curated labels
        else:
            sec, sub = ICB_MAP.get(w["icb"], (w["icb"] or "Other", w["icb"] or "Other"))
            rows.append({"ticker": tkr, "yahoo": w["yahoo"], "name": w["name"],
                         "gics_sector": sec, "gics_sub_industry": sub})
            added.append(tkr)
    removed = sorted(set(cached) - {r["ticker"] for r in rows})
    if added:
        log.info("Index rebalance - added: %s", ", ".join(added))
    if removed:
        log.info("Index rebalance - removed: %s", ", ".join(removed))

    rows.sort(key=lambda r: r["ticker"])
    with UNIVERSE.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ticker", "yahoo", "name", "sector", "sub_industry"])
        for r in rows:
            w.writerow([r["ticker"], r["yahoo"], r["name"],
                        r["gics_sector"], r["gics_sub_industry"]])
    log.info("Universe (Wikipedia-refreshed): %d names", len(rows))
    return rows


# Mirrors build_sp500.py's analyze()/_downsample() on purpose; the two builders
# stay independent (repo convention) but MUST emit the same schema.
def _close_on_or_before(series, target):
    best = None
    for d, c in series:
        if d <= target:
            best = c
        else:
            break
    return best


def _downsample(closes, n):
    if len(closes) <= n:
        return [round(c, 2) for c in closes]
    step = (len(closes) - 1) / (n - 1)
    return [round(closes[round(i * step)], 2) for i in range(n)]


def analyze(series) -> dict:
    closes = [c for _, c in series]
    cur, cur_date = closes[-1], series[-1][0]
    low, high = min(closes), max(closes)

    def ret(days=None, target=None):
        if target is None:
            target = cur_date - timedelta(days=days)
        base = _close_on_or_before(series, target)
        return round((cur - base) / base * 100, 2) if base and base > 0 else None

    p1d = round((cur - closes[-2]) / closes[-2] * 100, 2) if len(closes) >= 2 and closes[-2] > 0 else None
    mtd_base = cur_date.replace(day=1) - timedelta(days=1)
    return {
        "price": round(cur, 2),
        "wk52_low": round(low, 2), "wk52_high": round(high, 2),
        "wk52_position": round((cur - low) / (high - low), 3) if high > low else None,
        "perf": {"1d": p1d, "1w": ret(7), "1m": ret(30), "3m": ret(91),
                 "6m": ret(182), "1y": ret(365), "mtd": ret(target=mtd_base)},
        "spark": _downsample(closes, SPARK_POINTS),
    }


def fetch(symbol: str):
    """(series, market_cap) via yfinance; (None, None) on failure."""
    try:
        t = yf.Ticker(symbol)
        hist = t.history(period="1y", interval="1d", auto_adjust=True)
        if hist is None or hist.empty or len(hist) < 5:
            return None, None
        series = [(idx.date(), float(row)) for idx, row in hist["Close"].items() if row == row]
        series.sort(key=lambda x: x[0])

        cap = None
        try:
            cap = t.fast_info.get("market_cap") or t.fast_info.get("marketCap")
        except Exception:
            pass
        if not cap:
            try:
                shares = t.fast_info.get("shares")
                if shares and series:
                    cap = float(shares) * series[-1][1]
            except Exception:
                pass
        return (series if len(series) >= 5 else None), (float(cap) if cap else None)
    except Exception as e:  # noqa: BLE001 - any per-ticker failure is a skip, not a crash
        log.warning("%s failed: %s", symbol, e)
        return None, None
    finally:
        time.sleep(RATE_SLEEP)


def main() -> None:
    names = get_universe()
    if LIMIT:
        names = names[:LIMIT]

    out, skipped = [], []
    for i, row in enumerate(names, 1):
        series, cap = fetch(row["yahoo"])
        if not series or not cap:
            skipped.append(row["ticker"])
            continue
        pub = {k: v for k, v in row.items() if k != "yahoo"}
        out.append({**pub, "market_cap": cap, **analyze(series)})
        if i % 10 == 0:
            log.info("…%d/%d (kept %d)", i, len(names), len(out))

    if len(out) < len(names) * 0.6:
        # Yahoo had a bad day - keep yesterday's committed file rather than
        # publishing a half-empty heatmap.
        log.warning("Only %d/%d names built - refusing to overwrite existing data",
                    len(out), len(names))
        raise SystemExit(1)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    if skipped:
        log.warning("Skipped: %s", ", ".join(skipped))
    log.info("Wrote %s (%d names, %d skipped)", OUT_PATH, len(out), len(skipped))
    print(f"✓ FTSE MIB map data -> {OUT_PATH} ({len(out)} names)")


if __name__ == "__main__":
    main()
