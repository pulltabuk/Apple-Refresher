// Gallery photos served from this site rather than from Supabase.
//
// Each gallery photo gets an 800px and a 1600px JPEG under dist/photos/,
// so pages load them from Netlify's CDN (the same fast connection as the
// page itself, close to the visitor) instead of Supabase storage, which
// is slower to answer and far away for UK visitors.
//
// Made once per photo with sharp and kept in .photo-cache/, which a small
// build plugin (netlify/plugins/photo-cache) saves between Netlify builds,
// so later builds only fetch photos that are new. The admin's smaller
// copy (sized/1600/ in Supabase) is fetched when there is one, as it's a
// fraction of the size of the photo itself.

const fs = require('fs');
const path = require('path');
const FactsKit = require('../public/facts-kit.js');

const CACHE_DIR = path.join(__dirname, '..', '.photo-cache');
const WIDTHS = [800, 1600];
const QUALITY = { 800: 78, 1600: 80 };
const WORKERS = 4;

async function download(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return null;
  }
}

// Writes via a temporary file, so a build stopped half way never leaves a
// broken photo in the cache.
function writeAtomic(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
}

async function makeCopies(sharp, url, cached) {
  const copy = await download(FactsKit.sizedPhotoUrl(url, 1600));
  const source = copy || await download(url);
  if (!source) throw new Error('could not download it');
  for (const w of WIDTHS) {
    const out = await sharp(source, { failOn: 'none' })
      .rotate() // upright, from the camera's orientation tag
      .resize({ width: w, height: w, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: QUALITY[w], mozjpeg: true })
      .toBuffer();
    writeAtomic(cached(w), out);
  }
}

// Returns the set of photo URLs now served from this site.
async function mirror(albums, distDir) {
  const served = new Set();
  let sharp;
  try {
    sharp = require('sharp');
  } catch (err) {
    console.log('Gallery photos: image library unavailable, so they load from Supabase.');
    return served;
  }
  const urls = [];
  (albums || []).forEach((a) => {
    const list = a.image_urls && a.image_urls.length ? a.image_urls : a.image_url ? [a.image_url] : [];
    list.forEach((u) => { if (FactsKit.localPhotoPath(u, 800) && urls.indexOf(u) === -1) urls.push(u); });
  });

  let made = 0;
  const failed = [];
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++];
      const rel = (w) => decodeURIComponent(FactsKit.localPhotoPath(url, w).replace(/^\//, ''));
      const cached = (w) => path.join(CACHE_DIR, rel(w));
      try {
        if (!WIDTHS.every((w) => fs.existsSync(cached(w)))) {
          await makeCopies(sharp, url, cached);
          made += 1;
        }
        WIDTHS.forEach((w) => {
          const dest = path.join(distDir, rel(w));
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(cached(w), dest);
        });
        served.add(url);
      } catch (err) {
        failed.push(FactsKit.localPhotoPath(url, 800) + ' (' + err.message + ')');
      }
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  console.log(`Gallery photos: ${served.size} of ${urls.length} served from the site (${made} newly made)${failed.length ? `; ${failed.length} load from Supabase instead: ${failed.slice(0, 5).join(', ')}` : ''}.`);
  return served;
}

module.exports = { mirror };
