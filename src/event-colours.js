// The main colour of each Apple Event's artwork, for its tile on the
// Events page: the tile's frame and soft glow take that colour, so each
// event looks like its own artwork.
//
// Worked out once per image with sharp and remembered in
// .photo-cache/event-colours.json, which the photo-cache build plugin keeps
// between Netlify builds, so later builds don't fetch the artwork again.

const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '..', '.photo-cache', 'event-colours.json');

function hex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

// A colour that reads well as a frame on a white page: saturated, and
// neither too pale nor too dark.
function tune(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  const d = max - min;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  s = Math.max(s, 0.55);
  l = Math.min(Math.max(l, 0.4), 0.55);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return hex(ch(h + 1 / 3) * 255, ch(h) * 255, ch(h - 1 / 3) * 255);
}

// The artwork's most prominent colour: pixels are grouped by hue, counting
// vivid, bright ones most, so a black background or white text doesn't
// win over the coloured logo. Null for artwork with no real colour.
function mainColour(data, channels) {
  const buckets = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let pixels = 0;
  let coloured = 0;
  for (let i = 0; i + 2 < data.length; i += channels) {
    pixels += 1;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max / 255;
    const s = max ? (max - min) / max : 0;
    if (s < 0.3 || v < 0.25) continue;
    const d = max - min;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const w = s * s * v;
    const k = buckets[Math.floor(h / 15) % 24];
    k.w += w; k.r += r * w; k.g += g * w; k.b += b * w;
    coloured += 1;
  }
  if (!pixels || coloured < pixels * 0.02) return null;
  // The strongest hue, taken with its neighbours either side.
  let best = -1;
  let at = 0;
  for (let i = 0; i < 24; i++) {
    const score = buckets[(i + 23) % 24].w * 0.5 + buckets[i].w + buckets[(i + 1) % 24].w * 0.5;
    if (score > best) { best = score; at = i; }
  }
  let W = 0; let R = 0; let G = 0; let B = 0;
  [-1, 0, 1].forEach((o) => {
    const k = buckets[(at + o + 24) % 24];
    W += k.w; R += k.r; G += k.g; B += k.b;
  });
  return W ? tune(R / W, G / W, B / W) : null;
}

// { image_url: '#rrggbb' } for every event whose artwork has a colour.
async function eventColours(events) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (err) {
    return {};
  }
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (err) { cache = {}; }
  const out = {};
  let changed = false;
  for (const event of events || []) {
    const url = event && event.image_url;
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (Object.prototype.hasOwnProperty.call(cache, url)) {
      if (cache[url]) out[url] = cache[url];
      continue;
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const { data, info } = await sharp(buf, { failOn: 'none' })
        .resize(64, 64, { fit: 'inside' })
        .flatten({ background: '#ffffff' })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const colour = mainColour(data, info.channels);
      cache[url] = colour;
      changed = true;
      if (colour) out[url] = colour;
    } catch (err) {
      // No colour this time; the tile keeps the standard events violet.
    }
  }
  if (changed) {
    try {
      fs.mkdirSync(path.dirname(CACHE), { recursive: true });
      fs.writeFileSync(CACHE, JSON.stringify(cache));
    } catch (err) { /* only a cache */ }
  }
  console.log(`Event colours: ${Object.keys(out).length} of ${(events || []).filter((e) => e && e.image_url).length} artworks.`);
  return out;
}

module.exports = { eventColours, mainColour };
