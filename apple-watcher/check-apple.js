// Apple Watcher — checks a set of Apple.com product pages once a day and
// emails a summary of anything added, removed, or changed since the last
// run. Runs independently of the Apple Sunset website itself; see README.md
// in this folder for setup.

const fs = require('fs');
const path = require('path');

const PAGES_PATH = path.join(__dirname, 'pages.json');
const SNAPSHOT_PATH = path.join(__dirname, 'snapshot.json');

const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function cleanText(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, '\u2019')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Known status prefixes that are a genuine lifecycle signal worth
// reporting (a product moving from pre-order to on-sale, or a brand new
// listing appearing). Everything else in the tile's text — the "Take a
// closer look" boilerplate, and the exact CTA wording ("Buy" vs "Shop
// Now" vs "View pricing") — carries no information beyond what name,
// price, and status already capture, so it's deliberately discarded
// rather than compared.
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "'")
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatEntry(p) {
  const parts = [p.status, p.name].filter(Boolean);
  const label = parts.join(' \u2014 ');
  return p.price ? label + ' (' + p.price + ')' : label;
}

const STATUS_PATTERNS = [
  { re: /^pre-?order\b[\s\d./]*/i, label: 'Pre-order' },
  { re: /^coming soon\b[\s\d./]*/i, label: 'Coming soon' },
  { re: /^new\b\s*/i, label: 'New' },
];

function parseProductEntry(rawText) {
  const beforeLook = rawText.split(/take a closer look/i)[0].trim();
  const afterLook = rawText.split(/take a closer look/i)[1] || '';

  let status = null;
  let name = beforeLook;
  for (const { re, label } of STATUS_PATTERNS) {
    if (re.test(beforeLook)) {
      status = label;
      name = beforeLook.replace(re, '').trim();
      break;
    }
  }

  const priceMatch = afterLook.match(/\$[\d,]+/);
  const price = priceMatch ? priceMatch[0] : null;

  return { name: name || beforeLook, price, status };
}

// Extracts every product-link entry from a page's HTML. Apple's overview
// pages (e.g. /shop/buy-iphone) list each current model as a link to its
// own /shop/buy-*/ page, with the model name, price, and a status label
// (Buy / Pre-Order / View pricing) inside the link text. This is more
// robust than matching specific CSS classes, since it only depends on the
// URL shape and the presence of "Buy from $" or "Buy" phrasing, both of
// which are unlikely to change even if Apple restyles the page.
function extractProducts(html, pageUrl) {
  const base = new URL(pageUrl).origin;
  const linkPattern = /<a\s+[^>]*href="([^"]*\/shop\/buy-[^"?#]*)"[^>]*>([\s\S]*?)<\/a>/g;
  const seen = new Map();
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1].startsWith('http') ? match[1] : base + match[1];
    const text = cleanText(match[2]);
    if (!text) continue;
    // Only keep links that look like a product tile (mentions buying or
    // a price), to skip footer/nav links that also point at /shop/buy-*.
    if (!/buy|pre-order|view pricing|\$\d/i.test(text)) continue;
    if (!seen.has(href) || text.length > seen.get(href).length) {
      seen.set(href, text);
    }
  }
  return Array.from(seen.entries()).map(([url, text]) => ({ url, ...parseProductEntry(text) }));
}

async function fetchPage(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: {
        // A realistic browser User-Agent, not a bot-identifying one.
        // Large sites commonly serve a fake "not found" page to
        // non-browser clients as anti-scraping protection, which looks
        // identical to a genuinely wrong URL from the outside, so this
        // matters as much as getting the URL right.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const bodySnippet = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 150);
      throw new Error('HTTP ' + res.status + (bodySnippet ? ' — page said: "' + bodySnippet + '..."' : ''));
    }
    return await res.text();
  } catch (err) {
    if (attempt < 2) {
      // One retry for transient network blips, so a momentary glitch
      // doesn't produce a false "couldn't check" every time it happens.
      await new Promise((r) => setTimeout(r, 3000));
      return fetchPage(url, attempt + 1);
    }
    throw err;
  }
}


