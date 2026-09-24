// Suggests a URL for a product's Apple links. The admin page cannot do
// this itself: browsers block reading other sites' pages, so the lookup
// happens here instead.
//
// Everything returned points at Apple's US site.

const UA = { 'User-Agent': 'AppleSunset/1.0 (link suggester)' };

// Turns "MacBook Air (M5)" into candidate apple.com paths, most likely first.
function candidates(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')            // drop "(M5)", "(2nd generation)"
    .replace(/\b(m\d(\s?(pro|max|ultra))?|a\d{2}\w*)\b/g, ' ') // drop chip names
    .replace(/\b(1st|2nd|3rd|\d+th)\b/g, ' ')
    .replace(/\bgeneration\b/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')   // drop years
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const words = base.split(' ').filter(Boolean);
  const out = new Set();
  if (words.length) {
    out.add(words.join('-'));                     // macbook-air
    if (words.length > 1) out.add(words.slice(0, -1).join('-')); // macbook
    out.add(words.join(''));                      // macbookair
  }
  return [...out];
}

async function head(url) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', headers: UA });
    return res.ok ? res.url : null;
  } catch (e) { return null; }
}

// Apple's newsroom has a search page we can read server-side.
async function newsroomSearch(name) {
  try {
    const res = await fetch('https://www.apple.com/newsroom/search/?q=' + encodeURIComponent(name), { headers: UA });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/href="(\/newsroom\/\d{4}\/\d{2}\/[^"]+)"/);
    return m ? 'https://www.apple.com' + m[1] : null;
  } catch (e) { return null; }
}

// support.apple.com specs documents are found through Apple's own search.
async function specsSearch(name) {
  try {
    const res = await fetch('https://support.apple.com/kb/index?page=search&locale=en_US&q=' +
      encodeURIComponent(name + ' technical specifications'), { headers: UA });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/href="(https:\/\/support\.apple\.com\/en-us\/\d+)"/);
    return m ? m[1] : null;
  } catch (e) { return null; }
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const kind = params.kind;
  const name = (params.name || '').trim();
  if (!name) return { statusCode: 400, body: JSON.stringify({ error: 'No product name given.' }) };

  try {
    let url = null;

    if (kind === 'apple') {
      for (const slug of candidates(name)) {
        url = await head('https://www.apple.com/' + slug + '/');
        if (url) break;
      }
    } else if (kind === 'newsroom') {
      url = await newsroomSearch(name);
    } else if (kind === 'specs') {
      url = await specsSearch(name);
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: 'Unknown link type.' }) };
    }

    if (!url) return { statusCode: 200, body: JSON.stringify({ url: null }) };
    // Never hand back a localised page.
    url = url.replace('://www.apple.com/uk/', '://www.apple.com/')
             .replace('/en-gb/', '/en-us/');
    return { statusCode: 200, body: JSON.stringify({ url }) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
  }
};
