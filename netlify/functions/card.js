// The page an X post links to when it carries a card: /c/<key>/<path>.
// X reads this page's preview tags and shows the card saved for <key>
// (x-cards/<key>.png in storage, uploaded by admin or the phone app);
// people who tap the link are sent straight on to <path> on this site.

const escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

exports.handler = async (event) => {
  const site = (process.env.URL || 'https://applesunset.com').replace(/\/+$/, '');
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  // Works whether Netlify hands over the original path or the function's.
  const raw = String(event.path || '').replace(/^\/\.netlify\/functions\/card/, '').replace(/^\/c(?=\/)/, '');
  const match = raw.match(/^\/([0-9a-z]{1,16})(\/.*)?$/i);
  if (!match) return { statusCode: 302, headers: { Location: site + '/' }, body: '' };
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
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    body: html,
  };
};