async function checkAllPages() {
  const pages = loadJson(PAGES_PATH, []);
  const previousSnapshot = loadJson(SNAPSHOT_PATH, {});
  const newSnapshot = {};
  const results = [];

  for (const page of pages) {
    try {
      const html = await fetchPage(page.url);
      const products = extractProducts(html, page.url);
      if (!products.length) {
        results.push({ category: page.category, error: 'No products found on the page (its layout may have changed).' });
        // Keep yesterday's snapshot for this category rather than wiping
        // it out, so a temporary parsing miss doesn't look like every
        // product was removed tomorrow.
        newSnapshot[page.category] = previousSnapshot[page.category] || [];
        continue;
      }
      newSnapshot[page.category] = products;

      const previous = previousSnapshot[page.category] || [];
      const previousByUrl = new Map(previous.map((p) => [p.url, p]));
      const currentByUrl = new Map(products.map((p) => [p.url, p]));

      const added = products.filter((p) => !previousByUrl.has(p.url));
      const removed = previous.filter((p) => !currentByUrl.has(p.url));
      const changed = products
        .filter((p) => {
          if (!previousByUrl.has(p.url)) return false;
          const before = previousByUrl.get(p.url);
          return normalize(before.name) !== normalize(p.name)
            || before.price !== p.price
            || before.status !== p.status;
        })
        .map((p) => ({ url: p.url, before: previousByUrl.get(p.url), after: p }));

      if (added.length || removed.length || changed.length) {
        results.push({ category: page.category, added, removed, changed });
      }
    } catch (err) {
      results.push({ category: page.category, error: 'Could not fetch the page: ' + err.message });
      newSnapshot[page.category] = previousSnapshot[page.category] || [];
    }
  }

  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(newSnapshot, null, 2) + '\n');
  return { results, isFirstRun: Object.keys(previousSnapshot).length === 0 };
}

function buildEmail(results, isFirstRun) {
  const withChanges = results.filter((r) => !r.error && (r.added?.length || r.removed?.length || r.changed?.length));
  const errors = results.filter((r) => r.error);

  if (isFirstRun) {
    return {
      subject: 'Apple Watcher — first run, baseline saved',
      text:
        "Today's run recorded the current lineup for each category as the starting point. " +
        "From tomorrow's run onward, you'll get a comparison against this baseline.\n\n" +
        (errors.length
          ? "Couldn't check:\n" + errors.map((e) => '- ' + e.category + ': ' + e.error).join('\n')
          : 'All categories checked successfully.'),
    };
  }

  if (!withChanges.length) {
    const lines = ['No changes since yesterday. Checked ' + results.filter((r) => !r.error).length + ' categories.'];
    if (errors.length) {
      lines.push('');
      lines.push("Couldn't check:");
      errors.forEach((e) => lines.push('- ' + e.category + ': ' + e.error));
    }
    return { subject: 'Apple Watcher — no changes today', text: lines.join('\n') };
  }

  const lines = [];
  withChanges.forEach((r) => {
    lines.push(r.category.toUpperCase());
    if (r.removed.length) {
      lines.push('  Removed:');
      r.removed.forEach((p) => lines.push('    - ' + formatEntry(p)));
    }
    if (r.added.length) {
      lines.push('  Added:');
      r.added.forEach((p) => lines.push('    - ' + formatEntry(p)));
    }
    if (r.changed.length) {
      lines.push('  Changed:');
      r.changed.forEach((p) => lines.push('    - was: ' + formatEntry(p.before) + '\n      now: ' + formatEntry(p.after)));
    }
    lines.push('');
  });

  if (errors.length) {
    lines.push("Couldn't check:");
    errors.forEach((e) => lines.push('- ' + e.category + ': ' + e.error));
  }

  const removedCount = withChanges.reduce((n, r) => n + r.removed.length, 0);
  const addedCount = withChanges.reduce((n, r) => n + r.added.length, 0);
  const changedCount = withChanges.reduce((n, r) => n + r.changed.length, 0);
  const subjectParts = [];
  if (removedCount) subjectParts.push(removedCount + ' removed');
  if (addedCount) subjectParts.push(addedCount + ' added');
  if (changedCount) subjectParts.push(changedCount + ' changed');

  return {
    subject: 'Apple Watcher — ' + subjectParts.join(', '),
    text: lines.join('\n'),
  };
}

async function sendEmail(subject, text) {
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    console.log('RESEND_API_KEY or NOTIFY_EMAIL not set, skipping send. Would have sent:');
    console.log(subject);
    console.log(text);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Apple Watcher <onboarding@resend.dev>',
      to: [NOTIFY_EMAIL],
      subject,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error('Resend API error ' + res.status + ': ' + body);
  }
}

async function main() {
  const { results, isFirstRun } = await checkAllPages();
  const { subject, text } = buildEmail(results, isFirstRun);
  console.log(subject);
  console.log(text);
  await sendEmail(subject, text);
}

main().catch((err) => {
  console.error('Apple Watcher failed:', err);
  process.exit(1);
});
