// The page an X post links to when it carries a card: /c/<key>/<path>.
// X reads this page's preview tags and shows the card saved for <key>
// (x-cards/<key>.png in storage, uploaded by admin or the phone app);
// people who tap the link are sent straight on to <path> on this site.
//
// It claims /c/* itself (config.path below) rather than through a
// redirect rule in netlify.toml, which on the live site answered 404.

const escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const env = (name) => (typeof Netlify !== 'undefined' && Netlify.env && Netlify.env.get(name)) || process.env[name] || '';

export default async (req) => {
  const site = (env('URL') || 'https://applesunset.com').replace(/\/+$/, '');
  const supabaseUrl = env('SUPABASE_URL').replace(/\/+$/, '');
  const raw = new URL(req.url).pathname.replace(/^\/c(?=\/|$)/, '');
  const match = raw.match(/^\/([0-9a-z]{1,16})(\/.*)?$/i);
  if (!match) return new Response('', { status: 302, headers: { Location: site + '/' } });
  const key = match[1].toLowerCase();
  // Only ever forwards to a page on this site.
  let path = match[2] || '/';
  if (!/^\/[A-Za-z0-9\-._~/]*$/.test(path) || path.startsWith('//')) path = '/';
  const target = site + path;
  const image = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/product-images/x-cards/${key}.png` : `${site}/logo.png`;
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Apple Sunset</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${escapeHtml(target)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Apple Sunset">
<meta property="og:title" content="Apple Sunset">
<meta property="og:description" content="How long since every Apple product was last refreshed.">
<meta property="og:url" content="${escapeHtml(site + '/c/' + key + path)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="675">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Apple Sunset">
<meta name="twitter:description" content="How long since every Apple product was last refreshed.">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">
</head><body>
<p><a href="${escapeHtml(target)}">Continue to Apple Sunset</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
};

export const config = {
  path: '/c/*',
};
