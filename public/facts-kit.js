// "Did you know?" facts, shared by the admin panel (admin.js) and the
// phone app (upload.js): working out fact candidates from product data,
// the tweet text, and the image card that goes with a tweet.
(function () {
  // The tweet links to the fact's own page (/facts/<id>/), whose preview
  // image is the fact's card, so X shows the card under the tweet.
  function buildTweetText(factText, link, products) {
    const lower = factText.toLowerCase();
    let emoji = '\ud83c\udf4e';
    const addTag = (keyword, tag, tagEmoji) => {
      if (lower.indexOf(keyword) !== -1 && tagEmoji) emoji = tagEmoji;
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
    // #Apple and the product's family (see hashtagsFor).
    const uniqueHashtags = hashtagsFor(factText, products);

    const hook = emoji + ' Apple Fact:';
    const footer = uniqueHashtags.join(' ') + '\n' + (link || window.location.host);
    let body = hook + ' ' + factText;
    let full = body + '\n\n' + footer;

    // Twitter's 280-char limit: trim the fact text itself (never the
    // hashtags or link) if the combined text runs over.
    // X counts any link as 23 characters, however long it is.
    const linkAllowance = link ? link.length - 23 : 0;
    if (full.length - linkAllowance > 280) {
      const trimmed = shortenToFit(factText, (t) => (hook + ' ' + t + '\n\n' + footer).length - linkAllowance <= 280);
      body = hook + ' ' + trimmed;
      full = body + '\n\n' + footer;
    }
    return full;
  }

  // The longest start of the text that passes fits(): whole sentences off
  // the end first, as long as a proper sentence or two is left; otherwise
  // cut at a word, with an ellipsis. Never mid-word.
  function shortenToFit(text, fits) {
    const t = String(text || '').trim();
    if (fits(t)) return t;
    const ends = [];
    const re = /[.!?]["'\u201d\u2019)]?(?=\s)/g;
    let m;
    while ((m = re.exec(t))) ends.push(m.index + m[0].length);
    for (let i = ends.length - 1; i >= 0; i--) {
      const kept = t.slice(0, ends[i]).trim();
      if (kept.length < 60) break;
      if (fits(kept)) return kept;
    }
    const words = t.split(/\s+/);
    while (words.length > 1) {
      words.pop();
      const cut = words.join(' ').replace(/[\s,;:.\u2013\u2014-]+$/, '') + '\u2026';
      if (fits(cut)) return cut;
    }
    return t;
  }

  // The line icons for each product family (40x40, drawn as strokes),
  // used by the site (src/templates.js) and the cards below.
  const CATEGORY_ICONS = {
    iPhone: `<rect x="13" y="4" width="14" height="32" rx="3"/><line x1="17" y1="31" x2="23" y2="31"/>`,
    Mac: `<rect x="8" y="9" width="24" height="16" rx="1.5"/><path d="M5 30h30l-2.5-3h-25z"/>`,
    iPad: `<rect x="7" y="8" width="26" height="24" rx="3"/><line x1="19" y1="27" x2="21" y2="27"/>`,
    'Apple Watch': `<rect x="12" y="10" width="16" height="20" rx="5"/><rect x="27.5" y="17" width="3" height="6" rx="1"/>`,
    AirPods: `<path d="M14 10c-3 0-5 2-5 5v9c0 2 1.5 3 3 3s3-1 3-3V13"/><path d="M26 10c3 0 5 2 5 5v9c0 2-1.5 3-3 3s-3-1-3-3V13"/>`,
    'Vision Pro': `<path d="M6 18c0-4 3-6 14-6s14 2 14 6-3 6-14 6S6 22 6 18z"/><circle cx="15" cy="18" r="2.5"/><circle cx="25" cy="18" r="2.5"/>`,
    'Apple TV': `<rect x="9" y="9" width="22" height="22" rx="4"/><text x="20" y="24" font-size="9" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">TV</text>`,
    AirTag: `<circle cx="20" cy="20" r="14"/><circle cx="20" cy="20" r="10.5"/>`,
    'Apple Pencil': `<path d="M17 6c0-1.5 1.3-2.5 3-2.5s3 1 3 2.5v22l-3 8-3-8V6z"/><line x1="20" y1="9" x2="20" y2="14"/>`,
    HomePod: `<path d="M9 17c0-6.5 5-10 11-10s11 3.5 11 10v5c0 7-5 11-11 11S9 29 9 22z"/><ellipse cx="20" cy="12" rx="6" ry="2"/>`,
    iPod: `<rect x="11" y="4" width="18" height="32" rx="3"/><rect x="14" y="7.5" width="12" height="10" rx="1.2"/><circle cx="20" cy="26.5" r="5"/><circle cx="20" cy="26.5" r="1.5"/>`,
    Other: `<rect x="8" y="8" width="24" height="24" rx="4"/>`,
  };

  // --- The 1200x675 "Did you know?" card, in the site's sunset colours
  // with the logo. ---

  // The site header's sunset gradient (styles.css .site-header-bg).
  const SUNSET = [[0, '#f5b942'], [0.3, '#e8752c'], [0.58, '#c8432f'], [0.82, '#7d2a4a'], [1, '#2e1a3d']];
  // Topic icons for cards that aren't about one product: the composer
  // offers them by name, and suggests one from the wording.
  const CARD_ICONS = {
    calendar: `<rect x="7" y="9" width="26" height="24" rx="3"/><path d="M7 16h26M14 6v6M26 6v6M13 22h3M19 22h3M25 22h3M13 27h3M19 27h3"/>`,
    clock: `<circle cx="20" cy="20" r="13"/><path d="M20 12v8l5 4"/>`,
    hourglass: `<path d="M12 6h16M12 34h16M14 6c0 8 12 8 12 14s-12 6-12 14M26 6c0 8-12 8-12 14s12 6 12 14"/>`,
    chart: `<path d="M7 33h26"/><rect x="10" y="21" width="5" height="12" rx="1"/><rect x="18" y="14" width="5" height="19" rx="1"/><rect x="26" y="8" width="5" height="25" rx="1"/>`,
    up: `<path d="M6 30l9-9 6 6 13-13"/><path d="M26 14h8v8"/>`,
    down: `<path d="M6 12l9 9 6-6 13 13"/><path d="M26 28h8v-8"/>`,
    money: `<circle cx="20" cy="20" r="13"/><path d="M24.5 14.5c-1-1.4-2.6-2-4.5-2-2.6 0-4.2 1.3-4.2 3.2 0 4.6 8.7 2.6 8.7 7.3 0 2-1.9 3.5-4.6 3.5-1.9 0-3.6-.7-4.6-2.2M20 9.5v3M20 26.5v3.5"/>`,
    tag: `<path d="M7 7h12l14 14-12 12L7 19z"/><circle cx="13.5" cy="13.5" r="2"/>`,
    invite: `<rect x="7" y="11" width="26" height="18" rx="2"/><path d="M7 13l13 9 13-9"/>`,
    megaphone: `<path d="M8 17v6h5l11 7V10l-11 7z"/><path d="M28 15a6 6 0 0 1 0 10M13 23l2 8h4l-2-7"/>`,
    rumour: `<path d="M8 9h24v16H18l-7 6v-6H8z"/><path d="M17.5 14.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M20 21.5v.5"/>`,
    eye: `<path d="M5 20s5-9 15-9 15 9 15 9-5 9-15 9S5 20 5 20z"/><circle cx="20" cy="20" r="4"/>`,
    box: `<path d="M20 6l13 6v16l-13 6-13-6V12z"/><path d="M7 12l13 6 13-6M20 18v16"/>`,
    store: `<path d="M7 15h26l-2-7H9z"/><path d="M9 15v17h22V15M17 32v-8h6v8"/>`,
    home: `<path d="M7 19L20 8l13 11"/><path d="M10 17v15h20V17M17 32v-8h6v8"/>`,
    rocket: `<path d="M20 5c5 4 7 10 6 17l-6 5-6-5c-1-7 1-13 6-17z"/><circle cx="20" cy="15" r="2.5"/><path d="M14 22l-4 4 2 5 4-3M26 22l4 4-2 5-4-3M18 30l2 5 2-5"/>`,
    sparkle: `<path d="M20 6l2.5 9.5L32 18l-9.5 2.5L20 30l-2.5-9.5L8 18l9.5-2.5z"/><path d="M31 6v5M28.5 8.5h5"/>`,
    star: `<path d="M20 7l3.9 8 8.8 1.2-6.4 6.1 1.6 8.7L20 26.8 12.1 31l1.6-8.7-6.4-6.1 8.8-1.2z"/>`,
    trophy: `<path d="M13 8h14v6a7 7 0 0 1-14 0z"/><path d="M13 10H8a5 5 0 0 0 5 6M27 10h5a5 5 0 0 1-5 6M20 21v6M15 32h10M17 27h6v5h-6z"/>`,
    fire: `<path d="M20 5c1 6 8 9 8 17a8 8 0 0 1-16 0c0-4 2-6 3-8 1 3 3 4 3 4 0-5 0-9 2-13z"/>`,
    heart: `<path d="M20 32S7 24 7 15a6.5 6.5 0 0 1 13-2 6.5 6.5 0 0 1 13 2c0 9-13 17-13 17z"/>`,
    refresh: `<path d="M31 17a11 11 0 0 0-20-4M9 23a11 11 0 0 0 20 4"/><path d="M11 7v6h6M29 33v-6h-6"/>`,
    warning: `<path d="M20 6l15 26H5z"/><path d="M20 15v8M20 27v.5"/>`,
    sunset: `<path d="M6 28h28M10 32h20"/><path d="M11 28a9 9 0 0 1 18 0"/><path d="M20 9v4M9 15l3 2.5M31 15l-3 2.5"/>`,
    chip: `<rect x="11" y="11" width="18" height="18" rx="2"/><rect x="16" y="16" width="8" height="8"/><path d="M15 6v5M20 6v5M25 6v5M15 29v5M20 29v5M25 29v5M6 15h5M6 20h5M6 25h5M29 15h5M29 20h5M29 25h5"/>`,
    battery: `<rect x="6" y="13" width="25" height="14" rx="2.5"/><path d="M34 18v4"/><rect x="9" y="16" width="12" height="8" rx="1"/>`,
    camera: `<path d="M7 13h6l2-3h10l2 3h6v17H7z"/><circle cx="20" cy="21" r="5"/>`,
    music: `<path d="M16 28V10l14-3v18"/><circle cx="12.5" cy="28" r="3.5"/><circle cx="26.5" cy="25" r="3.5"/>`,
    globe: `<circle cx="20" cy="20" r="13"/><path d="M7 20h26M20 7c4 4 4 22 0 26M20 7c-4 4-4 22 0 26"/>`,
    idea: `<path d="M16 30h8M17 34h6M20 6a9 9 0 0 0-5.3 16.3c.9.7 1.5 1.8 1.5 3V26h7.6v-.7c0-1.2.6-2.3 1.5-3A9 9 0 0 0 20 6z"/>`,
  };
  const CARD_ICON_NAMES = {
    calendar: 'Calendar', clock: 'Clock', hourglass: 'Hourglass', chart: 'Chart', up: 'Going up', down: 'Going down',
    money: 'Money', tag: 'Price tag', invite: 'Invitation', megaphone: 'Announcement', rumour: 'Rumour', eye: 'Spotted',
    box: 'Box', store: 'Store', home: 'Home', rocket: 'Launch', sparkle: 'New', star: 'Star', trophy: 'Record',
    fire: 'Hot', heart: 'Love', refresh: 'Refresh', warning: 'Warning', sunset: 'Sunset', chip: 'Chip',
    battery: 'Battery', camera: 'Camera', music: 'Music', globe: 'World', idea: 'Light bulb',
  };
  // Quick emoji for the card's icon (any other can be typed).
  const CARD_EMOJI = ['🍎', '📱', '💻', '⌚', '🎧', '📅', '⏳', '🎉', '🔥', '👀', '🤔', '💯', '🚀', '✨', '💌', '📦', '🏠', '🛍️', '💰', '📈', '📉', '⚠️', '🏆', '❤️', '🎵', '📷', '🔋', '🌅', '🗞️', '🤫'];
  const MONTHS_RE = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
  function suggestCardIcon(text) {
    const t = String(text || '');
    if (/\brumou?r|\breported(ly)?\b|\bleak|\bsources say\b|\bexpected to\b/i.test(t)) return 'rumour';
    if (/\bearnings\b|\brevenue\b|\bprofit\b|[$£€]\s?\d|\bbillion\b/i.test(t)) return 'money';
    if (/\bon this day\b|\banniversary\b|\bbirthday\b/i.test(t) || MONTHS_RE.test(t) || /\b(19[7-9]\d|20\d\d)\b/.test(t)) return 'calendar';
    if (/\binvit|\bkeynote\b|\bevent\b/i.test(t)) return 'invite';
    if (/\bdiscontinued\b|\bkilled\b|\bend of the line\b/i.test(t)) return 'warning';
    if (/\blongest\b|\brecord\b|\bmost\b|\bfirst ever\b/i.test(t)) return 'trophy';
    if (/\bprice\b|\bcosts?\b/i.test(t)) return 'tag';
    if (/\bsmart home\b|\bhome\b/i.test(t)) return 'home';
    if (/\bstores?\b/i.test(t)) return 'store';
    if (/%|\baverage\b|per ?cent|\btracked\b|\btracking\b/i.test(t)) return 'chart';
    if (/\blaunch|\breleased?\b|\bannounced?\b/i.test(t)) return 'rocket';
    if (/\bdays?\b|\bweeks?\b|\bwait/i.test(t)) return 'clock';
    return 'idea';
  }

  // The card icon picker in the X composers (admin and phone app): every
  // icon and quick emoji as a button, kept in step with the select (icon
  // by name, or "auto") and the emoji box (anything else).
  function mountIconPicker(box, select, emojiInput, onChange) {
    if (!box || box.dataset.ready) return;
    box.dataset.ready = '1';
    Object.keys(CARD_ICONS).forEach((key) => {
      if (![...select.options].some((o) => o.value === key)) select.add(new Option(CARD_ICON_NAMES[key], key));
    });
    const make = (value, inner, label, isEmoji) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-pick' + (isEmoji ? ' icon-pick--emoji' : '');
      btn.dataset.value = value;
      btn.title = label;
      btn.setAttribute('aria-label', label);
      btn.innerHTML = inner;
      btn.addEventListener('click', () => {
        if (isEmoji) { select.value = 'auto'; emojiInput.value = value; }
        else { select.value = value; emojiInput.value = ''; }
        mark();
        onChange();
      });
      box.appendChild(btn);
      return btn;
    };
    const svg = (shape) => '<svg viewBox="0 0 40 40" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + shape + '</svg>';
    const auto = make('auto', '<span class="icon-pick-auto">Auto</span>', 'Automatic', false);
    Object.keys(CARD_ICONS).forEach((key) => make(key, svg(CARD_ICONS[key]), CARD_ICON_NAMES[key], false));
    CARD_EMOJI.forEach((e) => make(e, e, 'Emoji ' + e, true));
    function mark() {
      const emoji = emojiInput.value.trim();
      [...box.children].forEach((b) => b.classList.toggle('is-picked', emoji ? b.dataset.value === emoji : b.dataset.value === select.value));
    }
    box.markPicked = mark;
    box.autoButton = auto;
    emojiInput.addEventListener('input', () => { if (emojiInput.value.trim()) select.value = 'auto'; mark(); });
    select.addEventListener('change', mark);
    mark();
  }


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

  // Wraps to maxWidth, keeping the writer's own line breaks: each line
  // typed (a list item, say) starts a new line. lines.starts holds the
  // index of each typed line's first wrapped line, for the gap between.
  function wrapLines(ctx, text, maxWidth) {
    const lines = [];
    lines.starts = [];
    String(text || '').split(/\n/).forEach((para) => {
      const words = para.split(/[ \t\r]+/).filter(Boolean);
      if (!words.length) return;
      lines.starts.push(lines.length);
      let line = '';
      words.forEach((word) => {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      });
      if (line) lines.push(line);
    });
    return lines;
  }

  // Apple's own spelling for product and category names (used by the
  // site via src/templates.js, and on the cards).
  const APPLE_WORDS = [
    [/\bairpods\b/gi, 'AirPods'], [/\bairtag(s?)\b/gi, 'AirTag$1'], [/\bimac\b/gi, 'iMac'], [/\bmacbook\b/gi, 'MacBook'],
    [/\bhomepod\b/gi, 'HomePod'], [/\biphone\b/gi, 'iPhone'], [/\bipad\b/gi, 'iPad'], [/\bipod\b/gi, 'iPod'],
    [/\bmac\b/gi, 'Mac'], [/\bapple watch\b/gi, 'Apple Watch'], [/\bapple\b/gi, 'Apple'], [/\bpro\b/gi, 'Pro'], [/\bmax\b/gi, 'Max'], [/\bultra\b/gi, 'Ultra'],
    [/\bair\b/gi, 'Air'], [/\bse\b/gi, 'SE'], [/\btv\b/gi, 'TV'], [/\bhi-?fi\b/gi, (m) => (m.indexOf('-') !== -1 ? 'Hi-Fi' : 'HiFi')],
    // "mini" is lower case after Mac, iPad, HomePod and iPhone (iPhone 13 mini).
    [/\b(Mac|iPad|HomePod|iPhone(?: \d+)?) mini\b/gi, (m, what) => what + ' mini'],
  ];
  function appleName(name) {
    if (name == null) return name;
    return APPLE_WORDS.reduce((s, [re, to]) => s.replace(re, to), String(name));
  }

  // --- What the card shows. The post's text already says the fact, so
  // the card shows its subject instead: the product with its icon and
  // one live figure, or the statistic's key number, never the sentence.

  let cardProducts = [];
  let cardProductsLoader = null;
  let cardProductsLoading = null;
  // admin and the phone app pass a loader; the products are fetched once.
  function setCardProductsLoader(fn) { cardProductsLoader = fn; }
  function setCardProducts(list) { cardProducts = list || []; }
  // Family icons uploaded in admin (category_icons), which win over the
  // built-in shapes, as on the site.
  let cardCategoryIcons = {};
  function setCardCategoryIcons(map) { cardCategoryIcons = map || {}; }
  function customCategoryIcon(category) {
    const key = Object.keys(cardCategoryIcons).find((k) => k.toLowerCase() === String(category || '').toLowerCase());
    return key ? cardCategoryIcons[key] : null;
  }
  // Runs the loader once (it also brings the family icons), even when
  // the products were already handed over with setCardProducts.
  async function ensureCardProducts() {
    if (!cardProductsLoader) return cardProducts;
    if (!cardProductsLoading) {
      cardProductsLoading = Promise.resolve(cardProductsLoader())
        .then((list) => { if (list && list.length) cardProducts = list; })
        .catch(() => {});
    }
    await cardProductsLoading;
    return cardProducts;
  }

  function iconShapeFor(category) {
    const key = Object.keys(CATEGORY_ICONS).find((k) => k.toLowerCase() === String(category || '').toLowerCase());
    return key ? CATEGORY_ICONS[key] : null;
  }

  // A family named in the text (longest name wins), for a statistic's icon.
  function categoryNamed(text) {
    const hay = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
    return Object.keys(CATEGORY_ICONS).filter((k) => k !== 'Other' && hay.indexOf(' ' + k.toLowerCase() + ' ') !== -1)
      .sort((a, b) => b.length - a.length)[0] || null;
  }

  function cardDate(iso) {
    const p = String(iso).split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] || 1)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  function cardSpanText(fromIso, toIso) {
    const months = Math.round((new Date(toIso) - new Date(fromIso)) / (86400000 * 30.44));
    if (months < 24) return months + ' month' + (months === 1 ? '' : 's');
    const years = Math.round(months / 12);
    return 'about ' + years + ' years';
  }

  // One live figure for a product: days since its last release, days
  // until a coming release, or the year it was discontinued.
  function productFigure(p) {
    const today = new Date().toISOString().slice(0, 10);
    const releases = pastReleases(p);
    const first = p.original_launch_date || releases[0] || null;
    const future = (p.refresh_history || []).filter((d) => d > today).sort()[0];
    if (p.discontinued && p.discontinued_date) {
      return { kind: 'gone', big: p.discontinued_date.slice(0, 4), caption: 'the year it was discontinued' + (first ? ', after ' + cardSpanText(first, p.discontinued_date) + ' on sale' : ''), sub: first ? 'First released ' + cardDate(first) : '' };
    }
    if (future) {
      const days = Math.max(0, Math.round((new Date(future) - new Date(today)) / 86400000));
      return { kind: 'coming', big: days.toLocaleString('en-GB'), caption: (days === 1 ? 'day' : 'days') + ' until it arrives', sub: 'Coming ' + cardDate(future) };
    }
    if (releases.length) {
      const last = releases[releases.length - 1];
      const days = Math.round((new Date(today) - new Date(last)) / 86400000);
      return {
        kind: 'since',
        big: days.toLocaleString('en-GB'),
        caption: (days === 1 ? 'day' : 'days') + ' since its last release',
        sub: releases.length === 1 ? 'Only release: ' + cardDate(last) : releases.length + ' releases since ' + releases[0].slice(0, 4),
      };
    }
    return { kind: '', big: '', caption: '', sub: '' };
  }

  // Whether a post is about what the product's live figure says, so the
  // card can show it ("discontinued 2023" only on a post about it ending).
  const FIGURE_TOPICS = {
    gone: /discontinu|retired|axed|dropped|replaced|end of (the )?line|no longer (sold|on sale)|killed off|lifespan|on sale for/i,
    coming: /coming|arriv|launch|pre-?order|on sale (from|on)|countdown|days? (until|to go)|release date/i,
    since: /\bdays? since\b|refresh|since (its|the|it was) (last|launch|release)|waiting|overdue|last (release|update)|still on sale|unchanged|has(n.?t| not) (been )?(updated|refreshed|changed)/i,
  };

  const MONTH_NAMES = '(?:january|february|march|april|may|june|july|august|september|october|november|december)';
  // "8 October 2014", "October 8" or "October 8, 2014".
  const DATE_RE = new RegExp('\\b(?:\\d{1,2}(?:st|nd|rd|th)?\\s+' + MONTH_NAMES + '|' + MONTH_NAMES + '\\s+\\d{1,2}(?:st|nd|rd|th)?\\b)(?:,?\\s+(?:19|20)\\d\\d)?\\b', 'i');

  // A card headline never ends in a comma, full stop or other punctuation.
  function cardHeadline(text) {
    return String(text || '').trim().replace(/[\s,.;:!?\u2013\u2014-]+$/, '');
  }

  // Links say nothing the card should show: a date in a MacRumors
  // address ("/2026/10/18/") was being read as the card's big figure.
  // Nor do @names: "via @9to5mac" was becoming a headline of "9".
  const withoutLinks = (text) => String(text || '').replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(^|\s)(?:via\s+)?@\w+/gi, ' ').replace(/[ \t]+/g, ' ').trim();

  // A post that is a list ("Coming up 📅" then a line per date): its
  // items, one per line, without the opening line or a closing question.
  const ITEM_RE = /^(?:[-*\u2022\u25aa\u2013]\s|\d{1,2}[.)]\s|\p{Extended_Pictographic}|\d{1,2}\s+[A-Za-z]{3,})/u;
  function listItems(text) {
    const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const items = lines.filter((l) => ITEM_RE.test(l) && !/^#/.test(l));
    return items.length >= 2 ? items : null;
  }

  // --- Reading a post for its card. The post is read a sentence at a
  // time and the card is about one of them, the focus: the news when
  // there is some ("goes on sale today"), otherwise the sentence with
  // the most to show, usually the first. The title, headline and line
  // all come from that one sentence, so a card never names one product
  // and shows a figure about another. The heading at the top says what
  // kind of post it is: On this day, Launch day, Rumour and so on.

  const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}][\uFE0F\u200D\u20E3\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}]*/gu;
  const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const capFirst = (s) => String(s || '').replace(/^(\W*)(\w)/, (m, p, c) => p + c.toUpperCase());
  const blankOut = (str) => str.replace(/[^\s]/g, ' ');
  const wordsIn = (s) => String(s || '').match(/[A-Za-z0-9\u00c0-\u024f'\u2019$\u00a3\u20ac%]+/g) || [];

  // The post as the card reads it: no links, @names, emoji or hashtags,
  // and its opening tag ("Did you know?", "Big news:") taken off and kept
  // as the card's heading.
  const OPENERS = [
    [/^did you know\b\s*(?:[?:!,.]\s*|that\s+|(?=[a-z]))/i, 'Did you know?'],
    [/^it['\u2019]s official\s*[:!.\u2013\u2014-]\s*/i, 'It\u2019s official'],
    [/^(?:fun|quick|apple) fact\s*[:!.\u2013\u2014-]\s*/i, null],
    [/^(?:big|huge|good|sad) news\s*[:!.\u2013\u2014-]\s*/i, null],
    [/^breaking(?: news)?\s*[:!.\u2013\u2014-]\s*/i, 'Breaking'],
    [/^just in\s*[:!.\u2013\u2014-]\s*/i, 'Just in'],
    [/^(?:reminder|heads up|psa)\s*[:!.\u2013\u2014-]\s*/i, null],
    [/^rumou?r(?: has it)?\s*[:!.\u2013\u2014-]\s*/i, 'Rumour'],
    [/^(?:throwback|flashback)(?: \w+day)?\s*[:!.\u2013\u2014-]\s*/i, 'Throwback'],
    [/^(?:poll|quick question|question)\s*[:!.\u2013\u2014-]\s*/i, 'Over to you'],
    [/^(?:hot take|unpopular opinion)\s*[:!.\u2013\u2014-]\s*/i, null],
  ];
  function cardSource(text) {
    let t = withoutLinks(text)
      .replace(EMOJI_RE, ' ')
      .replace(/(?:^|\s)(?:#\w+[ \t]*)+$/g, ' ')
      .replace(/(^|\s)#([A-Za-z]\w*)/g, '$1$2')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .trim();
    let opener = '';
    OPENERS.some(([re, label]) => {
      const m = t.match(re);
      if (!m) return false;
      opener = label || capFirst(m[0].replace(/[\s:!.\u2013\u2014-]+$/, '').toLowerCase());
      const asked = /^did you know\s*(?:that\s+|[a-z])/i.test(m[0]) || /^did you know\s+(?=[a-z])/i.test(t);
      t = capFirst(t.slice(m[0].length));
      if (asked) t = t.replace(/^([^?\n]*)\?/, '$1.');
      return true;
    });
    return { text: t, opener };
  }

  // Sentences, keeping "4.5mm", "$102.5bn" and "U.S." whole.
  function splitSentences(text) {
    const out = [];
    String(text || '').split(/\n+/).forEach((para) => {
      let start = 0;
      const re = /[.!?\u2026]+["\u201d\u2019')\]]*(?=\s+["\u201c\u2018(]?[A-Z0-9$\u00a3\u20ac])/g;
      let m;
      while ((m = re.exec(para))) {
        const before = para.slice(start, m.index);
        if (/(?:^|\s)(?:vs|mr|mrs|ms|dr|st|inc|ltd|approx|no|e\.g|i\.e|u\.s|u\.k)$/i.test(before)) continue;
        out.push(para.slice(start, m.index + m[0].length).trim());
        start = m.index + m[0].length;
      }
      if (para.slice(start).trim()) out.push(para.slice(start).trim());
    });
    return out.filter((s) => /[A-Za-z0-9]/.test(s));
  }

  // The products a sentence names, in order: a name matches whatever its
  // spacing or punctuation ("iPod Hi-Fi" matches "iPod HiFi"), and of
  // names starting at the same place the longest wins ("iPhone 17 Pro"
  // over "iPhone 17").
  const nameRes = new Map();
  function productNameRe(name) {
    const key = String(name || '');
    if (!nameRes.has(key)) {
      const tokens = key.toLowerCase().match(/[a-z0-9]+/g) || [];
      nameRes.set(key, tokens.length ? new RegExp('(?<![a-z0-9])' + tokens.map(escRe).join('[^a-z0-9\\n]{0,2}') + '(?:s|\u2019s|\'s)?(?![a-z0-9])', 'gi') : null);
    }
    return nameRes.get(key);
  }
  function productsIn(s) {
    const found = [];
    (cardProducts || []).forEach((p) => {
      const name = String((p && p.name) || '');
      if (name.replace(/[^a-z0-9]/gi, '').length <= 2) return;
      const re = productNameRe(name);
      if (!re) return;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(s))) found.push({ p, index: m.index, end: m.index + m[0].length, text: m[0] });
    });
    found.sort((a, b) => a.index - b.index || (b.end - b.index) - (a.end - a.index));
    const kept = [];
    found.forEach((f) => { if (!kept.some((k) => f.index < k.end && f.end > k.index)) kept.push(f); });
    return kept;
  }

  // Product families named in general ("the original iPod", "iPhones",
  // "the iPhone 7"), for a card's title and icon when no product on the
  // site is named.
  const FAMILY_WORDS = [
    ['Apple Watch', 'apple\\s?watch(?:es)?'], ['Apple TV', 'apple\\s?tv'], ['Apple Pencil', 'apple\\s?pencils?'], ['Vision Pro', 'vision\\s?pro'],
    ['AirPods', 'airpods'], ['AirTag', 'airtags?'], ['HomePod', 'homepods?'], ['iPhone', 'iphones?'], ['iPad', 'ipads?'], ['iPod', 'ipods?'],
    ['Mac', 'macbooks?|imacs?|macintosh(?:es)?|macs?'],
  ];
  const FAMILY_RE = new RegExp('(?<![a-z0-9])(?:' + FAMILY_WORDS.map(([, re]) => '(' + re + ')').join('|') + ')(?![a-z0-9])', 'gi');
  const MODEL_AFTER = /^\s(?:(?:\d{1,2}[a-z]?|X[SR]?|SE|Series\s\d{1,2})(?![\d,a-z])(?:\s(?:Pro|Plus|Max|mini|Ultra|Air|e))*|(?:Pro|Plus|Max|mini|Ultra|Air|nano|shuffle|touch|classic|Studio)(?![a-z])(?:\s(?:Max|mini|\d{1,2}))*)/i;
  function familiesIn(s) {
    const out = [];
    FAMILY_RE.lastIndex = 0;
    let m;
    while ((m = FAMILY_RE.exec(s))) {
      const i = m.slice(1).findIndex(Boolean);
      const family = FAMILY_WORDS[i][0];
      let word = /^airpods$/i.test(m[0]) ? 'AirPods' : m[0].replace(/(watch|macintosh)es$/i, '$1').replace(/s$/i, '');
      word = /^macintosh$/i.test(word) ? 'Macintosh' : appleName(word.toLowerCase());
      const after = s.slice(m.index + m[0].length);
      const model = m[0] === word || /^airpods$/i.test(m[0]) ? after.match(MODEL_AFTER) : null;
      const before = s.slice(0, m.index);
      const original = /\b(?:the\s+)?(?:original|first|very first)\s+$/i.test(before) && !model;
      const end = m.index + m[0].length + (model ? model[0].length : 0);
      const title = original ? 'Original ' + word : model ? appleName(word + model[0]) : word;
      out.push({ family, index: m.index, end, text: s.slice(m.index, end), title, original });
    }
    return out;
  }

  // Apple's software by version ("iOS 27"), which is a name, not a figure.
  const SOFTWARE_RE = /(?<![a-z0-9])(?:iOS|iPadOS|macOS|watchOS|tvOS|visionOS)\s?\d{1,2}(?:\.\d{1,2})*(?![\d])/gi;

  // Numbers that are part of a name, not a figure: products, "iPhone 7",
  // "iOS 27", "M5", "Q4", "4th generation", a "20th-anniversary iPhone".
  function maskNames(s, spans) {
    let out = s;
    spans.forEach((f) => { out = out.slice(0, f.index) + blankOut(out.slice(f.index, f.end)) + out.slice(f.end); });
    return out
      .replace(SOFTWARE_RE, blankOut)
      .replace(/\b(?:iPhone|iPad|iPod|iMac|Mac|MacBook|AirPods|HomePod|Watch|Series|Gen|Wi-?Fi|USB|Bluetooth|CarPlay|Siri)\s?\d{1,2}(?:\.\d)?[a-z]{0,2}\b/gi, blankOut)
      .replace(/\b[MASHUR]\d{1,2}(?:\s(?:Pro|Max|Ultra|Bionic))?\b/g, blankOut)
      .replace(/\bQ[1-4]\b|\b[2-6]G\b|\bFY\s?\d{2,4}\b/g, blankOut)
      .replace(/\b\d{1,2}(?:st|nd|rd|th)[\s-]+gen(?:eration)?\b/gi, blankOut)
      .replace(/\b\d{1,3}(?:st|nd|rd|th)-\w+/gi, blankOut);
  }

  // A sentence's figures, with how much each would say as the card's big
  // headline: a price or a percentage most, then a span of time, a
  // measurement or a big count, then dates, times and bare years.
  const NUM = '\\d[\\d,]*(?:\\.\\d+)?';
  const SCALE = '(?:\\s?(?:bn|billion|million|trillion|tn|m|k)(?![a-z]))';
  const FIGURE_RE = new RegExp([
    '(?<ord>\\d{1,3}(?:st|nd|rd|th)\\s+(?:birthday|anniversary))',
    '(?<money>[$\u00a3\u20ac]\\s?' + NUM + SCALE + '?)',
    '(?<pct>' + NUM + '\\s?(?:%|per\\s?cent(?![a-z])|percent(?![a-z])))',
    '(?<date>' + DATE_RE.source + '|\\b' + MONTH_NAMES + '\\s+(?:19|20)\\d\\d\\b)',
    '(?<span>(?:' + NUM + '|\\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty)(?=\\s))\\s(?:days?|weeks?|months?|years?|decades?)(?![a-z])(?:\\s(?:ago|later)(?![a-z])|\\son(?=\\s*[,.;:!?]|$))?)',
    '(?<inch>' + NUM + '-inch(?:es)?(?![a-z]))',
    '(?<measure>' + NUM + '\\s?(?:GB|TB|MB|KB|mAh|mm|cm|kg|g|lbs?|inch(?:es)?|"|\u201d|hours?|hrs?|minutes?|mins?|seconds?|nits|Hz|fps|MP|megapixels?|W|watts?|mph|cores?|x|times)(?![a-z]))',
    '(?<time>\\d{1,2}(?::\\d{2})?\\s?(?:am|pm)(?![a-z])|\\b\\d{1,2}:\\d{2}(?!\\d))',
    '(?<when>\\b(?:(?:this|next)\\s)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight)(?:\\s(?:at|from)\\s\\d{1,2}(?::\\d{2})?\\s?(?:am|pm))?(?![a-z])|\\bnext\\s(?:week|month|year)\\b|\\blater\\sthis\\s(?:week|month|year)\\b|\\bthis\\s(?:week|weekend|month)\\b)',
    '(?<year>(?<![\\d,.$\u00a3\u20ac])(?:19[7-9]\\d|20\\d\\d)(?![\\d,]))',
    '(?<count>(?<![\\d.])' + NUM + SCALE + '?)',
  ].join('|'), 'gi');
  const QUALIFIER_RE = /(?:^|\s)((?:(?:up to|more than|over|nearly|almost|under|less than|at least|from|just|only|about|around|roughly|approximately|exactly|some|every|a whopping|a record)\s+){1,2})$/i;
  const COUNT_NOUN_STOP = /^(?:as|has|was|is|its|this|his|plus|us|yes|less|across|unless|thus|does|goes|takes|makes|gets|hits|sits|runs|means|lets|this|these|those|years?|days?)$/i;
  const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50 };

  function figuresIn(s, masked) {
    const out = [];
    FIGURE_RE.lastIndex = 0;
    let m;
    while ((m = FIGURE_RE.exec(masked))) {
      if (!m[0].trim()) { FIGURE_RE.lastIndex++; continue; }
      const kind = Object.keys(m.groups).find((k) => m.groups[k] !== undefined);
      let index = m.index;
      let end = m.index + m[0].length;
      let raw = s.slice(index, end);
      let score = { money: 5, pct: 5, ord: 4, span: 4, measure: 4, inch: 3, date: 2, when: 2, time: 1, year: 1, count: 2 }[kind];
      let big = raw.replace(/,(?=\s)/g, '').replace(/\s?per\s?cent|\s?percent/i, '%');
      const qm = masked.slice(0, index).match(QUALIFIER_RE);
      const quals = qm ? qm[1].trim().toLowerCase().split(/\s+(?=up to|more than|over|nearly|almost|under|less than|at least|from|just|only|about|around|roughly|approximately|exactly|some|every|a whopping|a record)/) : [];
      let link = false;
      if (kind === 'span') {
        if (/\s(?:later|on)$/i.test(raw)) link = true;
        if (!/\sago$/i.test(raw)) big = big.replace(/\s(?:later|on)$/i, '');
      }
      // "a 20th anniversary iPhone" names a model; "25th birthday" is the news.
      if (kind === 'ord' && /^\s+(?:edition\s+)?(?:i[A-Z]|Mac|Apple|AirPods|HomePod|Vision)/.test(s.slice(end))) score = 0;
      if (kind === 'count') {
        const n = Number(raw.replace(/[^\d.]/g, ''));
        if (/[a-z]/i.test(raw)) score = 4;
        else if (n >= 1000) score = 3;
        // "1,000 songs", "64 Apple products": the count with what it counts.
        const noun = s.slice(end).match(/^\s((?:Apple\s)?[a-z][a-z-]{2,}s)(?![a-z])/);
        if (noun && !COUNT_NOUN_STOP.test(noun[1])) { big += ' ' + noun[1]; end += noun[0].length; score += 1; }
      }
      if (kind === 'date') {
        const at = masked.slice(end).match(/^\s(?:at|from)\s(\d{1,2}(?::\d{2})?\s?(?:am|pm))(?![a-z])/i);
        if (at) { big = big + ', ' + at[1].replace(/\s/g, ''); end += at[0].length; }
      }
      if (kind === 'when') {
        big = /day\b|tomorrow|tonight/i.test(raw) ? capFirst(raw.replace(/^(?:this|next)\s(?=[a-z]+day\b)/i, '').replace(/\s(?:at|from)\s/i, ', ')) : capFirst(raw);
      }
      if (kind === 'measure') big = big.replace(/\s?(GB|TB|MB|KB|mAh|mm|cm|kg|g|lbs?)$/i, (u) => u.trim());
      if (kind === 'span') big = capFirst(big);
      // Qualifiers that change the meaning stay ("Up to 40%", "3 billion+",
      // "Every 365 days", "From £1,099"); the rest go.
      let qualText = '';
      quals.forEach((q) => {
        if (/^(?:just|only|a whopping|a record)$/.test(q)) score += 1;
        if (/^(?:more than|over|at least)$/.test(q) && kind !== 'date' && kind !== 'year') big = big.replace(/^([$\u00a3\u20ac]?[\d,.]+(?:\s?(?:bn|billion|million|trillion|tn|m|k))?)/i, '$1+');
        else if (/^(?:up to|nearly|almost|under|less than|from|every)$/.test(q) && kind !== 'date' && kind !== 'year') qualText = qualText ? qualText : q;
      });
      if (quals.length) index -= qm[1].length;
      if (qualText) big = capFirst(qualText) + ' ' + big;
      out.push({ kind, index, end, start: m.index, raw: s.slice(m.index, end), big: cardHeadline(big), score, link });
    }
    // "On this day in 2001", "25 years ago today", "Today marks 10 years":
    // the post's own date is its headline.
    const opener = s.match(/^(?:on this day(?: back)?(?: in)?|today in apple history[,:]?(?: in)?)\s+((?:19|20)\d\d)\b/i) ||
      s.match(/^(?:exactly\s+)?(\d+\s(?:years?|months?))\sago\s+today\b/i) ||
      s.match(/^(?:today|this week|this month)\s+marks\s+(?:exactly\s+)?(\d+\s(?:years?|months?))\b/i);
    if (opener) {
      const at = s.indexOf(opener[1], opener.index);
      const f = out.find((x) => x.start === at);
      if (f) { f.score = 9; f.opener = true; if (/ago\s+today/i.test(opener[0])) f.big = cardHeadline(opener[1] + ' ago'); }
    }
    return out;
  }

  // Words that tell what kind of post it is, and the news it carries.
  const STATUS = [
    [/\b(?:(?:goes|go|went|is|are)\s+)?on\s+sale\s+(today|now)\b/i, 'sale', (m) => 'On sale ' + m[1].toLowerCase()],
    [/\b(?:(?:is|are)\s+)?(?:out|here|available)\s+(today|now)\b/i, 'sale', (m) => 'Out ' + m[1].toLowerCase()],
    [/\b(?:(?:is|are)\s+)?now\s+available\s+to\s+pre-?order\b/i, 'preorder', () => 'Open now'],
    [/\b(?:(?:is|are)\s+)?now\s+(?:available|on\s+sale)(?:\s+to\s+order)?\b/i, 'sale', (m) => (/order/i.test(m[0]) ? 'Order now' : 'Out now')],
    [/\b(?:is|are)\s+(?:finally\s+|officially\s+)?(?:here|out)(?=\s*[.!,]|\s*$)/i, 'sale', () => 'Out now'],
    [/\b(?:arrives?|arrived|lands?|launch(?:es|ed)?|ships?|debuts?|hits\s+(?:stores|shelves)|(?:is|are)\s+released)\s+today\b/i, 'sale', () => 'Out today'],
    [/(?<!\bago\s)\btoday,?\s+(?:[^.,;!?]{0,60}?\s)?(?:arrives|lands|launches|goes\s+on\s+sale|ships|debuts|hits\s+stores)\b/i, 'sale', () => 'Out today'],
    [/\bpre-?orders?\s+(?:are\s+)?(?:now\s+)?(?:open(?:ed)?|live)(?:\s+(?:today|now))?(?=\s*[.!]|\s*$|\s+(?:for|in|at\s+apple))/i, 'preorder', () => 'Open now'],
    [/\b(?:has|have)\s+(?:now\s+|just\s+|quietly\s+|officially\s+|finally\s+)?(?:discontinued|killed(?:\s+off)?|axed|retired)\b|\bdiscontinued\s+today\b|\b(?:is|are)\s+no\s+longer\s+(?:sold|on\s+sale|available)\b|\b(?:is|are)\s+(?:officially\s+)?dead\b/i, 'gone', () => 'Discontinued'],
    [/\b(?:just|today)\s+(?:got\s+)?(?:updated|refreshed)\b|\b(?:updated|refreshed)\s+today\b|\b(?:finally\s+)?(?:gets?|got)\s+(?:an?\s+|its\s+first\s+)?(?:update|refresh)\s+today\b/i, 'updated', () => 'Out today'],
    [/\b(?:just|today)\s+(?:announced|unveiled|revealed|launched|introduced)\b|\b(?:announced|unveiled|revealed|introduced)\s+today\b|\bapple\s+(?:announces|unveils|reveals|introduces)\b|\b(?:has|have)\s+(?:just\s+)?(?:announced|unveiled|revealed)\b/i, 'announce', () => ''],
    [/\bpre-?orders?\b/i, 'preorder-soon', () => ''],
    [/\b\d[\d,]*\s(?:days?|weeks?)\s(?:to\s+go|until|till)\b|\bcountdown\b|\bcoming\s+(?:soon|next|later|this)\b|\b(?:arrives?|launch(?:es)?|lands?|ships?|comes?\s+out)\s+(?:next|later|on|in|this|tomorrow|from)\b|(?<!\b(?:went|was|were|been)\s)\bon\s+sale\s+(?:from|on)\b|\bgoes\s+on\s+sale\s+(?:on|this|next|in|from|tomorrow)\b/i, 'coming', () => ''],
  ];
  const EVENT_RE = /\b(?:apple\s+)?(?:event|keynote|wwdc)\b/i;
  const STATUS_LABELS = { sale: 'Launch day', preorder: 'Pre-orders', 'preorder-soon': 'Pre-orders', gone: 'End of the line', updated: 'Just updated', announce: 'Just announced', coming: 'Coming soon' };
  function statusIn(s) {
    for (const [re, kind, headline] of STATUS) {
      const m = s.match(re);
      if (m) return { kind, now: !/soon|coming|announce/.test(kind), headline: headline(m), index: m.index, end: m.index + m[0].length, text: m[0] };
    }
    return null;
  }
  const ON_THIS_DAY_RE = /^(?:on this day\b|today in apple history|(?:exactly\s+)?\d+\s+years?\s+ago\s+today|(?:today|this week)\s+marks\s+(?:exactly\s+)?\d+\s+years|happy\s+\d+(?:st|nd|rd|th)\s+(?:birthday|anniversary))|\b(?:happy|turns|celebrates|marks)\s+(?:its\s+)?\d+(?:st|nd|rd|th)\s+(?:birthday|anniversary)\b|\b\d+(?:st|nd|rd|th)\s+(?:birthday|anniversary)\s+today\b|\bturns\s+\d+\s+today\b|\byears?\s+ago\s+today\b/i;
  const RUMOUR_RE = /\brumou?r|\breported(?:ly)?\b|\bleak(?:s|ed)?\b|\bsources?\s+say\b|\bexpected\s+to\b|\baccording\s+to\s+(?:a\s+)?(?:new\s+)?(?:report|analyst|sources?|leaker)\b|\bsaid\s+to\s+be\b|\bis\s+working\s+on\b|\bplanning\s+(?:a|an|to)\b/i;
  const WAITING_RE = /\bsince\s+(?:apple\s+)?(?:last\s+)?(?:updated|refreshed)\b|\bstill\s+waiting\b|\bwithout\s+an?\s+(?:update|refresh)\b|\bha(?:s|ve)n['\u2019]?t\s+(?:been\s+)?(?:updated|refreshed)|\bha(?:s|ve)\s+not\s+(?:been\s+)?(?:updated|refreshed)|\bsince\s+(?:its|the)\s+last\s+(?:update|refresh|release)\b|\bwait(?:ing)?\s+for\s+an?\s+(?:update|refresh)\b/i;
  const EARNINGS_RE = /\b(?:earnings|revenue|quarterly\s+results|profits?)\b/i;

  // Words that say nothing on their own, for telling whether a sentence
  // has anything left to say once its title and headline are taken out.
  const FILLER_WORDS = /^(?:the|a|an|is|are|was|were|be|been|it|its|it's|it\u2019s|this|that|these|those|to|of|for|on|in|at|and|or|but|with|from|by|as|so|today|now|just|finally|happy|yes|wow|here|there|has|have|had|also|still|officially|quietly|exactly|again|apple|apple's|apple\u2019s)$/i;
  function contentLeft(s, spans) {
    let rest = s;
    spans.filter(Boolean).sort((a, b) => b.index - a.index).forEach((sp) => { rest = rest.slice(0, sp.index) + ' ' + rest.slice(sp.end); });
    return wordsIn(rest).filter((w) => !FILLER_WORDS.test(w));
  }

  function readSentence(s, i) {
    const products = productsIn(s);
    const families = familiesIn(s).filter((f) => !products.some((p) => f.index < p.end && f.end > p.index));
    SOFTWARE_RE.lastIndex = 0;
    const software = [...s.matchAll(SOFTWARE_RE)].map((m) => ({ index: m.index, end: m.index + m[0].length, title: m[0].replace(/\s+/, ' ') }));
    // A screen size naming a model ("the 13-inch MacBook Pro") is part of its name.
    products.concat(families).forEach((m) => {
      const size = s.slice(0, m.index).match(/(\d{1,2}(?:\.\d)?-inch)\s+$/i);
      if (size) { m.index -= size[0].length; m.size = size[1]; m.text = s.slice(m.index, m.end); }
    });
    const masked = maskNames(s, products.concat(families.filter((f) => f.text !== f.title.replace(/^Original /, '') || /\d/.test(f.text) || f.size)));
    const figures = figuresIn(s, masked).filter((f) => !f.link);
    const links = figuresIn(s, masked).filter((f) => f.link);
    const status = statusIn(s);
    const question = /\?["\u201d\u2019')]*\s*$/.test(s);
    return { text: s, i, products, families, software, figures, links, status, question };
  }

  // The card's title: the product the sentence names (or the two it
  // compares), else Apple software by version, else a product family.
  function titleOf(r) {
    const [a, b] = r.products;
    if (a && b && a.p !== b.p && /^\W*(?:or|vs\.?|versus|than|compared\s+(?:to|with)|against|and)\s+(?:the\s+|an?\s+)?$/i.test(r.text.slice(a.end, b.index))) {
      const both = appleName(a.p.name) + ' vs ' + appleName(b.p.name);
      if (both.length <= 44) return { title: both, product: a.p, mention: a };
    }
    if (a) return { title: (a.size ? a.size + ' ' : '') + appleName(a.p.name), product: a.p, mention: a };
    if (r.software[0]) return { title: r.software[0].title, mention: r.software[0] };
    const f = r.families[0];
    if (f) return { title: f.title, family: f.family, mention: f };
    return { title: '' };
  }

  // "the original iPod" from "Apple announced the original iPod: ...",
  // for a later sentence's "25 years later".
  function anchorIn(r) {
    const m = r.products[0] || r.families[0];
    if (!m) return '';
    const before = r.text.slice(0, m.index).match(/(?:\b(?:the|its|an?|his|their|original|first|very|debut|classic)\s+){1,3}$/i);
    const phrase = (before ? before[0] : 'the ') + r.text.slice(m.index, m.end);
    return /^(?:the|its|an?|his|their)\s/i.test(phrase) ? phrase.replace(/^The\s/, 'the ') : 'the ' + phrase;
  }

  const finishLine = (line) => {
    let t = String(line || '').replace(/\s+([,.;:!?])/g, '$1').replace(/([,;:])(?:\s*[,;:])+/g, '$1').replace(/\s{2,}/g, ' ')
      .replace(/^[\s,;:\u2013\u2014-]+/, '').replace(/[\s,;:\u2013\u2014-]+$/, '').trim();
    t = t.replace(/[,;:]+\s*([.!?])/g, '$1');
    if (!t) return '';
    if (!/[.!?\u2026]["\u201d\u2019')\]]*$/.test(t) && !/["\u201d]$/.test(t)) t += '.';
    if (/[.!?]["\u201d\u2019')]*\.$/.test(t)) t = t.slice(0, -1);
    return t;
  };

  // The line under a figure: what the figure's sentence says about it. A
  // figure starting the sentence leads into the rest ("604 days" then
  // "since Apple last updated the Mac Pro"); one ending it follows the
  // words before it; one in the middle shows the whole sentence.
  const LEAD_IN = /^(?:(?:it['\u2019]s been|it has been|there are|there have been|there were|that['\u2019]s|that is|today marks|this marks|this week marks|on this day(?: back)?(?: in)?|today in apple history[,:]?(?: in)?|in|exactly|just|only|about|around|roughly|nearly|almost|over|more than|up to|some|a whopping|so far)[\s,]*)*$/i;
  function lineAround(r, fig) {
    const s = r.text;
    const before = s.slice(0, fig.index);
    const after = s.slice(fig.end);
    if (LEAD_IN.test(before.trim())) {
      let lead = after.match(/^\s*(?:ago\b)?\s*(?:today\b)?[\s,;:.!?\u2013\u2014-]*/i)[0];
      let rest = after.slice(lead.length);
      // "9,131 days, or exactly 25 years, since ...": the aside goes.
      const aside = rest.match(/^(?:or|that['\u2019]s|which is|i\.e\.)\s[^,]{1,30},\s*/i);
      if (aside) { rest = rest.slice(aside[0].length); lead = ' '; }
      // A new clause after a comma starts with a capital; "since ..."
      // or "until ..." carries straight on from the figure.
      const carriesOn = /^(?:since|until|till|to|of|after|before|for|in|on|between|from|than|more|less|later|left|ago|and)\b/i.test(rest);
      if (/[a-z]{3}/i.test(rest)) return finishLine(/[,;:\u2013\u2014]/.test(lead) && !carriesOn ? capFirst(rest) : rest);
      // "On this day in 2001" and nothing more: the heading says it all.
      if (fig.opener) return '';
    }
    if (!/[a-z]/i.test(after)) {
      // The figure ends the sentence: the words before it, when they read
      // as a whole ("The HomePod mini is Apple's cheapest speaker" before
      // "at £99"). A tacked-on ", starting at" goes with the figure; a
      // verb that needs it ("starts at", "held") keeps the whole sentence.
      let head = before.replace(/[\s,;:\u2013\u2014-]+$/, '');
      const clause = head.match(/,\s*(?:starting|priced|selling|retailing|costing)(?:\s+(?:at|from|for))?$/i);
      if (clause) head = head.slice(0, clause.index);
      else if (!/,\s*$/.test(before)) {
        const prep = head.match(/\s+(?:on|in|at|of|for|from|by|with|after|before|since|until|lasting)$/i);
        head = prep ? head.slice(0, prep.index) : '';
        if (/\b(?:starts?|starting|priced|costs?|costing|retails?|sells?|sold|selling|weighs|measures|lasts|held|holds|has|had|is|was|are|were|be|been|and|or|but|just|only|of|to)$/i.test(head)) head = '';
      }
      head = head.replace(/[\s,;:]+$/, '');
      const lastClause = head.split(/,\s*/).pop();
      if (wordsIn(head).length >= 3 && wordsIn(lastClause).length >= 3) return finishLine(head);
    }
    return finishLine(s);
  }

  // A long line loses what it can spare: brackets, "based on ..." and,
  // if it's still long, the clause after the main one.
  function trimLine(line) {
    let t = line;
    if (t.length > 90) t = finishLine(t.replace(/\s*\([^)]*\)/g, ''));
    if (t.length > 90) t = finishLine(t.replace(/,\s*(?:based on|according to|as tracked by|tracked by|per)\b[^.!?]*/i, ''));
    if (t.length > 115) {
      const cut = t.lastIndexOf(', ');
      const head = cut > 40 ? t.slice(0, cut) : '';
      if (head && wordsIn(head).length >= 6) t = finishLine(head);
    }
    return t;
  }

  // The line under a news headline ("On sale today"): the sentence with
  // the news and the product's name taken out, "25 years later" spelt
  // out from the sentence before ("25 years after the original iPod"),
  // and a description of the product put first ("Apple's first foldable").
  function newsLine(r, title, anchor) {
    let t = r.text;
    if (r.status && r.status.headline) {
      const st = r.status;
      const inner = st.text.match(/^today,?\s+(.*?)\s*\b(arrives|lands|launches|goes\s+on\s+sale|ships|debuts|hits\s+stores)\b$/i);
      t = inner ? t.slice(0, st.index) + inner[1] + t.slice(st.end) : t.slice(0, st.index) + ' ' + t.slice(st.end);
    }
    if (anchor) t = t.replace(/\b((?:(?:exactly|nearly|almost|just|some|about)\s+)?\d[\d,]*\s(?:years?|months?|weeks?|days?|decades?))\s(?:later|on)\b/i, '$1 after ' + anchor);
    if (title.mention && title.product) {
      const re = new RegExp('(^|,\\s*)(?:the\\s+)?' + escRe(title.mention.text) + '\\s*(?=[,.!?;:]|$)', 'i');
      t = t.replace(re, '$1');
    }
    t = finishLine(t.replace(/^\s*(?:today|now|and|so|finally)\b[\s,]*/i, ''));
    const lead = t.match(/^((?:(?:exactly|nearly|almost|just|some|about)\s+)?\d[\d,]*\s(?:years?|months?|weeks?|days?|decades?)\s(?:after|since|on\s+from)\s[^,]+),\s+([^,]+?)[.!]?$/i);
    if (lead && wordsIn(lead[2]).length <= 6) t = capFirst(lead[2]) + ', ' + lead[1].replace(/^\w/, (c) => c.toLowerCase()) + '.';
    return contentLeft(t, []).length >= 2 ? capFirst(t) : '';
  }

  // Everything the card shows, worked out from the post.
  function cardPlan(text) {
    const src = cardSource(text);
    // A list keeps its emoji, which mark its items and show on the card.
    const items = listItems(withoutLinks(text));
    if (items) {
      const first = withoutLinks(text).split('\n')[0].trim();
      const heading = !ITEM_RE.test(first) ? first.replace(EMOJI_RE, '').replace(/[:\s]+$/, '').trim() : '';
      if (heading.length > 24 || /[.?]$/.test(heading)) return { kind: 'list', label: src.opener || '', title: '', headline: '', line: items.join('\n'), product: null, family: null, focus: src.text };
      return { kind: 'list', label: src.opener || heading || '', title: '', headline: '', line: items.join('\n'), product: null, family: null, focus: src.text };
    }
    const sentences = splitSentences(src.text).map(readSentence);
    if (!sentences.length) return { label: src.opener, title: '', headline: '', line: '', product: null, family: null, focus: '' };
    const anyStatement = sentences.some((r) => !r.question);
    const scoreOf = (r) => {
      let n = r.i === 0 ? 1 : 0;
      if (r.status && r.status.now) n += 4;
      else if (r.status) n += 2;
      if (r.products.length) n += 2;
      else if (r.families.length || r.software.length) n += 1;
      const best = r.figures.reduce((a, f) => Math.max(a, f.score), 0);
      n += best >= 9 ? 3 : best >= 4 ? 2 : best >= 2 ? 1 : 0;
      if (r.question && anyStatement) n -= 3;
      return n;
    };
    const focus = sentences.reduce((best, r) => (scoreOf(r) > scoreOf(best) ? r : best), sentences[0]);
    const title = titleOf(focus);
    const others = sentences.filter((r) => r !== focus);
    const after = others.filter((r) => r.i > focus.i).concat(others.filter((r) => r.i < focus.i).reverse());
    const bestFig = (r) => r.figures.reduce((a, f) => (!a || f.score > a.score ? f : a), null);

    // The heading: the post's own opening words, then what kind of post
    // it is, else "Did you know?".
    const whole = src.text;
    let label = src.opener ||
      (ON_THIS_DAY_RE.test(whole) ? 'On this day' : '') ||
      (RUMOUR_RE.test(whole) ? 'Rumour' : '') ||
      (focus.status ? STATUS_LABELS[focus.status.kind] : '') ||
      (WAITING_RE.test(whole) ? 'Still waiting' : '') ||
      (EARNINGS_RE.test(whole) ? 'Earnings' : '') ||
      (EVENT_RE.test(focus.text) && focus.figures.some((f) => f.kind === 'date' || f.kind === 'when') ? 'Save the date' : '') ||
      (!anyStatement ? 'Over to you' : '') ||
      'Did you know?';

    // The headline: the focus's best figure. A sentence that's only news
    // ("The iPhone Duo is out today.") lends the card to the next one.
    let detail = focus;
    let fig = bestFig(focus);
    const st = focus.status && focus.status.headline ? focus.status : null;
    const spent = !fig && contentLeft(focus.text, [title.mention, st]).length <= 1;
    const sameSubject = (r) => !r.products.some((m) => title.product && m.p !== title.product);
    if (spent) {
      const next = after.find(sameSubject);
      if (next) { detail = next; fig = bestFig(next); }
    }
    let headline = fig ? fig.big : '';
    let line = '';
    let usedAnchor = null;
    if (fig) {
      // A figure that is all the sentence says ("Happy 25th birthday to
      // the iPod!"): the next sentence explains it.
      line = lineAround(detail, fig);
      if (!contentLeft(detail.text, [title.mention, fig, detail === focus ? st : null]).length && after.length) {
        const next = after.find((r) => r !== detail);
        if (next) { line = finishLine(next.text); detail = next; }
      }
    } else if (st) {
      // No figure, but news: the news is the headline ("On sale today").
      headline = st.headline;
      if (spent) line = detail !== focus ? finishLine(detail.text) : '';
      else {
        // News ending its clause ("..., goes on sale today."): the rest
        // of the sentence says what's new about it.
        const prev = sentences.slice(0, focus.i).reverse().find((r) => r.products.length || r.families.length);
        const anchor = prev && focus.links.length ? anchorIn(prev) : '';
        if (/^\s*(?:[.!?,;:]|$)/.test(focus.text.slice(st.end))) line = newsLine(focus, title, anchor);
        if (!line) line = finishLine(focus.text);
        if (anchor && line.indexOf(anchor) !== -1) usedAnchor = prev;
      }
    } else {
      line = finishLine(detail.text);
      // Nothing to count in it ("The iPhone Duo is Apple's first
      // foldable."): a figure from the next sentence on the same subject.
      const next = detail === focus ? after.find((r) => r.i === focus.i + 1 && sameSubject(r)) : null;
      const borrowed = next && bestFig(next);
      if (borrowed && borrowed.score >= 3) {
        headline = borrowed.big;
        fig = borrowed;
        const both = line + ' ' + finishLine(next.text);
        line = both.length <= 125 ? both : lineAround(next, borrowed);
        detail = next;
      }
    }
    if (!line && after.length && !spent) { detail = after[0]; line = finishLine(detail.text); }
    line = trimLine(line);

    // A short line takes the next sentence too, when it fits and stays on
    // the same subject ("... the Mac Pro. Its usual gap is 640 days.").
    if (line && line.length < 70) {
      const more = after.find((r) => r !== detail && r !== usedAnchor && line.indexOf(r.text) === -1);
      const extra = more ? finishLine(more.text) : '';
      const otherProduct = more && more.products.some((m) => !title.product || m.p !== title.product);
      if (extra && line.length + 1 + extra.length <= 105 && (!otherProduct || extra.length <= 45)) line = line + ' ' + extra;
    }
    return {
      label, title: title.title, headline: cardHeadline(headline), line,
      product: title.product || null, family: title.family || null, focus: focus.text, figure: fig,
    };
  }

  // The card's subject: its title and icon, headline and line. With no
  // figure of its own, a product's live figure when the post is about
  // what it says ("discontinued 2023" only on a post about it ending).
  function subjectOf(plan, text) {
    const product = plan.product;
    let big = plan.headline;
    let caption = plan.line;
    let sub = '';
    if (product && !big && plan.kind !== 'list') {
      const live = productFigure(product);
      if (live.kind && live.big !== '0' && FIGURE_TOPICS[live.kind].test(plan.focus)) {
        // "1,228 days" over "since its last release".
        const unit = live.kind !== 'gone' && live.caption.match(/^(days?)\s+/);
        big = unit ? live.big + ' ' + unit[1] : live.big;
        caption = unit ? live.caption.slice(unit[0].length) : live.caption;
        sub = live.sub || '';
      }
    }
    if (product) {
      return { title: plan.title, shape: iconShapeFor(product.category) || CATEGORY_ICONS.Other, iconUrl: product.icon_url || customCategoryIcon(product.category) || null, big, caption, sub };
    }
    // Not about one product: its family's icon, or a topic icon (the Apple
    // Sunset logo always sits small in the corner).
    const family = plan.family;
    return { title: plan.title, shape: family ? iconShapeFor(family) : CARD_ICONS[suggestCardIcon(plan.focus || text)], iconUrl: family ? customCategoryIcon(family) : null, big, caption, sub };
  }
  function cardSubject(text) {
    return subjectOf(cardPlan(text), text);
  }

  // The card's heading, title, headline and line as the composer
  // pre-fills them: the best guess from the post, to keep or change.
  function cardGuess(text) {
    const plan = cardPlan(text);
    const subject = subjectOf(plan, text);
    return { headline: cardHeadline(subject.big), line: subject.caption || '', title: subject.title || '', icon: 'auto', label: plan.label || 'Did you know?' };
  }

  // What "Automatic" will show, in words, for the composer.
  function cardAutoIconName(text) {
    const plan = cardPlan(text);
    if (plan.product) return appleName(plan.product.name) + ' icon';
    if (plan.family) return plan.family + ' icon';
    return CARD_ICON_NAMES[suggestCardIcon(plan.focus || text)];
  }

  function loadImage(src, cors) {
    return new Promise((resolve) => {
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function iconImage(shape, colour) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="400" height="400" fill="none" stroke="' + colour + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      shape.replace(/<text /, '<text fill="' + colour + '" stroke="none" ') + '</svg>';
    return loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), false);
  }

  // Draws text wrapped to maxWidth in at most maxLines, shrinking the
  // font until it fits: no line wider than maxWidth (a long figure such
  // as "1,000,000" is one word, so it has to shrink rather than wrap) and
  // nothing below maxBottom when given. Returns the y below the last line.
  // keepWhole: for a list, keep shrinking (down to that size) until every
  // typed line fits on one line, before letting any wrap.
  function fitText(ctx, text, x, y, maxWidth, weight, size, minSize, maxLines, maxBottom, keepWhole) {
    let lines;
    let s = size;
    // A little extra space between typed lines (list items), so an item
    // that wraps still reads as one.
    let starts = [];
    const gapsBefore = (n) => starts.filter((i) => i > 0 && i < n).length;
    const gapOf = (sz) => Math.round(sz * 0.32);
    const bottomAt = (n, sz) => y + sz + (n - 1) * Math.round(sz * 1.18) + gapsBefore(n) * gapOf(sz) + Math.round(sz * 0.3);
    for (;;) {
      ctx.font = weight + ' ' + s + 'px ' + FONT;
      lines = wrapLines(ctx, text, maxWidth);
      starts = lines.starts || [];
      const widest = lines.reduce((w, l) => Math.max(w, ctx.measureText(l).width), 0);
      const whole = !keepWhole || s <= keepWhole || lines.length === starts.length;
      const fits = whole && lines.length <= maxLines && widest <= maxWidth && (!maxBottom || bottomAt(lines.length, s) <= maxBottom);
      if (fits || s <= minSize) break;
      s -= 2;
    }
    // Still too tall at the smallest size: fewer lines, with the cut shown.
    let allowed = maxLines;
    if (maxBottom) while (allowed > 1 && bottomAt(allowed, s) > maxBottom) allowed -= 1;
    if (lines.length > allowed) {
      fitText.cut = true;
      lines = lines.slice(0, allowed);
      // Show the cut, rather than ending mid-sentence as if complete.
      let last = lines[allowed - 1];
      while (last && ctx.measureText(last + '\u2026').width > maxWidth) last = last.replace(/\s*\S+$/, '');
      lines[allowed - 1] = (last || '') + '\u2026';
    }
    const lh = Math.round(s * 1.18);
    // maxWidth here squeezes a word that is still too wide at the
    // smallest size, rather than letting it run off the card.
    lines.forEach((line, i) => ctx.fillText(line, x, y + s + i * lh + gapsBefore(i + 1) * gapOf(s), maxWidth));
    return bottomAt(lines.length, s);
  }

  // --- A product's video, from its one video_url: an uploaded file plays
  // in a <video>; a YouTube or Vimeo link plays in that site's player; any
  // other link becomes a "Watch on ..." link. public/app.js keeps a copy
  // (videoInfoJS) for the live page refresh. ---
  function videoInfo(url) {
    const u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) return null;
    let m = u.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
    if (m) {
      const start = u.match(/[?&#](?:t|start)=(\d+)s?(?:[&#]|$)/);
      return { kind: 'embed', host: 'YouTube', vertical: /\/shorts\//i.test(u), src: 'https://www.youtube-nocookie.com/embed/' + m[1] + (start ? '?start=' + start[1] : '') };
    }
    m = u.match(/vimeo\.com\/(?:video\/)?(\d{6,})/i);
    if (m) return { kind: 'embed', host: 'Vimeo', vertical: false, src: 'https://player.vimeo.com/video/' + m[1] };
    if (/\.(mp4|m4v|mov|webm|ogv)(?:[?#]|$)/i.test(u) || /\/storage\/v1\/object\/public\//.test(u)) return { kind: 'file', src: u };
    let host = '';
    try { host = new URL(u).hostname.replace(/^www\./i, ''); } catch (e) { return null; }
    return { kind: 'link', host, src: u };
  }

  // --- Sharing someone else's article on X: its headline, credit to the
  // site (its X account when the page names one), and the article's own
  // link, so X shows the article's preview. ---
  function articlePostText(info) {
    const site = String((info && info.site) || '').trim();
    let title = String((info && info.title) || '').replace(/\s+/g, ' ').trim();
    // A page title often ends " - MacRumors" or " | 9to5Mac".
    if (site) {
      const safe = site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      title = title.replace(new RegExp('\\s*[|\\-\u2013\u2014:\u00b7]\\s*' + safe + '\\s*$', 'i'), '');
    }
    const handle = String((info && info.via) || '').replace(/^@/, '').trim();
    const credit = /^[A-Za-z0-9_]{1,15}$/.test(handle) ? 'via @' + handle : site ? 'via ' + site : '';
    return [title, credit].filter(Boolean).join(' ');
  }

  // fields: { headline, line } typed by the writer, used as they are in
  // place of the guess from the text. The canvas's lineCut says whether
  // the line had to be shortened to fit.
  async function drawFactCanvas(factText, label, fields) {
    await ensureCardProducts();
    const subject = cardSubject(factText);
    const own = !!fields;
    let emoji = '';
    if (own) {
      subject.big = cardHeadline(fields.headline);
      subject.caption = String(fields.line || '').trim();
      // Small text under the line, e.g. "Source: 9to5Mac".
      subject.sub = String(fields.source || '').trim();
      if (fields.title !== undefined) subject.title = String(fields.title || '').trim();
      // The icon: 'auto' (the product's or topic's), a topic icon by
      // name, or anything else typed, drawn as an emoji.
      const icon = String(fields.icon || 'auto').trim();
      if (CARD_ICONS[icon]) { subject.shape = CARD_ICONS[icon]; subject.iconUrl = null; }
      // An image (an event's artwork); the invitation icon if it won't load.
      else if (/^(https?:)?\/\//i.test(icon) || /^\/[^/]/.test(icon)) { subject.iconUrl = icon; subject.shape = CARD_ICONS.invite; subject.iconFill = true; }
      else if (icon && icon !== 'auto') emoji = icon;
    }
    fitText.cut = false;
    let lineCut = false;
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
    const shade = ctx.createLinearGradient(0, 0, W * 0.6, 0);
    shade.addColorStop(0, 'rgba(46, 26, 61, 0.22)');
    shade.addColorStop(1, 'rgba(46, 26, 61, 0)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = sunsetGradient(ctx, 0, 0, W, 0);
    ctx.fillRect(0, 0, W, 10);

    // Label.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 32px ' + FONT;
    // With nothing but the logo to show, the big "Did you know?" beside it
    // says it, so the small label would only repeat it.
    if (subject.big || subject.shape || subject.iconUrl || emoji || own) ctx.fillText(String(label || 'Did you know?').toUpperCase(), PAD, 108);

    // The icon tile: the product's own icon, else its family's line icon,
    // else the Apple Sunset logo.
    const TILE = 340;
    const tx = PAD;
    const ty = 160;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 8;
    roundedRect(ctx, tx, ty, TILE, TILE, 44);
    ctx.fillStyle = '#fff7ef';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    let art = emoji ? null : subject.iconUrl ? await loadImage(subject.iconUrl, true) : null;
    if (!art && !emoji && subject.shape) art = await iconImage(subject.shape, '#9c4009');
    if (emoji) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '190px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", ' + FONT;
      ctx.fillStyle = '#9c4009';
      ctx.fillText(emoji, tx + TILE / 2, ty + TILE / 2 + 10, TILE - 50);
      ctx.restore();
    } else if (art && subject.iconFill && subject.iconUrl) {
      // An event's artwork fills the tile, trimmed to a square from the
      // middle, where Apple puts the emblem.
      const iw = art.naturalWidth || art.width || 1;
      const ih = art.naturalHeight || art.height || 1;
      const side = Math.min(iw, ih);
      ctx.save();
      roundedRect(ctx, tx, ty, TILE, TILE, 44);
      ctx.clip();
      ctx.drawImage(art, (iw - side) / 2, (ih - side) / 2, side, side, tx, ty, TILE, TILE);
      ctx.restore();
    } else if (art) {
      // Fit inside the tile, keeping the icon's own proportions.
      const inner = TILE - 70;
      const ratio = (art.naturalWidth || art.width || 1) / (art.naturalHeight || art.height || 1);
      const dw = ratio >= 1 ? inner : Math.round(inner * ratio);
      const dh = ratio >= 1 ? Math.round(inner / ratio) : inner;
      ctx.drawImage(art, tx + (TILE - dw) / 2, ty + (TILE - dh) / 2, dw, dh);
    } else if (logo) {
      ctx.save();
      roundedRect(ctx, tx, ty, TILE, TILE, 44);
      ctx.clip();
      ctx.drawImage(logo, tx, ty, TILE, TILE);
      ctx.restore();
    }

    // Beside it: the name, one big figure, and what the figure means.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
    const cx = tx + TILE + 64;
    const cw = W - PAD - cx;
    // The right-hand column has the card to itself down to here (the
    // logo sits bottom-left, under the tile), so no text can meet it.
    const BOTTOM = H - 48;
    const LOGO = 76;
    const LOGO_Y = H - 50 - LOGO;
    // A source line ("Source: 9to5Mac") sits under the text with a clear
    // gap, as part of the same block, and keeps its room at the bottom.
    const SUB_SIZE = 28;
    const SUB_GAP = 18;
    const TEXT_BOTTOM = subject.sub ? BOTTOM - SUB_SIZE - SUB_GAP : BOTTOM;
    // Space between the title ("iPhone Duo") and what follows it.
    const TITLE_GAP = 16;
    ctx.fillStyle = '#ffffff';
    let y = subject.title ? fitText(ctx, subject.title, cx, ty - 8, cw, '800', 60, 40, 2, TEXT_BOTTOM) + TITLE_GAP : ty - 8;
    if (subject.big) {
      ctx.fillStyle = sunsetGradient(ctx, cx, 0, cx + cw, 0, SUNSET_WARM);
      ctx.fillStyle = '#ffd59a';
      // A figure ("20", "1,000,000") stays one big line; a headline in
      // words ("Limited to 2 per customer") is set smaller and takes up to
      // two lines rather than being cut off or crowding out the line.
      const wordy = /\s/.test(subject.big.trim()) && !/^[$\u00a3\u20ac]?\d/.test(subject.big.trim());
      fitText.cut = false;
      y = fitText(ctx, subject.big, cx, y + 4, cw, '800', wordy ? 84 : 150, 48, 2, TEXT_BOTTOM);
      lineCut = fitText.cut;
    } else if (!own) {
      // No figure: the label says it all, in big type.
      ctx.fillStyle = '#ffd59a';
      y = fitText(ctx, 'Did you know?', cx, y + 4, cw, '800', 96, 60, 1, TEXT_BOTTOM);
    }
    ctx.fillStyle = '#ffffff';
    if (subject.caption) {
      fitText.cut = false;
      // With no headline, the line takes its space, in larger type.
      const listy = /\n\s*\S/.test(subject.caption);
      y = own && !subject.big
        ? fitText(ctx, subject.caption, cx, y + 12, cw, '700', listy ? 44 : 58, listy ? 26 : 38, listy ? 10 : 5, TEXT_BOTTOM, listy ? 32 : 0)
        : fitText(ctx, subject.caption, cx, y + (listy ? 6 : 0), cw, '700', listy ? 40 : 46, listy ? 24 : 34, listy ? 9 : 4, TEXT_BOTTOM, listy ? 28 : 0);
      lineCut = lineCut || fitText.cut;
    }
    if (subject.sub) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      fitText(ctx, subject.sub, cx, y + SUB_GAP, cw, '600', SUB_SIZE, 22, 1, BOTTOM);
    }

    // Logo, small, bottom-left under the icon tile, with the web address
    // beside it. It used to sit bottom-right, where a three-line fact ran
    // into it.
    const size2 = LOGO;
    const lx = PAD;
    const ly = LOGO_Y;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '500 26px ' + FONT;
    ctx.fillText('applesunset.com', logo ? lx + size2 + 20 : PAD, logo ? ly + size2 / 2 + 9 : H - 60);

    if (logo) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;
      roundedRect(ctx, lx, ly, size2, size2, 16);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.save();
      roundedRect(ctx, lx, ly, size2, size2, 16);
      ctx.clip();
      ctx.drawImage(logo, lx, ly, size2, size2);
      ctx.restore();
    }
    ctx.shadowColor = 'transparent';
    canvas.lineCut = lineCut;
    return canvas;
  }

  async function generateFactImage(factText, label, fields) {
    return (await drawFactCanvas(factText, label, fields)).toDataURL('image/png');
  }

  // The card as an image plus whether its line had to be shortened.
  async function xCardPreview(factText, label, fields) {
    const canvas = await drawFactCanvas(factText, label, fields);
    return { url: canvas.toDataURL('image/png'), lineCut: !!canvas.lineCut };
  }

  // The same card as a PNG file, for the iPhone share sheet.
  async function factImageFile(factText, label, fields) {
    const canvas = await drawFactCanvas(factText, label, fields);
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
        if (!p.category) continue;
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
    const categoryCount = new Set(cachedProducts.map((p) => p.category).filter(Boolean)).size;
    facts.push('Apple Sunset is currently tracking ' + cachedProducts.length + ' Apple product' + (cachedProducts.length === 1 ? '' : 's') + ' across ' + categoryCount + ' categor' + (categoryCount === 1 ? 'y' : 'ies') + '.');

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
    return days + (days === 1 ? ' day' : ' days');
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
      out.push('Pre-orders for the ' + name + ' opened ' + (function (n) { return n + (n === 1 ? ' day' : ' days'); })(daysBetweenIso(info.preorder, latest)) + ' before it reached customers on ' + longDate(latest) + '.');
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
    return String(html || '').replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
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
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // The Facts page: every fact published to the homepage, newest first.
  // Product "Did you know?" notes stay on their product pages.
  // A published fact is fixed text, so one that states a site statistic
  // ("tracking 19 Apple products") goes out of date as products are added.
  // With the products to hand, such a fact takes the statistic's current
  // wording and numbers (marked live), and two versions of the same
  // statistic show once, the newest. Facts come newest first.
  function liveFacts(facts, products) {
    const list = (facts || []).filter((f) => f && f.id && String(f.text || '').trim());
    if (!products || !products.length) return list;
    const shape = (t) => normaliseFact(t).replace(/[0-9][0-9,.]*/g, '#');
    const current = {};
    generateFactCandidates(products).forEach((text) => { current[shape(text)] = text; });
    const seen = {};
    return list.reduce((out, f) => {
      const s = shape(f.text);
      if (!current[s]) { out.push(f); return out; }
      if (seen[s]) return out;
      seen[s] = true;
      out.push(Object.assign({}, f, { text: current[s], live: true }));
      return out;
    }, []);
  }

  // The Facts page: the facts the homepage "Did you know?" has already
  // shown (from the same pool: product facts, statistics kept up to date
  // and facts published from admin or the phone app). Each is dated by
  // the last day it was there (opts.history, the build's diary of
  // [{ date, key }]) and filed under its month and year, newest first,
  // today's at the top. Facts still waiting for their turn stay off.
  // opts.todayKey: the fact on the homepage today.
  const MONTH_NAMES_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function factsPageHtml(facts, products, opts) {
    const options = opts || {};
    const today = new Date().toISOString().slice(0, 10);
    const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
    const shownOn = {};
    (options.history || []).forEach((h) => {
      if (h && h.key && isDay(h.date) && h.date <= today && (!shownOn[h.key] || h.date > shownOn[h.key])) shownOn[h.key] = h.date;
    });
    const entries = dailyFactPool(products, facts).filter((item) => !(item.pin && item.pin > today)).map((item) => {
      const isToday = !!options.todayKey && item.key === options.todayKey;
      return { item, kind: item.key.charAt(0), shown: shownOn[item.key] || (isToday ? today : ''), today: isToday };
    });
    if (!entries.length) return '';
    const keyOrder = (a, b) => (a.item.key < b.item.key ? -1 : a.item.key > b.item.key ? 1 : 0);
    const dayText = (d) => Number(d.slice(8)) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(d.slice(5, 7)) - 1] + ' ' + d.slice(0, 4);
    const card = (e) => {
      const item = e.item;
      const productHref = item.slug ? '/products/' + encodeURIComponent(item.slug) + '/' : '';
      const subject = e.kind === 'p' && item.name ? '<p class="fact-card-subject"><a href="' + productHref + '">' + escapeHtml(item.name) + '</a></p>' : '';
      const when = '<p class="fact-date">' + dayText(e.shown) + (e.kind === 's' ? ' &middot; Kept up to date' : '') + '</p>';
      const more = e.kind === 'f' ? '<a class="fact-more-link" href="/facts/' + encodeURIComponent(item.key.slice(2)) + '/">Read more &rarr;</a>'
        : e.kind === 'p' && productHref ? '<a class="fact-more-link" href="' + productHref + '">More on the ' + escapeHtml(item.name) + ' &rarr;</a>' : '';
      return '<article class="fact-card fact-card--product fact-card--' + (e.kind === 'p' ? 'about-product' : e.kind === 's' ? 'statistic' : 'published') + (e.today ? ' fact-card--today' : '') + '" data-fact-key="' + escapeHtml(item.key) + '" data-search="' + escapeHtml((item.name ? item.name + ' ' : '') + item.plain) + '">' +
        (e.today ? '<p class="fact-today">On the homepage today</p>' : '') +
        subject +
        '<p class="fact-text">' + escapeHtml(item.plain) + '</p>' +
        when + more +
        '</article>';
    };

    // Only facts already shown on the homepage: by year, then month, newest first.
    const diary = entries.filter((e) => e.shown).sort((a, b) => (b.shown < a.shown ? -1 : b.shown > a.shown ? 1 : 0) || keyOrder(a, b));
    let diaryHtml = '';
    let year = '';
    let month = '';
    diary.forEach((e) => {
      const y = e.shown.slice(0, 4);
      const m = e.shown.slice(0, 7);
      if (m !== month) {
        if (month) diaryHtml += '</div></section>';
        if (y !== year) {
          if (year) diaryHtml += '</section>';
          diaryHtml += '<section class="facts-year" data-year="' + y + '"><h2 class="facts-year-title">' + y + '</h2>';
          year = y;
        }
        diaryHtml += '<section class="facts-month" data-month="' + m + '"><h3 class="facts-month-title">' + MONTH_NAMES_LONG[Number(m.slice(5, 7)) - 1] + '</h3><div class="facts-grid">';
        month = m;
      }
      diaryHtml += card(e);
    });
    if (month) diaryHtml += '</div></section></section>';

    return diaryHtml;
  }

  // --- X posts: ideas worked out from the site's own data, the post
  // text, and a request for Claude to write posts. X only: nothing here
  // is saved or shown on the website.

  // The product a post is about: the longest product name it mentions,
  // ignoring spacing and punctuation ("iPod Hi-Fi" matches "iPod HiFi").
  // The product a text is about: the one it names first ("The iPhone 11
  // cost less than the iPhone XR" is about the iPhone 11), and of names
  // starting at the same place the longest ("iPhone 11 Pro" over "iPhone 11").
  function productNamed(text, products) {
    const squash = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const hay = squash(text);
    let best = null;
    let bestAt = Infinity;
    (products || []).forEach((p) => {
      const name = squash(p && p.name);
      if (name.length <= 2) return;
      const at = hay.indexOf(name);
      if (at === -1) return;
      if (at < bestAt || (at === bestAt && name.length > squash(best.name).length)) { best = p; bestAt = at; }
    });
    return best;
  }

  // #Apple plus the product's family, e.g. "#Apple #iPhone" for the
  // iPhone 14 Pro: the broad tags people follow and search, never one
  // made from a model's full name.
  const FAMILY_HASHTAGS = [['vision pro', '#VisionPro'], ['apple tv', '#AppleTV'], ['airtag', '#AirTag'], ['apple pencil', '#ApplePencil'],
    ['airpods', '#AirPods'], ['homepod', '#HomePod'], ['ipod', '#iPod'], ['iphone', '#iPhone'], ['ipad', '#iPad'], ['watch', '#AppleWatch'], ['mac', '#Mac']];
  function familyHashtag(words) {
    const lower = String(words || '').toLowerCase();
    const hit = FAMILY_HASHTAGS.find(([word]) => lower.indexOf(word) !== -1);
    return hit ? hit[1] : null;
  }
  function hashtagsFor(text, products) {
    const tags = ['#Apple'];
    if (/\bapple event\b|\bkeynote\b|\bevent\b/i.test(String(text || ''))) {
      tags.push('#AppleEvent');
      return tags;
    }
    // The product's family first ("Other" says nothing, so its name),
    // then whatever product line the text mentions.
    const product = productNamed(text, products);
    const tag = (product && (familyHashtag(product.category) || familyHashtag(product.name))) || familyHashtag(text);
    if (tag) tags.push(tag);
    return tags;
  }

  // A written post shortened, if need be, so that with the hashtags and
  // link it fits X's 280. Hashtags are allowed for even when they're off,
  // so ticking them later doesn't push it over.
  function xFitText(text, opts) {
    const o = Object.assign({}, opts || {}, { hashtags: true });
    return shortenToFit(text, (t) => xPostLength(xPostText(t, o)) <= 280);
  }

  // The text that goes to X: the post, then hashtags and a link if wanted.
  function xPostText(text, opts) {
    const o = opts || {};
    const extras = [];
    if (o.hashtags) extras.push(hashtagsFor(text, o.products).join(' '));
    if (o.link) extras.push(o.link);
    return String(text || '').trim() + (extras.length ? '\n\n' + extras.join('\n') : '');
  }

  // --- The card under an X post. X can't be handed an image, only a
  // link, and it shows that link's preview image. So the card is saved
  // to storage and the post links to /c/<key>/<page>: a tiny page whose
  // preview is the card, which sends people straight on to <page>.
  function xCardKey(text, label, fields, outsideLink) {
    // "card2": the subject card. Changing it gives every post a new card
    // address, so X never shows a card drawn in the old design. The
    // writer's own headline and line are part of it too.
    const own = fields ? '\n' + cardHeadline(fields.headline) + '\n' + String(fields.line || '').trim() +
      (fields.title !== undefined || fields.icon ? '\n' + String(fields.title || '').trim() + '\n' + String(fields.icon || 'auto').trim() : '') +
      (String(fields.source || '').trim() ? '\nsource:' + String(fields.source).trim() : '') : '';
    // A card for another site's article forwards there, so the article is
    // part of its address too.
    const away = outsideLink ? '\nlink:' + outsideLink : '';
    return factKey('card2\n' + String(label || '') + '\n' + String(text || '').trim() + own + away);
  }

  // outsideLink: an article on another site the card should open. It is
  // saved beside the image (x-cards/<key>.json), and the card page
  // (netlify/functions/card.mjs) forwards there; only cards made here
  // can, so the card address can't be used to send people anywhere else.
  async function uploadXCard(client, text, label, fields, outsideLink) {
    const key = xCardKey(text, label, fields, outsideLink);
    const file = await factImageFile(String(text || '').trim(), label, fields);
    if (!file) return null;
    const bucket = client.storage.from(CARD_BUCKET);
    const { error } = await bucket.upload('x-cards/' + key + '.png', file, { contentType: 'image/png' });
    const exists = (e) => /exist|duplicate/i.test(e.message || '') || e.statusCode === '409';
    if (error && !exists(error)) return null;
    if (outsideLink) {
      const json = new Blob([JSON.stringify({ link: outsideLink })], { type: 'application/json' });
      const saved = await bucket.upload('x-cards/' + key + '.json', json, { contentType: 'application/json' });
      if (saved.error && !exists(saved.error)) return null;
    }
    return key;
  }

  // The link to post: the card page, forwarding to the chosen page on
  // this site (the homepage when there is none, or it is elsewhere).
  function xCardLink(origin, key, link) {
    let path = '/';
    try {
      const url = new URL(link || '/', origin);
      if (url.origin === new URL(origin).origin) path = url.pathname;
    } catch (err) { /* not a link: use the homepage */ }
    return origin + '/c/' + key + path;
  }

  // Opens a card link the way X will, before it's posted: the card page
  // must load and name this card, and the card image must load.
  async function checkXCardLink(origin, key, outsideLink) {
    try {
      const res = await fetch(origin + '/c/' + key + '/', { cache: 'no-store' });
      if (!res.ok) return { ok: false, reason: 'the card page answered ' + res.status };
      const html = await res.text();
      const m = html.match(/<meta property="og:image" content="([^"]+)"/);
      if (!m || m[1].indexOf('x-cards/' + key) === -1) return { ok: false, reason: 'the card page doesn\u2019t show this card' };
      // For another site's article, the card must open that article.
      if (outsideLink) {
        const c = html.match(/<link rel="canonical" href="([^"]+)"/);
        if (!c || c[1].replace(/&amp;/g, '&') !== outsideLink) return { ok: false, reason: 'the card would open Apple Sunset, not the article' };
      }
      const img = await loadImage(m[1].replace(/&amp;/g, '&') + '?check=' + Date.now(), true);
      if (!img) return { ok: false, reason: 'the card image didn\u2019t load' };
      return { ok: true, reason: '' };
    } catch (err) {
      return { ok: false, reason: 'the card page couldn\u2019t be reached' };
    }
  }

  // How long X counts it: every link counts as 23 characters.
  function xPostLength(full) {
    return String(full || '').replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length;
  }

  // What the counter says after "N / 280 characters": nothing when it
  // fits; when it doesn't, whether dropping the hashtags line would do.
  function xLengthNote(post, hashtagsOn) {
    const len = xPostLength(post);
    if (len <= 280) return '';
    const without = hashtagsOn ? xWithoutHashtags(post) : post;
    return without !== post && xPostLength(without) <= 280
      ? ' \u2014 too long for X. Without the hashtags it fits'
      : ' \u2014 too long for X, shorten it a little';
  }

  // The post with its line of hashtags taken out.
  function xWithoutHashtags(post) {
    return String(post || '').replace(/\n*(?:#[A-Za-z0-9_]+[ \t]*)+(?=\n|$)/, '');
  }

  // Why Post to X is off when a post is too long, for the line under the
  // buttons, and whether taking the hashtags out would fix it.
  function xOverNote(post) {
    const len = xPostLength(post);
    if (!post || len <= 280) return null;
    const over = len - 280;
    const without = xWithoutHashtags(post);
    const tagsFix = without !== post && xPostLength(without) <= 280;
    return {
      text: 'Post to X is off: the post is ' + over + ' character' + (over === 1 ? '' : 's') + ' over X\u2019s 280.' + (tagsFix ? ' Without the hashtags it fits.' : ' Shorten the text to post it.'),
      tagsFix,
    };
  }

  function daysBetweenDates(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

  // Post ideas from the products: on this day, coming soon, the longest
  // waits, each product's "Did you know?", and the site-wide statistics.
  function xPostIdeas(products, siteOrigin) {
    const list = products || [];
    const origin = siteOrigin || 'https://applesunset.com';
    const today = new Date().toISOString().slice(0, 10);
    const productLink = (p) => origin + '/products/' + p.slug + '/';
    const ideas = [];
    list.forEach((p) => {
      if (!p.slug) return;
      pastReleases(p).forEach((d) => {
        if (d.slice(5) === today.slice(5) && d.slice(0, 4) !== today.slice(0, 4)) {
          const years = Number(today.slice(0, 4)) - Number(d.slice(0, 4));
          ideas.push({ kind: 'On this day', text: 'On this day in ' + d.slice(0, 4) + ', Apple released the ' + p.name + '. That was ' + years + ' year' + (years === 1 ? '' : 's') + ' ago.', link: productLink(p) });
        }
      });
      if (!p.discontinued) {
        const next = (p.refresh_history || []).filter((d) => d > today).sort()[0];
        if (next) {
          const days = daysBetweenDates(today, next);
          ideas.push({ kind: 'Coming soon', text: days + ' day' + (days === 1 ? '' : 's') + ' to go until the ' + p.name + ' arrives on ' + longDate(next) + '.', link: productLink(p) });
        }
      }
      const fact = plainText(p.did_you_know).replace(/\s+/g, ' ');
      if (fact) ideas.push({ kind: 'Did you know?', text: 'Did you know? ' + fact, link: productLink(p) });
    });
    // The longest waits for an update among products still on sale.
    list.filter((p) => p.slug && !p.discontinued)
      .map((p) => { const r = pastReleases(p); return { p, r, last: r[r.length - 1] }; })
      .filter((x) => x.last)
      .sort((a, b) => (a.last < b.last ? -1 : 1))
      .slice(0, 5)
      .forEach(({ p, r, last }) => {
        const days = daysBetweenDates(last, today);
        let text = 'It’s been ' + days.toLocaleString('en-GB') + (days === 1 ? ' day' : ' days') + ' since Apple last updated the ' + p.name + '.';
        if (r.length >= 2) {
          const gaps = r.slice(1).map((d, i) => daysBetweenDates(r[i], d)).filter((g) => g > 0);
          const avg = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
          if (avg) text += days > avg ? ' Its usual gap between updates is about ' + avg.toLocaleString('en-GB') + ' days.' : ' Its usual gap is about ' + avg.toLocaleString('en-GB') + ' days, so it isn’t due yet.';
        }
        ideas.push({ kind: 'Still waiting', text, link: productLink(p) });
      });
    if (list.length) generateFactCandidates(list).forEach((t) => ideas.push({ kind: 'By the numbers', text: t, link: origin + '/facts/' }));
    return ideas;
  }

  // A request for Claude to write X posts, checked against two sources.
  function xPostPrompt(idea) {
    return [
      'I run the X account for Apple Sunset (applesunset.com), a site tracking how long it has been since each Apple product was refreshed or discontinued. I need posts for X only.',
      '',
      'Topic: ' + (idea || 'anything interesting about Apple products, past or present'),
      '',
      'Please:',
      '1. Search the web and write 5 different posts about this topic: surprising facts, anniversaries, comparisons, or a question to get replies.',
      '2. Check every fact against at least two independent, reliable sources (for example Apple Newsroom, Apple Support pages, major news outlets). Double-check every date, number and name. Leave out anything that isn\'t confirmed, or that relies on rumour unless clearly labelled as one.',
      '3. Each post must be 200 characters or fewer, spaces included. Count every one and rewrite any that are longer: hashtags and a link are added afterwards and take up the rest of X\'s 280. British English, a friendly but neutral brand voice (no "I" or "my"), and no hashtags or links in the post itself.',
      '',
      'Reply with, for each post: the post on its own line, then its sources as links, then how confident you are.',
    ].join('\n');
  }

  // --- The homepage "Did you know?" of the day. The build picks it
  // (pickDailyFact) and writes it with dailyFactBoxHtml; the homepage's
  // live refresh re-renders the same fact, found again by its key, with
  // the same function, so the two always match and the fact never
  // changes while someone is reading.

  // Every product's own "Did you know?", the site-wide statistics and the
  // facts published from admin,
  // in a fixed shuffled order (by a hash of each key, so it isn't A to Z
  // and doesn't reshuffle when one is added).
  function dailyFactPool(products, publishedFacts) {
    const list = products || [];
    const pool = [];
    list.forEach((p) => {
      if (!p || !p.slug) return;
      const plain = plainText(p.did_you_know);
      if (!plain) return;
      // Away from its product page a fact needs its product's name; "post"
      // is the text for X, with the name in front when the fact doesn't
      // already say it (which also lets the card find the product).
      const named = productNamed(plain, [{ name: p.name, slug: p.slug }]);
      pool.push({ key: 'p:' + p.slug, html: String(p.did_you_know), plain, slug: p.slug, name: p.name || '', post: named ? plain : (p.name ? p.name + ': ' + plain : plain) });
    });
    generateFactCandidates(list).forEach((text) => {
      // Numbers left out of the key, so a statistic keeps its place in
      // the rotation as the counts behind it change.
      pool.push({ key: 's:' + text.replace(/[0-9][0-9,.]*/g, '#'), html: null, plain: text, slug: null, name: '' });
    });
    // Facts published from admin or the phone app. One that names a
    // product links to it (and is left out while that product is in the
    // big tile); one that repeats a statistic above is skipped.
    const statShape = (t) => normaliseFact(t).replace(/[0-9][0-9,.]*/g, '#');
    const statShapes = pool.filter((i) => !i.slug).map((i) => statShape(i.plain));
    (publishedFacts || []).forEach((f) => {
      const text = String((f && f.text) || '').trim();
      if (!f || f.id == null || !text || statShapes.indexOf(statShape(text)) !== -1) return;
      const named = productNamed(text, list);
      pool.push({ key: 'f:' + f.id, html: null, plain: text, slug: named ? named.slug : null, name: named ? named.name || '' : '', pin: f.homepage_date ? String(f.homepage_date).slice(0, 10) : null });
    });
    const seen = {};
    return pool.filter((item) => (seen[item.key] ? false : (seen[item.key] = true)))
      .sort((a, b) => (factKey(a.key) < factKey(b.key) ? -1 : factKey(a.key) > factKey(b.key) ? 1 : 0));
  }

  // One step through the pool per day (UTC), so everything shows once
  // before anything repeats. Products named in excludeSlugs (those in
  // the big homepage tile) are taken out first.
  // locked: { date, key } of the fact already shown today (saved by the
  // build), so publishing changes during the day doesn't swap it.
  function pickDailyFact(pool, dateStr, excludeSlugs, locked) {
    const skip = excludeSlugs || [];
    const date = String(dateStr).slice(0, 10);
    // A fact you've put on the homepage for this day wins outright (even
    // about a product in the big tile: you chose it). One saved for a
    // later day stays out of the rotation until then, so it isn't seen
    // early; after its day it takes its turn like the rest.
    const pinned = (pool || []).filter((item) => item.pin === date);
    if (pinned.length) return pinned[pinned.length - 1];
    const usable = (pool || []).filter((item) => (!item.slug || skip.indexOf(item.slug) === -1) && !(item.pin && item.pin > date));
    if (!usable.length) return null;
    if (locked && locked.date === date) {
      const kept = usable.find((item) => item.key === locked.key);
      if (kept) return kept;
    }
    const day = Math.floor(Date.parse(String(dateStr).slice(0, 10) + 'T00:00:00Z') / 86400000);
    return usable[((day % usable.length) + usable.length) % usable.length];
  }

  // The box's contents. sanitize is the page's own rich-text cleaner
  // (sanitizeRichText in the build, sanitizeRichTextJS in the browser).
  function dailyFactBoxHtml(item, sanitize) {
    if (!item) return '';
    const href = item.slug ? '/products/' + encodeURIComponent(item.slug) + '/' : '/facts/';
    const body = item.html ? sanitize(item.html) : escapeHtml(item.plain);
    // A product's own fact names its product above it, so it makes sense
    // on the homepage as well as on that product's page.
    const subject = item.key.charAt(0) === 'p' && item.name
      ? '<p class="fact-subject"><a href="' + href + '">' + escapeHtml(item.name) + '</a></p>'
      : '';
    return '<p class="fact-label">Did you know?</p>' + subject +
      '<div class="fact-text" data-fact-key="' + escapeHtml(item.key) + '" data-fact-href="' + href + '" data-fact-name="' + escapeHtml(item.name) + '" data-fact-post="' + escapeHtml(item.post || item.plain) + '">' + body + '</div>' +
      (item.slug ? '<a href="' + href + '" class="fact-more-link fact-related-link">More on the ' + escapeHtml(item.name) + ' &rarr;</a>' : '') +
      '<a href="/facts/" class="fact-more-link">More facts &rarr;</a>' +
      '<button type="button" class="admin-edit-link tweet-btn fact-tweet-btn" style="display:none;" data-admin-label="Draft a post for X"></button>';
  }

  // Publishes a fact, with the day it goes on the homepage if one is
  // chosen. Without the homepage_date column (supabase-schema-update-30.sql)
  // it is saved without the day, and pinSkipped says so.
  async function insertFact(client, text, pinDate) {
    if (pinDate) {
      const res = await client.from('facts').insert({ text, homepage_date: pinDate }).select();
      if (!res.error) return res;
      if (!/homepage_date/.test(res.error.message || '')) return res;
      const plain = await client.from('facts').insert({ text }).select();
      return Object.assign({}, plain, { pinSkipped: true });
    }
    return client.from('facts').insert({ text }).select();
  }

  // An event summary in and out of the admin's and the phone app's
  // formatting editors. Older summaries are plain text, whose lines
  // become paragraphs; an editor holding no words saves as empty.
  function summaryToEditorHtml(summary) {
    const raw = String(summary || '').trim();
    if (!raw) return '';
    if (/<[a-z][^>]*>/i.test(raw)) return raw;
    return raw.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => '<p>' + escapeHtml(line) + '</p>').join('');
  }
  function summaryFromEditor(editor) {
    if (!editor || !String(editor.textContent || '').trim()) return null;
    return editor.innerHTML.trim();
  }
  function summaryLengthNote(editor) {
    // A paragraph break counts as a space, whether or not the editor is
    // on screen (innerText would ignore breaks while it is hidden).
    let n = 0;
    if (editor) {
      const words = document.createElement('div');
      words.innerHTML = String(editor.innerHTML || '').replace(/<\/(p|div)>|<br\s*\/?>/gi, ' ');
      n = String(words.textContent || '').replace(/\s+/g, ' ').trim().length;
    }
    return n ? n + ' characters' + (n > 300 ? ', longer than the 300 or so that reads best' : '') : '';
  }

  // An <img> through Netlify's Image CDN at the size shown, falling back
  // to the original. Same markup as cdnImgHtml() in src/templates.js.
  function cdnImgHtml(url, width, attrs, square) {
    if (!/^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//.test(String(url || ''))) return '<img src="' + escapeHtml(url) + '"' + (attrs || '') + '>';
    const cdn = '/.netlify/images?url=' + encodeURIComponent(url) + '&w=' + width + '&q=80' + (square ? '&h=' + width + '&fit=cover' : '');
    return '<img src="' + escapeHtml(cdn) + '" data-full="' + escapeHtml(url) + '" onerror="this.onerror=null;this.src=this.dataset.full"' + (attrs || '') + '>';
  }

  // --- Apple Events in the homepage hero ---
  // Shared by the build (homePage in src/templates.js) and the page's live
  // refresh (app.js), so both always pick the same event and show it in
  // the same state: counting down, live, then "just announced" for two
  // days, after which the featured products take the tile back.
  const EVENT_ZONES = {
    PT: 'America/Los_Angeles', PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
    MT: 'America/Denver', MST: 'America/Denver', MDT: 'America/Denver',
    CT: 'America/Chicago', CST: 'America/Chicago', CDT: 'America/Chicago',
    ET: 'America/New_York', EST: 'America/New_York', EDT: 'America/New_York',
    UK: 'Europe/London', BST: 'Europe/London', GMT: 'UTC', UTC: 'UTC',
    CET: 'Europe/Paris', CEST: 'Europe/Paris',
  };
  const EVENT_LIVE_MS = 2 * 3600000; // "Live now" for the first two hours
  const EVENT_RECAP_MS = 48 * 3600000; // "Just announced" until 48 hours after the start

  function tzOffsetMs(zone, utcMs) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs));
    const v = {};
    parts.forEach((part) => { v[part.type] = part.value; });
    return Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour % 24, +v.minute, +v.second) - utcMs;
  }
  function zonedToUtc(y, mo, d, h, mi, zone) {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    try {
      // Twice, in case the day sits on a clock change.
      return guess - tzOffsetMs(zone, guess - tzOffsetMs(zone, guess));
    } catch (err) {
      return guess;
    }
  }
  // "10am PT", "10:00 a.m. PT", "17:00 UTC" and so on.
  function eventTimeParts(timeText) {
    const m = timeText && String(timeText).replace(/\./g, '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*([A-Za-z]{2,4})?/i);
    if (!m) return null;
    let hour = +m[1];
    const min = +(m[2] || 0);
    const ampm = (m[3] || '').toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    if (hour > 23 || min > 59) return null;
    return { hour, min, zone: m[4] ? EVENT_ZONES[m[4].toUpperCase()] || null : null };
  }
  // The moment an event starts. With no readable time, or no time zone,
  // Pacific time is assumed (10am when there's no time at all), which is
  // when and where Apple's events almost always begin.
  function eventStartMs(event) {
    const bits = String((event && event.event_date) || '').slice(0, 10).split('-').map(Number);
    if (bits.length < 3 || bits.some((n) => isNaN(n))) return NaN;
    const t = eventTimeParts(event.event_time) || { hour: 10, min: 0, zone: null };
    return zonedToUtc(bits[0], bits[1], bits[2], t.hour, t.min, t.zone || 'America/Los_Angeles');
  }
  function eventHasNews(event) {
    return !!(eventSummaryLead(event && event.summary) || ((event && event.announced_products) || []).length);
  }
  function eventPhase(event, now) {
    const start = eventStartMs(event);
    if (isNaN(start)) return null;
    const t = now == null ? Date.now() : now;
    if (t < start) return 'upcoming';
    // Once what was announced is added (a summary or products), it shows
    // as announced straight away: some events are press releases with
    // nothing to watch.
    if (t < start + EVENT_LIVE_MS) return eventHasNews(event) ? 'recap' : 'live';
    if (t < start + EVENT_RECAP_MS) return 'recap';
    return 'past';
  }
  // The event for the hero: of those not yet two days past their start,
  // a pinned one first, otherwise the soonest.
  function pickHeroEvent(events, now) {
    const t = now == null ? Date.now() : now;
    const live = (events || [])
      .map((event) => ({ event, start: eventStartMs(event) }))
      .filter((x) => !isNaN(x.start) && t < x.start + EVENT_RECAP_MS)
      .sort((a, b) => a.start - b.start);
    const pick = live.find((x) => x.event.featured) || live[0];
    return pick ? pick.event : null;
  }

  function clockText(hour, min) {
    return (hour % 12 || 12) + (min ? ':' + String(min).padStart(2, '0') : '') + (hour < 12 ? 'am' : 'pm');
  }
  // When it is in the UK, for an event timed in another zone, e.g. "6pm UK".
  function eventUkTime(event) {
    const t = eventTimeParts(event && event.event_time);
    if (!t || !t.zone || t.zone === 'Europe/London' || t.zone === 'UTC') return '';
    const start = eventStartMs(event);
    if (isNaN(start)) return '';
    const local = new Date(start + tzOffsetMs('Europe/London', start));
    const sameDay = local.toISOString().slice(0, 10) === String(event.event_date).slice(0, 10);
    const day = sameDay ? '' : ' ' + local.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
    return clockText(local.getUTCHours(), local.getUTCMinutes()) + day + ' UK';
  }
  function eventDayText(event) {
    const d = new Date(String(event.event_date).slice(0, 10) + 'T12:00:00Z');
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
  }
  function eventClockUnits(ms) {
    const secs = Math.max(0, Math.floor(ms / 1000));
    const unit = (value, label, cls) => '<span class="countdown-unit' + (cls ? ' ' + cls : '') + '"><span class="countdown-value">' + value + '</span> <span class="countdown-unit-label">' + label + '</span></span>';
    const days = Math.floor(secs / 86400);
    return unit(days, days === 1 ? 'day' : 'days') + unit(Math.floor((secs % 86400) / 3600), 'hours') +
      unit(Math.floor((secs % 3600) / 60), 'mins') + unit(secs % 60, 'secs', 'countdown-unit--secs');
  }

  // The event's page address, e.g. "welcome-home-october-2026". The build
  // (eventSlug in src/templates.js) uses this; app.js keeps a copy.
  function eventSlug(event) {
    const heading = String(event.heading || '').replace(/['\u2019]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
    let datePart = '';
    const d = event.event_date ? new Date(event.event_date) : null;
    if (d && !isNaN(d)) {
      const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      datePart = months[d.getUTCMonth()] + '-' + d.getUTCFullYear();
    }
    return [heading, datePart].filter(Boolean).join('-') || String(event.id);
  }

  // A ready-made X post about an event, with its card: the event's own
  // artwork in the tile, its name, and how long to go (or that it's live,
  // or what was announced). opts: origin, now.
  function eventPostIdea(event, opts) {
    const o = opts || {};
    const now = o.now == null ? Date.now() : o.now;
    const origin = o.origin || 'https://applesunset.com';
    const phase = eventPhase(event, now) || 'upcoming';
    const start = eventStartMs(event);
    const name = String(event.heading || 'Apple Event').trim();
    const quoted = '\u201c' + name + '\u201d';
    const day = eventDayText(event);
    const longDay = (() => {
      const d = new Date(String(event.event_date).slice(0, 10) + 'T12:00:00Z');
      return isNaN(d) ? day : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(',', '');
    })();
    const uk = eventUkTime(event);
    const time = event.event_time ? ' at ' + event.event_time + (uk ? ' (' + uk + ')' : '') : '';
    const products = (event.announced_products || []).map((p) => (typeof p === 'string' ? { name: p, featured: false } : p)).filter((p) => p && p.name);
    const names = products.filter((p) => p.featured).map((p) => p.name).concat(products.filter((p) => !p.featured).map((p) => p.name));
    const listOf = (list) => (list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]);
    const icon = event.image_url ? (/^https?:\/\//i.test(event.image_url) ? event.image_url : origin + event.image_url) : 'invite';
    const link = origin + '/events/' + eventSlug(event) + '/';
    const whenLine = [day, event.event_time].filter(Boolean).join(' \u00b7 ') + (uk ? ' (' + uk + ')' : '');
    let text;
    let card;
    if (phase === 'upcoming') {
      // Calendar days to go, as it is in the UK: Friday to Tuesday is 4.
      const todayUk = new Date(now + tzOffsetMs('Europe/London', now)).toISOString().slice(0, 10);
      const days = Math.round((Date.parse(String(event.event_date).slice(0, 10)) - Date.parse(todayUk)) / 86400000);
      text = 'It\u2019s official: Apple\u2019s next event, ' + quoted + ', is on ' + longDay + time + '. Follow the countdown, then see everything announced, on Apple Sunset.';
      card = { label: 'Apple Event', title: name, headline: days > 1 ? days + ' days' : days === 1 ? 'Tomorrow' : 'Today', line: whenLine, icon };
    } else if (phase === 'live') {
      // With no watch link there's no stream to point to.
      text = event.event_url
        ? 'Apple\u2019s ' + quoted + ' event is live now. Everything announced will be on Apple Sunset.'
        : 'Apple\u2019s ' + quoted + ' announcements are happening now. Everything announced will be on Apple Sunset.';
      card = { label: 'Apple Event', title: name, headline: event.event_url ? 'Live now' : 'Today', line: whenLine, icon };
    } else {
      let shown = names.slice();
      text = '';
      while (shown.length) {
        text = 'Everything Apple announced at its ' + quoted + ' event: ' + listOf(shown.length < names.length ? shown.concat(['more']) : shown) + '.';
        if (text.length <= 230) break;
        shown = shown.slice(0, -1);
      }
      if (!names.length) text = 'Apple\u2019s ' + quoted + ' event, ' + longDay + '. Everything announced is on Apple Sunset.';
      card = {
        label: phase === 'recap' ? 'Just announced' : 'Apple Event',
        title: name,
        headline: names.length ? names.length + ' new product' + (names.length === 1 ? '' : 's') : day,
        line: names.length ? listOf(names.slice(0, 3).concat(names.length > 3 ? ['more'] : [])) : whenLine,
        icon,
      };
    }
    return { kind: card.label, text, link, card };
  }

  // Post ideas for the events worth posting about now: coming in the next
  // 60 days, live, or held in the last two days. Soonest first.
  function eventPostIdeas(events, origin, now) {
    const t = now == null ? Date.now() : now;
    return (events || [])
      .map((event) => ({ event, start: eventStartMs(event), phase: eventPhase(event, t) }))
      .filter((x) => x.phase && x.phase !== 'past' && !(x.phase === 'upcoming' && x.start - t > 60 * 86400000))
      .sort((a, b) => a.start - b.start)
      .map((x) => eventPostIdea(x.event, { origin, now: t }));
  }

  // Puts an idea's own card (an event's: its artwork, name and countdown)
  // into an X composer's card fields. els: title, headline, line, emoji,
  // select and picker. Returns false when the idea has none.
  function applyIdeaCard(idea, els, onChange) {
    const card = idea && idea.card;
    if (!card) return false;
    els.title.value = card.title || '';
    els.headline.value = card.headline || '';
    els.line.value = card.line || '';
    els.emoji.value = '';
    const icon = String(card.icon || 'auto');
    if (CARD_ICONS[icon] || icon === 'auto') {
      els.select.value = icon;
    } else {
      addIconPickerImage(els.picker, els.select, els.emoji, icon, 'Event artwork', onChange);
      els.select.value = icon;
    }
    if (els.picker && els.picker.markPicked) els.picker.markPicked();
    return true;
  }

  // An image choice in the card icon picker (an event's artwork).
  function addIconPickerImage(box, select, emojiInput, url, label, onChange) {
    if (!box || !select || !url) return;
    if (![...select.options].some((o) => o.value === url)) select.add(new Option(label || 'Image', url));
    if ([...box.children].some((b) => b.dataset.value === url)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-pick icon-pick--image';
    btn.dataset.value = url;
    btn.title = label || 'Image';
    btn.setAttribute('aria-label', label || 'Image');
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      select.value = url;
      emojiInput.value = '';
      if (box.markPicked) box.markPicked();
      if (onChange) onChange();
    });
    box.insertBefore(btn, box.children[1] || null);
  }

  // "in 24 days", "tomorrow" or "today" until a date, counted in UK
  // calendar days (the homepage's earnings line; app.js keeps it current).
  function daysUntilText(dateStr, now) {
    const t = now == null ? Date.now() : now;
    const todayUk = new Date(t + tzOffsetMs('Europe/London', t)).toISOString().slice(0, 10);
    const days = Math.round((Date.parse(String(dateStr).slice(0, 10)) - Date.parse(todayUk)) / 86400000);
    if (isNaN(days)) return '';
    return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days';
  }

  // The countdown on its own (the event's page), while it is still to come.
  function eventCountdownHtml(event, now) {
    const start = eventStartMs(event);
    const t = now == null ? Date.now() : now;
    if (isNaN(start) || t >= start) return '';
    // The UK time is on the page's time pill, just above.
    return '<div class="event-detail-countdown" data-countdown-box><p class="event-detail-countdown-label">Starts in</p>' +
      '<div class="event-hero-countdown" data-countdown-at="' + start + '" role="timer" aria-label="Time until the event">' + eventClockUnits(start - t) + '</div></div>';
  }

  // The hero tile. opts: href (the event's page on this site), products
  // (every product as { name, slug }, to link what was announced) and now.
  const APPLE_NEWSROOM_URL = 'https://www.apple.com/newsroom/';

  // An event summary's opening sentence as plain text (the summary can be
  // formatted), short enough for the homepage tile.
  function eventSummaryLead(summary, max) {
    const limit = max || 160;
    const text = String(summary || '')
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/?(p|div)\b[^>]*>|<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const first = text.split(/(?<=[.!?]["\u201d\u2019']?)\s/)[0];
    if (first.length <= limit) return first;
    return first.slice(0, limit).replace(/[\s,;:]+\S*$/, '') + '\u2026';
  }

  function eventHeroHtml(event, opts) {
    const o = opts || {};
    const now = o.now == null ? Date.now() : o.now;
    const start = eventStartMs(event);
    const phase = eventPhase(event, now) || 'upcoming';
    const href = o.href || '/events/';
    const title = escapeHtml(event.heading || 'Apple Event');
    const day = eventDayText(event);
    const uk = eventUkTime(event);
    const watchUrl = event.event_url ? escapeHtml(event.event_url) : '';
    const onApple = /(^|\.)apple\.com$/i.test((String(event.event_url || '').match(/^https?:\/\/([^/]+)/i) || [])[1] || '');
    const until = phase === 'upcoming' ? start : phase === 'live' ? start + EVENT_LIVE_MS : start + EVENT_RECAP_MS;
    const kicker = phase === 'live'
      ? '<span class="event-hero-kicker event-hero-kicker--live"><span class="event-hero-dot" aria-hidden="true"></span>' + (watchUrl ? 'Live now' : 'Happening now') + '</span>'
      : phase === 'recap'
      ? '<span class="event-hero-kicker">Just announced</span>'
      : '<span class="event-hero-kicker">Apple Event</span>';
    // The artwork fills its frame, trimmed from the middle where Apple puts
    // the emblem (as on the X card). No blurred backdrop: iPhone Safari
    // can't reliably blur a large image and flickers.
    const art = event.image_url
      ? '<span class="event-hero-art">' + cdnImgHtml(event.image_url, 900, ' class="event-hero-art-img" alt=""') + '</span>'
      : '';
    const whenLine = phase === 'recap'
      ? 'Held ' + escapeHtml(day)
      : escapeHtml([day, event.event_time].filter(Boolean).join(' · ')) + (uk ? ' <span class="event-hero-uk">(' + escapeHtml(uk) + ')</span>' : '');
    let middle = '';
    let cta = '';
    if (phase === 'upcoming') {
      middle = '<div class="event-hero-countdown" data-countdown-at="' + start + '" role="timer" aria-label="Time until the event">' + eventClockUnits(start - now) + '</div>';
      cta = watchUrl
        ? '<a class="event-hero-cta" href="' + watchUrl + '" target="_blank" rel="noopener">' + (onApple ? 'Watch on apple.com' : 'Where to watch') + ' <span aria-hidden="true">&#8599;</span></a>'
        : '<a class="event-hero-cta event-hero-cta--quiet" href="' + href + '">Event details <span aria-hidden="true">&rarr;</span></a>';
    } else if (phase === 'live') {
      // A watch link means a stream to watch. Without one (an event done by
      // press release), Apple Newsroom, where the announcements appear.
      if (watchUrl) {
        middle = '<p class="event-hero-note">It&rsquo;s on now. Everything Apple announces will be added here afterwards.</p>';
        cta = '<a class="event-hero-cta" href="' + watchUrl + '" target="_blank" rel="noopener">' + (onApple ? 'Watch live on apple.com' : 'Watch live') + ' <span aria-hidden="true">&#8599;</span></a>';
      } else {
        middle = '<p class="event-hero-note">Apple is announcing it today. Everything announced will be added here.</p>';
        cta = '<a class="event-hero-cta" href="' + APPLE_NEWSROOM_URL + '" target="_blank" rel="noopener">Apple Newsroom <span aria-hidden="true">&#8599;</span></a>';
      }
    } else {
      const named = (event.announced_products || []).map((p) => (typeof p === 'string' ? { name: p, featured: false } : p)).filter((p) => p && p.name);
      const ordered = named.filter((p) => p.featured).sort((a, b) => a.name.localeCompare(b.name))
        .concat(named.filter((p) => !p.featured).sort((a, b) => a.name.localeCompare(b.name)));
      const bySlugName = {};
      (o.products || []).forEach((p) => { if (p && p.name && p.slug) bySlugName[p.name.toLowerCase()] = p.slug; });
      const shown = ordered.slice(0, 12);
      const more = ordered.length - shown.length;
      // The summary's opening sentence, a line or two on what was announced.
      const lead = eventSummaryLead(event.summary);
      middle = (lead ? '<p class="event-hero-summary">' + escapeHtml(lead) + '</p>' : '') + (ordered.length
        ? '<ul class="event-hero-products' + (shown.length > 4 ? ' event-hero-products--many' : '') + '">' + shown.map((p) => {
            const slug = bySlugName[p.name.toLowerCase()];
            return '<li>' + (slug ? '<a href="/products/' + escapeHtml(slug) + '/">' + escapeHtml(p.name) + '</a>' : escapeHtml(p.name)) + '</li>';
          }).join('') + (more > 0 ? '<li class="event-hero-more">+' + more + ' more</li>' : '') + '</ul>'
        : lead ? '' : '<p class="event-hero-note">What Apple announced is being added now.</p>');
      cta = '<a class="event-hero-cta" href="' + href + '">' + (ordered.length || lead ? 'See everything announced' : 'Go to the event page') + ' <span aria-hidden="true">&rarr;</span></a>';
    }
    const many = phase === 'recap' && (event.announced_products || []).length > 4;
    return '<article class="card card--featured card--event event-hero event-hero--' + phase + (many ? ' event-hero--many' : '') + '" data-event-hero data-phase-until="' + until + '">' +
      kicker + art +
      '<div class="event-hero-head"><h2 class="event-hero-title"><a class="event-hero-link" href="' + href + '">' + title + '</a></h2>' +
      '<p class="event-hero-when">' + whenLine + '</p></div>' +
      middle + cta +
    '</article>';
  }

  const FactsKit = {
    eventStartMs,
    eventPhase,
    pickHeroEvent,
    eventHeroHtml,
    eventCountdownHtml,
    eventSlug,
    liveFacts,
    daysUntilText,
    eventPostIdea,
    eventPostIdeas,
    applyIdeaCard,
    eventUkTime,
    insertFact,
    appleName,
    CATEGORY_ICONS,
    setCardProducts,
    setCardCategoryIcons,
    setCardProductsLoader,
    ensureCardProducts,
    cardSubject,
    dailyFactPool,
    pickDailyFact,
    dailyFactBoxHtml,
    xPostIdeas,
    xPostText,
    xFitText,
    xPostLength,
    xPostPrompt,
    hashtagsFor,
    productNamed,
    xCardKey,
    cardGuess,
    xLengthNote,
    xWithoutHashtags,
    xOverNote,
    summaryToEditorHtml,
    cdnImgHtml,
    summaryFromEditor,
    summaryLengthNote,
    CARD_ICON_NAMES,
    mountIconPicker,
    cardAutoIconName,
    suggestCardIcon,
    cardHeadline,
    xCardPreview,
    uploadXCard,
    xCardLink,
    checkXCardLink,
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
    videoInfo,
    articlePostText,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = FactsKit;
  if (typeof window !== 'undefined') window.FactsKit = FactsKit;
})();
