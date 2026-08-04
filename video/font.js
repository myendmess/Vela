'use strict';

// Minimal sfnt (TTF/OTF) metrics reader - just enough to measure a string and
// wrap it to a pixel width. Kept dependency-free like the rest of video/.
//
// Shotstack used to wrap text for us inside the clip's `width` box; the local
// ffmpeg renderer draws one line at a time, so we have to do the wrapping
// ourselves - and that needs real advance widths, not a guess at average
// character width (a headline in caps is far wider than one in lower case).
//
// Only the tables needed for advances are parsed: head (unitsPerEm), hhea
// (numberOfHMetrics), hmtx (advances), cmap (codepoint -> glyph id).
// Kerning (GPOS) is ignored: it shifts a line by a pixel or two, which can only
// change where a line breaks in a near-exact tie.

const fs = require('fs');

function parseCmapFormat4(buf, off) {
  const segCountX2 = buf.readUInt16BE(off + 6);
  const segCount = segCountX2 / 2;
  const ends = off + 14;
  const starts = ends + segCountX2 + 2;
  const deltas = starts + segCountX2;
  const rangeOffsets = deltas + segCountX2;
  const map = new Map();
  for (let s = 0; s < segCount; s++) {
    const end = buf.readUInt16BE(ends + s * 2);
    const start = buf.readUInt16BE(starts + s * 2);
    const delta = buf.readInt16BE(deltas + s * 2);
    const ro = buf.readUInt16BE(rangeOffsets + s * 2);
    if (start > end) continue;
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let gid;
      if (ro === 0) {
        gid = (c + delta) & 0xffff;
      } else {
        const gi = rangeOffsets + s * 2 + ro + (c - start) * 2;
        if (gi + 1 >= buf.length) continue;
        gid = buf.readUInt16BE(gi);
        if (gid !== 0) gid = (gid + delta) & 0xffff;
      }
      if (gid) map.set(c, gid);
    }
  }
  return map;
}

function parseCmapFormat12(buf, off) {
  const nGroups = buf.readUInt32BE(off + 12);
  const map = new Map();
  for (let g = 0; g < nGroups; g++) {
    const p = off + 16 + g * 12;
    const start = buf.readUInt32BE(p);
    const end = buf.readUInt32BE(p + 4);
    const startGid = buf.readUInt32BE(p + 8);
    // guard against a pathological group spanning the whole plane
    for (let c = start; c <= end && c - start < 0x10000; c++) map.set(c, startGid + (c - start));
  }
  return map;
}

function readFont(file) {
  const buf = fs.readFileSync(file);
  const numTables = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16;
    tables[buf.toString('ascii', p, p + 4)] = { off: buf.readUInt32BE(p + 8), len: buf.readUInt32BE(p + 12) };
  }
  if (!tables.head || !tables.hhea || !tables.hmtx || !tables.cmap) {
    throw new Error('Font is missing required tables (head/hhea/hmtx/cmap): ' + file);
  }

  const unitsPerEm = buf.readUInt16BE(tables.head.off + 18);
  const numberOfHMetrics = buf.readUInt16BE(tables.hhea.off + 34);

  // pick the best cmap subtable: prefer full-range format 12, else BMP format 4
  const cmapOff = tables.cmap.off;
  const nSub = buf.readUInt16BE(cmapOff + 2);
  let best = null;
  for (let i = 0; i < nSub; i++) {
    const rec = cmapOff + 4 + i * 8;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    const sub = cmapOff + buf.readUInt32BE(rec + 4);
    const format = buf.readUInt16BE(sub);
    const score = format === 12 ? 3 : (format === 4 && platform === 3 ? 2 : (format === 4 ? 1 : 0));
    if (score && (!best || score > best.score)) best = { score: score, sub: sub, format: format, platform: platform, encoding: encoding };
  }
  if (!best) throw new Error('Font has no usable cmap subtable (need format 4 or 12): ' + file);
  const cmap = best.format === 12 ? parseCmapFormat12(buf, best.sub) : parseCmapFormat4(buf, best.sub);

  const advanceOf = gid => {
    const i = Math.min(gid, numberOfHMetrics - 1);
    const p = tables.hmtx.off + i * 4;
    return p + 1 < buf.length ? buf.readUInt16BE(p) : 0;
  };

  // notdef is what an unmapped codepoint renders as; use its advance so a
  // missing glyph still occupies roughly the space it will take on screen
  const fallback = advanceOf(0) || unitsPerEm / 2;

  return {
    unitsPerEm: unitsPerEm,
    hasGlyph: cp => cmap.has(cp),
    // width of `text` in pixels at `size` px
    measure(text, size) {
      let units = 0;
      for (const ch of String(text)) {
        const gid = cmap.get(ch.codePointAt(0));
        units += gid === undefined ? fallback : advanceOf(gid);
      }
      return units / unitsPerEm * size;
    }
  };
}

// Greedy word wrap to `maxWidth` px. Words longer than the line (a URL, a long
// ticker string) are hard-split rather than allowed to overflow the frame.
function wrap(font, text, size, maxWidth) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    // a line that already fits is kept verbatim: payload.js uses runs of spaces
    // as column separators ("AMZN  +15.30%"), and splitting on whitespace to
    // re-join with single spaces would quietly tighten every stat slide
    if (font.measure(para, size) <= maxWidth) { out.push(para); continue; }
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? line + ' ' + word : word;
      if (font.measure(candidate, size) <= maxWidth || !line) {
        // a single word that is itself too wide: break it at the last fitting char
        if (!line && font.measure(word, size) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (font.measure(chunk + ch, size) > maxWidth && chunk) { out.push(chunk); chunk = ch; }
            else chunk += ch;
          }
          line = chunk;
        } else {
          line = candidate;
        }
      } else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

module.exports = { readFont, wrap };
