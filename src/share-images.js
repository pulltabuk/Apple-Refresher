// Social share images, one per product, drawn at build time.
//
// These are what people see when a link is pasted into WhatsApp, Slack
// or X. A card showing the product name and its days-since number beats
// the same logo appearing on every link.
//
// Everything here is best effort: if the image library is missing, or a
// build machine can't rasterise text, generate() returns an empty map
// and every page falls back to the logo. A share image is never worth
// failing a deploy over.

const fs = require('fs');
const path = require('path');

const WIDTH = 1200;
const HEIGHT = 630;
const FONT_STACK = 'DejaVu Sans, Liberation Sans, Helvetica, Arial, sans-serif';

function escapeXml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Rough wrap: real font metrics aren't known here, so this estimates
// from character count. The font size steps down for longer names, so
// an estimate that runs slightly long still fits the card.
function wrap(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const candidate = line ? line + ' ' + word : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

function formatLongDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function cardContent(product, status) {
  if (product.discontinued) {
    return {
      name: product.name,
      headline: 'Discontinued',
      sub: product.discontinued_date ? formatLongDate(product.discontinued_date) : 'No longer sold by Apple',
    };
  }
  if (!status) {
    return { name: product.name, headline: 'Tracked', sub: 'Release history on Apple Sunset' };
  }
  const days = status.daysSince;
  return {
    name: product.name,
    headline: `${days} ${days === 1 ? 'day' : 'days'}`,
    sub: 'since Apple last updated it',
  };
}

function cardSvg({ name, headline, sub }) {
  const nameSize = name.length > 26 ? 62 : name.length > 18 ? 74 : 88;
  const nameLines = wrap(name, name.length > 26 ? 24 : 20);
  const nameY = nameLines.length > 1 ? 200 : 240;
  const afterName = nameY + (nameLines.length - 1) * (nameSize + 10);
  const headlineSize = headline.length > 12 ? 78 : 104;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f0a04b"/>
      <stop offset="55%" stop-color="#c2540c"/>
      <stop offset="100%" stop-color="#3d1f3d"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#141414"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>
  <rect x="48" y="48" width="${WIDTH - 96}" height="${HEIGHT - 96}" rx="30" fill="#141414" opacity="0.86"/>
  ${nameLines.map((line, i) => `<text x="104" y="${nameY + i * (nameSize + 10)}" font-family="${FONT_STACK}" font-size="${nameSize}" font-weight="bold" fill="#ffffff">${escapeXml(line)}</text>`).join('\n  ')}
  <text x="104" y="${afterName + 150}" font-family="${FONT_STACK}" font-size="${headlineSize}" font-weight="bold" fill="#f0a04b">${escapeXml(headline)}</text>
  <text x="104" y="${afterName + 210}" font-family="${FONT_STACK}" font-size="38" fill="#e6e1da">${escapeXml(sub)}</text>
  <text x="104" y="${HEIGHT - 80}" font-family="${FONT_STACK}" font-size="30" font-weight="bold" fill="#ffffff" opacity="0.85">applesunset.com</text>
</svg>`;
}

async function generate(items, distDir) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (err) {
    console.log('Share images skipped (image library unavailable), the logo is used instead.');
    return {};
  }
  const outDir = path.join(distDir, 'share');
  fs.mkdirSync(outDir, { recursive: true });
  const paths = {};
  let failures = 0;
  for (const item of items) {
    const product = item.product;
    try {
      const svg = cardSvg(cardContent(product, item.status));
      await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(outDir, `${product.slug}.png`));
      paths[product.slug] = `/share/${product.slug}.png`;
    } catch (err) {
      failures += 1;
    }
  }
  console.log(`Share images: ${Object.keys(paths).length} written${failures ? `, ${failures} fell back to the logo` : ''}.`);
  return paths;
}

module.exports = { generate, cardSvg, cardContent };
