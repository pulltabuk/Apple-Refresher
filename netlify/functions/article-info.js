// Reads an article's headline for the admin's X tab ("Share an article"):
// its og:title (or <title>), the site's name and the site's X account
// (twitter:site), so a post can credit it. Only for a signed-in admin,
// only public https pages, and at most 8 seconds and the first 800KB.

const dns = require('dns').promises;
const net = require('net');

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Addresses inside a network (this server's own, or a home router's)
// are never fetched, whatever a link or a redirect points at.
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb');
}

async function isPublicHttps(url) {
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (net.isIP(host)) return !isPrivateAddress(host);
  try {
    const addresses = await dns.lookup(host, { all: true });
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
  } catch (e) {
    return false;
  }
}

function decodeEntities(str) {
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function metaContent(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = (tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!name || name.toLowerCase() !== key) continue;
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i);
    if (content) return decodeEntities(content[1]).replace(/\s+/g, ' ').trim();
  }
  return '';
}

async function readStart(res, limit) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString('utf8');
}

// The site owner's login(s). ADMIN_EMAILS in Netlify's environment
// variables (comma separated) overrides the default.
const OWNER_EMAILS = (process.env.ADMIN_EMAILS || 'jgprice@mac.com').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
function isOwner(user) {
  return !!(user && user.email && OWNER_EMAILS.indexOf(String(user.email).toLowerCase()) !== -1);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Not signed in.' });
  if (!supabaseUrl || !anonKey) return json(500, { error: 'Supabase is not configured.' });
  try {
    const check = await fetch(supabaseUrl + '/auth/v1/user', { headers: { apikey: anonKey, Authorization: 'Bearer ' + token } });
    if (!check.ok) return json(401, { error: 'Session is not valid. Sign in again.' });
    // The site owner only: anyone could create an account.
    if (!isOwner(await check.json())) return json(403, { error: 'This account can\u2019t use this.' });
  } catch (err) {
    return json(502, { error: 'Could not verify the session: ' + err.message });
  }

  let url;
  try {
    url = new URL(JSON.parse(event.body || '{}').url);
  } catch (e) {
    return json(400, { error: 'That isn’t a link.' });
  }

  try {
    // Redirects are followed by hand, so each stop is checked too.
    let res;
    for (let hop = 0; hop < 4; hop += 1) {
      if (!(await isPublicHttps(url))) return json(400, { error: 'Only public https:// pages can be read.' });
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AppleSunsetBot/1.0; +https://applesunset.com)', Accept: 'text/html,application/xhtml+xml' },
      });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!next) break;
      url = new URL(next, url);
      res = null;
    }
    if (!res) return json(502, { error: 'The page redirected too many times.' });
    if (!res.ok) return json(502, { error: 'The site answered ' + res.status + '.' });
    const html = await readStart(res, 800 * 1024);
    const titleTag = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const title = metaContent(html, 'og:title') || metaContent(html, 'twitter:title') || decodeEntities(titleTag).replace(/\s+/g, ' ').trim();
    const site = metaContent(html, 'og:site_name') || url.hostname.replace(/^www\./i, '');
    const via = metaContent(html, 'twitter:site').replace(/^@/, '');
    const canonical = metaContent(html, 'og:url');
    return json(200, {
      title: title.slice(0, 300),
      site: site.slice(0, 60),
      via: /^[A-Za-z0-9_]{1,15}$/.test(via) ? via : '',
      url: /^https:\/\//i.test(canonical) ? canonical : url.toString(),
    });
  } catch (err) {
    return json(502, { error: err.name === 'TimeoutError' ? 'The site took too long to answer.' : 'Could not read the page: ' + err.message });
  }
};
