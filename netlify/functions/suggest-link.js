// Suggests a URL for a product's Apple links. The admin page cannot do
// this itself: browsers block reading other sites, so the lookup happens
// here. Everything returned points at Apple's US site.
//
// Earlier versions scraped Apple's newsroom and support search pages.
// Those are built by JavaScript, so the HTML arriving here held no
// results and the lookup always came back empty. This version only uses
// sources readable as plain text:
//
//   apple    a real page at apple.com/<slug>/, checked by fetching it
//   specs    the /specs/ page beneath that same product page
//   newsroom Apple's newsroom RSS feed, which is plain XML
//
// Every answer says why it failed, so the panel can tell the difference
// between "no such page" and "Apple would not let us look".

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

function reply(url, reason) {
  return { statusCode: 200, body: JSON.stringify({ url: url || null, reason: reason || null }) };
}

// "MacBook Air (M4)" -> ["macbook-air", "macbook"]
function slugCandidates(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\bm\d(\s+(pro|max|ultra))?\b/g, ' ')
    .replace(/\ba\d{2}\w*\b/g, ' ')
    .replace(/\b(1st|2nd|3rd|\d+th)\b/g, ' ')
    .replace(/\bgeneration\b/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const words = base.split(' ').filter(Boolean);
  if (!words.length) return [];
  const out = [words.join('-')];
  if (words.length > 1) out.push(words.slice(0, -1).join('-'));
  return [...new Set(out)];
}

async function get(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: HEADERS });
    if (res.status === 403 || res.status === 429) return { blocked: true };
    if (!res.ok) return { missing: true };
    return { ok: true, url: res.url, text: await res.text() };
  } catch (e) {
    return { unreachable: true };
  }
}

function keywords(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

async function findNewsroom(name) {
  const feed = await get('https://www.apple.com/newsroom/rss-feed.rss');
  if (feed.blocked) return { reason: 'blocked' };
  if (!feed.ok) return { reason: 'unreachable' };

  const items = [...feed.text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const words = keywords(name);
  let best = null;
  let bestScore = 0;

  for (const item of items) {
    const title = (item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
    const link = (item.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/) || [])[1] || '';
    if (!link) continue;
    const haystack = title.toLowerCase();
    const score = words.filter((w) => haystack.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = link.trim(); }
  }

  // At least two matching words, so an unrelated story is never offered.
  if (best && bestScore >= 2) return { url: best };
  return { reason: 'not_found' };
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const kind = params.kind;
  const name = (params.name || '').trim();
  if (!name) return { statusCode: 400, body: JSON.stringify({ error: 'No product name given.' }) };

  try {
    if (kind === 'apple' || kind === 'specs') {
      const tail = kind === 'specs' ? 'specs/' : '';
      let sawBlock = false;
      for (const slug of slugCandidates(name)) {
        const res = await get('https://www.apple.com/' + slug + '/' + tail);
        if (res.blocked) { sawBlock = true; continue; }
        if (res.ok) {
          let url = res.url.replace('://www.apple.com/uk/', '://www.apple.com/');
          if (!url.endsWith('/')) url += '/';
          return reply(url, null);
        }
      }
      return reply(null, sawBlock ? 'blocked' : 'not_found');
    }

    if (kind === 'newsroom') {
      const found = await findNewsroom(name);
      return reply(found.url, found.reason);
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown link type.' }) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
  }
};
