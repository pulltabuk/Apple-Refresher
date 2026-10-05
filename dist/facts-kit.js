// "Did you know?" facts, shared by the admin panel (admin.js) and the
// phone app (upload.js): working out fact candidates from product data,
// the tweet text, and the image card that goes with a tweet.
(function () {
  // The tweet links to the fact's own page (/facts/<id>/), whose preview
  // image is the fact's card, so X shows the card under the tweet.
  function buildTweetText(factText, link) {
    const lower = factText.toLowerCase();
    let emoji = '\ud83c\udf4e';
    const hashtags = ['#Apple'];
    const addTag = (keyword, tag, tagEmoji) => {
      if (lower.indexOf(keyword) !== -1) {
        hashtags.push(tag);
        if (tagEmoji) emoji = tagEmoji;
      }
    };
    addTag('iphone', '#iPhone', '\ud83d\udcf1');
    addTag('apple tv', '#AppleTV', '\ud83d\udcfa');
    addTag('airtag', '#AirTag', '\ud83d\udccd');
    addTag('vision pro', '#VisionPro', '\ud83e\udd7d');
    addTag('apple pencil', '#ApplePencil', '\u270f\ufe0f');
    addTag('watch', '#AppleWatch', '\u231a');
    addTag('airpods', '#AirPods', '\ud83c\udfa7');
    addTag('mac', '#Mac', '\ud83d\udcbb');
    addTag('ipad', '#iPad', '\ud83d\udcf2');
    if (hashtags.length < 3) hashtags.push('#TechFacts');
    const uniqueHashtags = Array.from(new Set(hashtags)).slice(0, 4);

    const hook = emoji + ' Apple Fact:';
    const footer = uniqueHashtags.join(' ') + '\n' + (link || window.location.host);
    let body = hook + ' ' + factText;
    let full = body + '\n\n' + footer;

    // Twitter's 280-char limit: trim the fact text itself (never the
    // hashtags or link) if the combined text runs over.
    // X counts any link as 23 characters, however long it is.
    const linkAllowance = link ? link.length - 23 : 0;
    if (full.length - linkAllowance > 280) {
      const overBy = full.length - linkAllowance - 280;
      const keep = Math.max(20, factText.length - overBy - 1);
      const trimmed = factText.slice(0, keep).trim() + '\u2026';
      body = hook + ' ' + trimmed;
      full = body + '\n\n' + footer;
    }
    return full;
  }

  // --- The 1200x675 "Did you know?" card, in the site's sunset colours
  // with the logo. ---

  // The site header's sunset gradient (styles.css .site-header-bg).
  const SUNSET = [[0, '#f5b942'], [0.3, '#e8752c'], [0.58, '#c8432f'], [0.82, '#7d2a4a'], [1, '#2e1a3d']];
  const FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

  let logoPromise = null;
  function loadLogo() {
    if (!logoPromise) {
      logoPromise = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null); // the card still works without it
        img.src = '/logo.png';
      });
    }
    return logoPromise;
  }

  // Just the warm half, for text and lines, so they stay readable on the dark card.
  const SUNSET_WARM = [[0, '#f5b942'], [0.55, '#e8752c'], [1, '#e0553b']];

  function sunsetGradient(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    (stops || SUNSET).forEach(([stop, colour]) => g.addColorStop(stop, colour));
    return g;
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapLines(ctx, text, maxWidth) {
    const lines = [];
    let line = '';
    text.split(/\s+/).filter(Boolean).forEach((word) => {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  // Same layout as the original card (small label, big fact, web address),
  // on the site's sunset colours, with the logo small in the bottom-right.
  async function drawFactCanvas(factText) {
    const logo = await loadLogo();
    const W = 1200;
    const H = 675;
    const PAD = 80;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Sunset background, from the orange of the header gradient through
    // to its deep plum, so white text stays readable everywhere.
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#e8752c');
    bg.addColorStop(0.38, '#c8432f');
    bg.addColorStop(0.72, '#7d2a4a');
    bg.addColorStop(1, '#2e1a3d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // A light shade over the brightest corner for extra contrast.
    const shade = ctx.createLinearGradient(0, 0, W * 0.6, 0);
    shade.addColorStop(0, 'rgba(46, 26, 61, 0.22)');
    shade.addColorStop(1, 'rgba(46, 26, 61, 0)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
    // The header's golden edge along the top.
    ctx.fillStyle = sunsetGradient(ctx, 0, 0, W, 0);
    ctx.fillRect(0, 0, W, 10);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;

    // Label.
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 34px ' + FONT;
    ctx.fillText('DID YOU KNOW?', PAD, 120);

    // The fact: as large as fits between the label and the footer.
    const areaTop = 170;
    const areaBottom = H - 150; // clear of the logo
    const maxWidth = W - PAD * 2;
    let size = 56;
    let lines;
    let lineHeight;
    for (;;) {
      ctx.font = '700 ' + size + 'px ' + FONT;
      lines = wrapLines(ctx, factText, maxWidth);
      lineHeight = Math.round(size * 1.26);
      if (lines.length * lineHeight <= areaBottom - areaTop || size <= 30) break;
      size -= 2;
    }
    let y = areaTop + size;
    lines.forEach((line) => {
      ctx.fillText(line, PAD, y);
      y += lineHeight;
    });

    // Web address, bottom-left.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '500 26px ' + FONT;
    ctx.fillText('applesunset.com', PAD, H - 60);

    // Logo, small, bottom-right.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    if (logo) {
      const size2 = 76;
      const lx = W - PAD - size2 + 10;
      const ly = H - 50 - size2;
      roundedRect(ctx, lx, ly, size2, size2, 16);
      ctx.fillStyle = '#000';
      ctx.fill(); // casts the shadow
      ctx.shadowColor = 'transparent';
      ctx.save();
      roundedRect(ctx, lx, ly, size2, size2, 16);
      ctx.clip();
      ctx.drawImage(logo, lx, ly, size2, size2);
      ctx.restore();
    }
    ctx.shadowColor = 'transparent';

    return canvas;
  }

  async function generateFactImage(factText) {
    return (await drawFactCanvas(factText)).toDataURL('image/png');
  }

  // The same card as a PNG file, for the iPhone share sheet.
  async function factImageFile(factText) {
    const canvas = await drawFactCanvas(factText);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], 'apple-sunset-fact.png', { type: 'image/png' }) : null);
      }, 'image/png');
    });
  }

  // Start fetching the logo straight away so the first card is quick
  // (in a browser only: the build also uses this file).
  if (typeof Image !== 'undefined') loadLogo();

  function generateFactCandidates(products) {
    const cachedProducts = products || [];
    const facts = [];
    // Only real releases count: a discontinued date stored alongside the
    // release dates, or a date still to come, is not a release.
    const allDates = [];
    cachedProducts.forEach((p) => pastReleases(p).filter((d, i, a) => a.indexOf(d) === i).forEach((d) => allDates.push(d)));

    // Month-of-release pattern, only surfaced with a real sample behind it.
    if (allDates.length >= 5) {
      const monthCounts = {};
      allDates.forEach((d) => {
        const month = new Date(d).toLocaleDateString('en-GB', { month: 'long' });
        monthCounts[month] = (monthCounts[month] || 0) + 1;
      });
      const topMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0];
      if (topMonth && topMonth[1] / allDates.length >= 0.3) {
        const pct = Math.round((topMonth[1] / allDates.length) * 100);
        facts.push(pct + '% of the ' + allDates.length + ' product releases tracked by Apple Sunset have happened in ' + topMonth[0] + ' (' + topMonth[1] + ' of ' + allDates.length + ').');
      }
    }

    // Day-of-week pattern.
    if (allDates.length >= 5) {
      const dayCounts = {};
      allDates.forEach((d) => {
        const day = new Date(d).toLocaleDateString('en-GB', { weekday: 'long' });
        dayCounts[day] = (dayCounts[day] || 0) + 1;
      });
      const topDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
      if (topDay && topDay[1] / allDates.length >= 0.3) {
        const pct = Math.round((topDay[1] / allDates.length) * 100);
        facts.push(pct + '% of the ' + allDates.length + ' product releases tracked by Apple Sunset have landed on a ' + topDay[0] + ' (' + topDay[1] + ' of ' + allDates.length + ').');
      }
    }

    // Average refresh cycle per category.
    const categoryCycles = {};
    cachedProducts.forEach((p) => {
      const hist = pastReleases(p);
      if (hist.length < 2) return;
      for (let i = 1; i < hist.length; i++) {
        const days = Math.round((new Date(hist[i]) - new Date(hist[i - 1])) / 86400000);
        if (days <= 0) continue;
        if (!categoryCycles[p.category]) categoryCycles[p.category] = [];
        categoryCycles[p.category].push(days);
      }
    });
    Object.keys(categoryCycles).forEach((cat) => {
      const cycles = categoryCycles[cat];
      if (cycles.length >= 2) {
        const avg = Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length);
        facts.push(cat + ' products have refreshed roughly every ' + avg + ' days on average, based on ' + cycles.length + ' refresh' + (cycles.length === 1 ? '' : 'es') + ' tracked by Apple Sunset.');
      }
    });

    // Longest and shortest-lived discontinued products.
    const lifespans = cachedProducts
      .filter((p) => p.discontinued && p.discontinued_date)
      .map((p) => {
        const launch = p.original_launch_date || (p.refresh_history || []).slice().sort()[0];
        if (!launch) return null;
        const days = Math.round((new Date(p.discontinued_date) - new Date(launch)) / 86400000);
        return days > 0 ? { name: p.name, days: days } : null;
      })
      .filter(Boolean);
    if (lifespans.length >= 2) {
      const longest = lifespans.slice().sort((a, b) => b.days - a.days)[0];
      const longYears = Math.floor(longest.days / 365);
      const longText = longYears >= 1 ? 'about ' + longYears + ' year' + (longYears === 1 ? '' : 's') : longest.days + ' days';
      facts.push('The ' + longest.name + ' had the longest run of any discontinued product tracked by Apple Sunset, lasting ' + longText + ' before being replaced.');

      const shortest = lifespans.slice().sort((a, b) => a.days - b.days)[0];
      if (shortest.name !== longest.name) {
        const shortYears = Math.floor(shortest.days / 365);
        const shortText = shortYears >= 1 ? 'about ' + shortYears + ' year' + (shortYears === 1 ? '' : 's') : 'just ' + shortest.days + ' days';
        facts.push('The ' + shortest.name + ' had the shortest run of any discontinued product tracked by Apple Sunset, lasting ' + shortText + '.');
      }
    }

    // Always-available overall stats.
    const categoryCount = new Set(cachedProducts.map((p) => p.category)).size;
    facts.push('Apple Sunset is currently tracking ' + cachedProducts.length + ' Apple products across ' + categoryCount + ' categories.');

    return facts;
  }

  // Facts published before the wording changed from "this site" / "here"
  // to "Apple Sunset" still count as the same fact.
  function normaliseFact(text) {
    return String(text || '').trim().toLowerCase()
      .replace(/tracked (on this site|here|by apple sunset)/g, 'tracked')
      .replace(/^(this site|apple sunset) is/, 'x is');
  }

  function sameFact(a, b) {
    return normaliseFact(a) === normaliseFact(b);
  }

  // --- Each fact's card, saved online for its page's link preview ---
  // A short fingerprint of the wording, so an edited fact gets a new card
  // (and X, which remembers previews, sees a new image). build.js has the
  // same function; keep them in step.
  function factKey(text) {
    const str = String(text || '').trim();
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  const CARD_BUCKET = 'product-images';

  function factCardPath(fact) {
    return 'fact-cards/' + fact.id + '-' + factKey(fact.text) + '.png';
  }

  // ?v= changes with the wording: X remembers a preview per address, so
  // an edited fact needs a new address to show its new card.
  function factPageUrl(fact) {
    return window.location.origin + '/facts/' + fact.id + '/?v=' + factKey(fact.text);
  }

  function factCardPublicUrl(client, fact) {
    return client.storage.from(CARD_BUCKET).getPublicUrl(factCardPath(fact)).data.publicUrl;
  }

  async function factCardExists(client, fact) {
    try {
      const res = await fetch(factCardPublicUrl(client, fact), { method: 'HEAD', cache: 'no-store' });
      return res.ok;
    } catch (err) {
      return false;
    }
  }

  // Makes the card and saves it. Returns true when the card is online.
  async function uploadFactCard(client, fact) {
    const file = await factImageFile(fact.text);
    if (!file) return false;
    const { error } = await client.storage.from(CARD_BUCKET).upload(factCardPath(fact), file, { contentType: 'image/png' });
    if (!error) return true;
    // Already there from an earlier save of the same wording.
    return /exist|duplicate/i.test(error.message || '') || error.statusCode === '409';
  }

  // True once the fact's page is live and points at this wording's card,
  // so X finds the right card when it looks.
  async function factPageLive(fact) {
    try {
      const res = await fetch('/facts/' + fact.id + '/', { cache: 'no-store' });
      if (!res.ok) return false;
      const html = await res.text();
      return html.indexOf(fact.id + '-' + factKey(fact.text) + '.png') !== -1;
    } catch (err) {
      return false;
    }
  }

  // A careful research request for the Claude app (free: no API cost).
  // Shared by the phone app and the admin panel. Lists the most recent
  // published facts so Claude avoids repeats; capped to keep the link short.
  function claudeResearchPrompt(topic, publishedTexts) {
    const published = (publishedTexts || []).slice(0, 25).map((t) => '- ' + t).join('\n');
    return [
      'I run Apple Sunset (applesunset.com), a site tracking how long it has been since each Apple product was refreshed or discontinued. I need a "Did you know?" fact for the site and X.',
      '',
      'Topic: ' + topic,
      '',
      'Please:',
      '1. Search the web and find 3 surprising, little-known, specific facts about this topic.',
      '2. Check every fact against at least two independent, reliable sources (for example Apple Newsroom or press releases, Apple Support pages, major news outlets, well-cited Wikipedia articles). Search again independently to confirm; don\'t rely on one site copying another.',
      '3. Double-check every date, number and name exactly. Drop any fact that isn\'t confirmed by two sources, that sources disagree on, or that relies on rumour.',
      '4. Don\'t repeat or closely resemble any of my published facts (listed below).',
      '5. Write each fact as one or two plain sentences in British English, under 200 characters, in a neutral brand voice (no "I" or "my"). If it mentions this site, say "Apple Sunset".',
      '',
      'Reply with, for each fact: the fact on its own line, then its sources as links, then how confident you are and why.',
      published ? '\nMy published facts:\n' + published : '',
    ].join('\n');
  }

  function claudeResearchUrl(prompt) {
    return 'https://claude.ai/new?q=' + encodeURIComponent(prompt);
  }

  // --- One product: facts worked out from its own data, and Claude
  // research requests for its "Did you know?" and its Notes. Shared by
  // the laptop admin and the phone app.

  function spanText(days) {
    const years = days / 365.25;
    if (years >= 1.75) return 'about ' + (Math.round(years * 2) / 2).toString().replace('.5', '½') + ' years';
    if (days >= 60) return 'about ' + Math.round(days / 30.44) + ' months';
    return days + ' days';
  }
  function daysBetweenIso(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
  function longDate(iso) { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function parsePrice(text) {
    const m = String(text || '').match(/^([£$€])?\s*([\d,.]+)/);
    return m ? { symbol: m[1] || '', value: parseFloat(m[2].replace(/,/g, '')) } : null;
  }
  // Release dates only: a discontinued date stored alongside them, or a
  // date still to come, is not a release.
  function pastReleases(product) {
    const today = new Date().toISOString().slice(0, 10);
    return (product.refresh_history || []).filter((d) => d !== product.discontinued_date && d <= today).slice().sort();
  }

  function productFactCandidates(product, allProducts) {
    const name = product.name || 'This product';
    const releases = pastReleases(product);
    const latest = releases[releases.length - 1];
    const details = product.generation_details && typeof product.generation_details === 'object' ? product.generation_details : {};
    const info = latest ? (details[latest] || {}) : {};
    const out = [];
    if (latest && info.announced && info.announced < latest) {
      out.push('The ' + name + ' went on sale ' + spanText(daysBetweenIso(info.announced, latest)) + ' after Apple announced it, on ' + longDate(info.announced) + '.');
    }
    if (latest && info.preorder && info.preorder < latest) {
      out.push('Pre-orders for the ' + name + ' opened ' + daysBetweenIso(info.preorder, latest) + ' days before it reached customers on ' + longDate(latest) + '.');
    }
    if (releases.length >= 2) {
      const gaps = releases.slice(1).map((d, i) => daysBetweenIso(releases[i], d)).filter((g) => g > 0);
      if (gaps.length) {
        const avg = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
        out.push('Across ' + releases.length + ' releases since ' + new Date(releases[0]).getFullYear() + ', Apple has updated the ' + name + ' roughly every ' + spanText(avg).replace(/^about /, '') + '.');
        const longest = Math.max.apply(null, gaps);
        if (gaps.length >= 2 && longest > avg * 1.25) out.push('The longest wait between ' + name + ' updates was ' + spanText(longest) + '.');
      }
    }
    if (product.discontinued && product.discontinued_date && releases.length) {
      out.push('The ' + name + ' was on sale for ' + spanText(daysBetweenIso(releases[0], product.discontinued_date)) + ' before Apple discontinued it on ' + longDate(product.discontinued_date) + '.');
    }
    const prev = product.previous_model ? (allProducts || []).find((p) => p.slug === product.previous_model) : null;
    if (prev && latest) {
      const prevDates = pastReleases(prev);
      const prevLatest = prevDates[prevDates.length - 1];
      if (prevLatest && prevLatest < latest) out.push('The ' + name + ' arrived ' + spanText(daysBetweenIso(prevLatest, latest)) + ' after the ' + prev.name + ' it replaces.');
      const mine = parsePrice(product.price);
      const theirs = parsePrice(prev.price);
      if (mine && theirs && mine.symbol === theirs.symbol && mine.value !== theirs.value) {
        const diff = Math.abs(mine.value - theirs.value);
        out.push('The ' + name + ' launched at ' + mine.symbol + mine.value + ', ' + mine.symbol + diff + (mine.value > theirs.value ? ' more' : ' less') + ' than the ' + prev.name + ' at ' + theirs.symbol + theirs.value + '.');
      }
    }
    if (latest) {
      const weekday = new Date(latest).toLocaleDateString('en-GB', { weekday: 'long' });
      out.push('The ' + name + ' was released on a ' + weekday + ', ' + longDate(latest) + '.');
    }
    return out.slice(0, 3);
  }

  function plainText(html) {
    return String(html || '').replace(/<\/p>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, '’')
      .replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();
  }

  // A "Did you know?" request about one product, avoiding facts already
  // used on any product page or published site-wide.
  function productFactPrompt(name, idea, allProducts, publishedTexts) {
    const topic = (name ? 'the Apple ' + name : '') + (idea ? (name ? ': ' : '') + idea : '');
    const used = (allProducts || []).map((p) => plainText(p.did_you_know).replace(/\s+/g, ' ')).filter(Boolean).concat(publishedTexts || []);
    return claudeResearchPrompt(topic, used);
  }

  // Notes for a product page, researched and cross-checked by Claude.
  function productNotesPrompt(product, idea, allProducts) {
    const releases = pastReleases(product);
    const prev = product.previous_model ? (allProducts || []).find((p) => p.slug === product.previous_model) : null;
    const known = [
      'Product: Apple ' + product.name + (product.category ? ' (' + product.category + ')' : ''),
      releases.length ? 'Release dates on record: ' + releases.map(longDate).join(', ') : '',
      product.discontinued && product.discontinued_date ? 'Discontinued: ' + longDate(product.discontinued_date) : 'Status: still on sale',
      prev ? 'It replaced: the ' + prev.name : '',
      product.rumor_note ? 'My current notes (improve or replace them):\n' + plainText(product.rumor_note) : '',
    ].filter(Boolean).join('\n');
    return [
      'I run Apple Sunset (applesunset.com), a site tracking how long it has been since each Apple product was refreshed or discontinued. Please write the short "Notes" section for this product\'s page.',
      '',
      known,
      idea ? '\nFocus on: ' + idea : '',
      '',
      'Please:',
      '1. Search the web for what matters most about this product: what was new or changed from the model it replaced, anything notable about it, and (if still on sale) what is known about what comes next.',
      '2. Check every statement against at least two independent, reliable sources (for example Apple Newsroom or press releases, Apple Support tech specs, major news outlets). Search again independently to confirm; don\'t rely on one site copying another.',
      '3. Double-check every date, number, price and name exactly. Leave out anything that isn\'t confirmed by two sources or that sources disagree on. Any rumour must be clearly labelled as a rumour, with who reported it and when.',
      '4. Also check the release dates I have on record above and tell me if any look wrong.',
      '5. Write 2 to 4 short paragraphs, under 120 words in total, in British English, plain and neutral (no "I" or "my"), ready to paste onto the page. No headings or bullet points.',
      '',
      'Reply with: the notes, then a list of sources as links, then anything you couldn\'t confirm or that I should double-check, then how confident you are and why.',
    ].join('\n').replace(/\n{3,}/g, '\n\n');
  }

  // --- The public Facts page (/facts/): statistics worked out from every
  // product, then each product's own "Did you know?". The build and the
  // page's live refresh both use this, so they always show the same.
  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function monthYear(iso) {
    const parts = String(iso).slice(0, 7).split('-').map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  function factsPageHtml(products, sanitize) {
    const list = products || [];
    const stats = list.length ? generateFactCandidates(list) : [];
    const withFacts = list
      .filter((p) => p.slug && plainText(p.did_you_know))
      .sort((a, b) => String(b.did_you_know_date || '').localeCompare(String(a.did_you_know_date || '')) || a.name.localeCompare(b.name));
    const statsHtml = stats.length
      ? '<section class="facts-section"><h2 class="facts-section-title">By the numbers</h2>' +
        '<p class="facts-section-note">Worked out from every product Apple Sunset tracks, and recalculated each time the site updates.</p>' +
        '<div class="facts-grid">' + stats.map((t) => '<div class="fact-card"><p class="fact-text">' + escapeHtml(t) + '</p></div>').join('') + '</div></section>'
      : '';
    const productHtml = withFacts.length
      ? '<section class="facts-section"><h2 class="facts-section-title">Did you know?</h2><div class="facts-grid">' +
        withFacts.map((p) => {
          const href = '/products/' + encodeURIComponent(p.slug) + '/';
          return '<article class="fact-card fact-card--product">' +
            '<a class="fact-product-name" href="' + href + '">' + escapeHtml(p.name) + '</a>' +
            '<div class="fact-text">' + sanitize(p.did_you_know) + '</div>' +
            (p.did_you_know_date ? '<p class="fact-date">As of ' + monthYear(p.did_you_know_date) + '</p>' : '') +
            '<a class="fact-more-link" href="' + href + '">More on the ' + escapeHtml(p.name) + ' &rarr;</a>' +
            '</article>';
        }).join('') + '</div></section>'
      : '';
    return statsHtml + productHtml;
  }

  const FactsKit = {
    factsPageHtml,
    productFactCandidates,
    productFactPrompt,
    productNotesPrompt,
    plainText,
    claudeResearchPrompt,
    claudeResearchUrl,
    factKey,
    factCardPath,
    factPageUrl,
    factCardExists,
    uploadFactCard,
    factPageLive,
    sameFact,
    buildTweetText,
    drawFactCanvas,
    generateFactImage,
    factImageFile,
    generateFactCandidates,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = FactsKit;
  if (typeof window !== 'undefined') window.FactsKit = FactsKit;
})();
