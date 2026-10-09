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
    // #Apple and the product's name (see hashtagsFor).
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
      const overBy = full.length - linkAllowance - 280;
      const keep = Math.max(20, factText.length - overBy - 1);
      const trimmed = factText.slice(0, keep).trim() + '\u2026';
      body = hook + ' ' + trimmed;
      full = body + '\n\n' + footer;
    }
    return full;
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
      return { big: p.discontinued_date.slice(0, 4), caption: 'the year it was discontinued' + (first ? ', after ' + cardSpanText(first, p.discontinued_date) + ' on sale' : ''), sub: first ? 'First released ' + cardDate(first) : '' };
    }
    if (future) {
      const days = Math.max(0, Math.round((new Date(future) - new Date(today)) / 86400000));
      return { big: days.toLocaleString('en-GB'), caption: (days === 1 ? 'day' : 'days') + ' until it arrives', sub: 'Coming ' + cardDate(future) };
    }
    if (releases.length) {
      const last = releases[releases.length - 1];
      const days = Math.round((new Date(today) - new Date(last)) / 86400000);
      return {
        big: days.toLocaleString('en-GB'),
        caption: (days === 1 ? 'day' : 'days') + ' since its last release',
        sub: releases.length === 1 ? 'Only release: ' + cardDate(last) : releases.length + ' releases since ' + releases[0].slice(0, 4),
      };
    }
    return { big: '', caption: '', sub: '' };
  }

  // A statistic's key number ("604 days", "55%") and the few words after it.
  const MONTH_NAMES = '(?:january|february|march|april|may|june|july|august|september|october|november|december)';
  // "8 October 2014", "October 8" or "October 8, 2014".
  const DATE_RE = new RegExp('\\b(?:\\d{1,2}(?:st|nd|rd|th)?\\s+' + MONTH_NAMES + '|' + MONTH_NAMES + '\\s+\\d{1,2}(?:st|nd|rd|th)?\\b)(?:,?\\s+(?:19|20)\\d\\d)?\\b', 'i');
  function textFigure(text) {
    let m = String(text || '').match(/(\d[\d,]*(?:\.\d+)?)(\s?(?:%|per cent|percent|days?|weeks?|months?|years?))?/i);
    // A date ("8 October 2014") is one headline, not the number 8.
    const d = String(text || '').match(DATE_RE);
    if (d && (!m || d.index <= m.index)) m = Object.assign([d[0], d[0].replace(/,/g, ''), ''], { index: d.index });
    if (!m) return null;
    const rest = String(text).slice(m.index + m[0].length).split(/[.,;:!?(]/)[0].trim().split(/\s+/).filter(Boolean);
    const caption = rest.slice(0, 7).join(' ') + (rest.length > 7 ? '…' : '');
    // The whole rest of the sentence, for the composer to pre-fill.
    // The rest of the number's own sentence, for the composer to pre-fill;
    // when the number ends its sentence, the words before it instead.
    const after = String(text).slice(m.index + m[0].length);
    let full = /^\s*["\u201d\u2019']?[.!?](\s|$)/.test(after) ? '' : after.replace(/^[\s,;:"'\u201d\u2019)\]]+/, '').split(/(?<=[.!?]["\u201d\u2019']?)\s/)[0].trim();
    if (!/[a-z]/i.test(full)) {
      const head = String(text).slice(0, m.index);
      const starts = [...head.matchAll(/[.!?]["\u201d\u2019']?\s+/g)];
      full = head.slice(starts.length ? starts[starts.length - 1].index + starts[starts.length - 1][0].length : 0)
        .replace(/\s*\b(on|in|at|of|since|by|from|for)\s*$/i, '').replace(/[\s,;:]+$/, '').trim();
      if ((full.match(/"/g) || []).length % 2) full += '"';
      if (!/[a-z]/i.test(full)) full = '';
    }
    return { big: cardHeadline((m[1] + (m[2] || '')).replace(/\s?per ?cent/i, '%')), caption, sub: '', full };
  }

  // A card headline never ends in a comma, full stop or other punctuation.
  function cardHeadline(text) {
    return String(text || '').trim().replace(/[\s,.;:!?\u2013\u2014-]+$/, '');
  }

  // The card's headline and line as the composer pre-fills them: the
  // best guess from the text, for the writer to keep or change.
  function cardGuess(text) {
    const subject = cardSubject(text);
    const fig = productNamed(text, cardProducts) ? null : textFigure(text);
    return { headline: cardHeadline(subject.big), line: (fig && fig.full) || subject.caption || '', title: subject.title || '', icon: 'auto' };
  }

  // What "Automatic" will show, in words, for the composer.
  function cardAutoIconName(text) {
    const product = productNamed(text, cardProducts);
    if (product) return appleName(product.name) + ' icon';
    const category = categoryNamed(text);
    if (category) return category + ' icon';
    return CARD_ICON_NAMES[suggestCardIcon(text)];
  }

  function cardSubject(text) {
    const product = productNamed(text, cardProducts);
    if (product) {
      const fig = productFigure(product);
      return { title: appleName(product.name), shape: iconShapeFor(product.category) || CATEGORY_ICONS.Other, iconUrl: product.icon_url || customCategoryIcon(product.category) || null, big: fig.big, caption: fig.caption, sub: fig.sub };
    }
    const category = categoryNamed(text);
    const fig = textFigure(text);
    // Not about one family: a topic icon in the tile (the Apple Sunset
    // logo always sits small in the corner), and no title unless typed.
    return { title: category || '', shape: category ? iconShapeFor(category) : CARD_ICONS[suggestCardIcon(text)], iconUrl: category ? customCategoryIcon(category) : null, big: fig ? fig.big : '', caption: fig ? fig.caption : '', sub: '' };
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
  // font until it fits. Returns the y below the last line.
  function fitText(ctx, text, x, y, maxWidth, weight, size, minSize, maxLines) {
    let lines;
    let s = size;
    for (;;) {
      ctx.font = weight + ' ' + s + 'px ' + FONT;
      lines = wrapLines(ctx, text, maxWidth);
      if (lines.length <= maxLines || s <= minSize) break;
      s -= 2;
    }
    if (lines.length > maxLines) {
      fitText.cut = true;
      lines = lines.slice(0, maxLines);
      // Show the cut, rather than ending mid-sentence as if complete.
      let last = lines[maxLines - 1];
      while (last && ctx.measureText(last + '\u2026').width > maxWidth) last = last.replace(/\s*\S+$/, '');
      lines[maxLines - 1] = (last || '') + '\u2026';
    }
    const lh = Math.round(s * 1.18);
    lines.forEach((line, i) => ctx.fillText(line, x, y + s + i * lh));
    return y + s + (lines.length - 1) * lh + Math.round(s * 0.3);
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
      subject.sub = '';
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
    ctx.fillStyle = '#ffffff';
    let y = subject.title ? fitText(ctx, subject.title, cx, ty - 8, cw, '800', 60, 40, 2) : ty - 8;
    if (subject.big) {
      ctx.fillStyle = sunsetGradient(ctx, cx, 0, cx + cw, 0, SUNSET_WARM);
      ctx.fillStyle = '#ffd59a';
      y = fitText(ctx, subject.big, cx, y + 4, cw, '800', 150, 72, 1);
    } else if (!own) {
      // No figure: the label says it all, in big type.
      ctx.fillStyle = '#ffd59a';
      y = fitText(ctx, 'Did you know?', cx, y + 4, cw, '800', 96, 60, 1);
    }
    ctx.fillStyle = '#ffffff';
    if (subject.caption) {
      fitText.cut = false;
      // With no headline, the line takes its space, in larger type.
      y = own && !subject.big
        ? fitText(ctx, subject.caption, cx, y + 12, cw, '700', 58, 38, 4)
        : fitText(ctx, subject.caption, cx, y, cw, '700', 46, 34, 3);
      lineCut = fitText.cut;
    }
    if (subject.sub) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      fitText(ctx, subject.sub, cx, y + 2, cw, '500', 28, 22, 1);
    }

    // Web address, bottom-left.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '500 26px ' + FONT;
    ctx.fillText('applesunset.com', PAD, H - 60);

    // Logo, small, bottom-right (unless it's already the big tile).
    if (logo) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;
      const size2 = 76;
      const lx = W - PAD - size2 + 10;
      const ly = H - 50 - size2;
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
  function monthYear(iso) {
    const parts = String(iso).slice(0, 7).split('-').map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  // The Facts page: every fact published to the homepage, newest first.
  // Product "Did you know?" notes stay on their product pages.
  function factsPageHtml(facts) {
    const list = (facts || []).filter((f) => f && f.id && String(f.text || '').trim());
    if (!list.length) return '';
    return '<div class="facts-grid">' + list.map((f) => {
      const href = '/facts/' + encodeURIComponent(String(f.id)) + '/';
      const day = String(f.created_at || '').slice(0, 10);
      return '<article class="fact-card fact-card--product">' +
        '<p class="fact-text">' + escapeHtml(f.text) + '</p>' +
        (/^\d{4}-\d{2}-\d{2}$/.test(day) ? '<p class="fact-date">' + Number(day.slice(8)) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(day.slice(5, 7)) - 1] + ' ' + day.slice(0, 4) + '</p>' : '') +
        '<a class="fact-more-link" href="' + href + '">Read more &rarr;</a>' +
        '</article>';
    }).join('') + '</div>';
  }

  // --- X posts: ideas worked out from the site's own data, the post
  // text, and a request for Claude to write posts. X only: nothing here
  // is saved or shown on the website.

  // The product a post is about: the longest product name it mentions,
  // ignoring spacing and punctuation ("iPod Hi-Fi" matches "iPod HiFi").
  function productNamed(text, products) {
    const squash = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const hay = squash(text);
    let best = null;
    (products || []).forEach((p) => {
      const name = squash(p && p.name);
      if (name.length > 2 && hay.indexOf(name) !== -1 && (!best || name.length > squash(best.name).length)) best = p;
    });
    return best;
  }

  // #Apple plus the product's own name, e.g. "#Apple #iPodHiFi". Without a
  // product list, or when no product is named, the product line instead.
  function hashtagsFor(text, products) {
    const tags = ['#Apple'];
    if (/\bapple event\b|\bkeynote\b|\bevent\b/i.test(String(text || ''))) {
      tags.push('#AppleEvent');
      return tags;
    }
    const product = productNamed(text, products);
    if (product) {
      const tag = '#' + String(product.name).replace(/[^A-Za-z0-9]+/g, '');
      if (tag.length > 1 && tag.toLowerCase() !== '#apple') tags.push(tag);
      return tags;
    }
    const lower = String(text || '').toLowerCase();
    const line = [['vision pro', '#VisionPro'], ['apple tv', '#AppleTV'], ['airtag', '#AirTag'], ['airpods', '#AirPods'], ['homepod', '#HomePod'],
      ['ipod', '#iPod'], ['iphone', '#iPhone'], ['ipad', '#iPad'], ['watch', '#AppleWatch'], ['mac', '#Mac']]
      .find(([word]) => lower.indexOf(word) !== -1);
    if (line) tags.push(line[1]);
    return tags;
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
  function xCardKey(text, label, fields) {
    // "card2": the subject card. Changing it gives every post a new card
    // address, so X never shows a card drawn in the old design. The
    // writer's own headline and line are part of it too.
    const own = fields ? '\n' + cardHeadline(fields.headline) + '\n' + String(fields.line || '').trim() +
      (fields.title !== undefined || fields.icon ? '\n' + String(fields.title || '').trim() + '\n' + String(fields.icon || 'auto').trim() : '') : '';
    return factKey('card2\n' + String(label || '') + '\n' + String(text || '').trim() + own);
  }

  async function uploadXCard(client, text, label, fields) {
    const key = xCardKey(text, label, fields);
    const file = await factImageFile(String(text || '').trim(), label, fields);
    if (!file) return null;
    const { error } = await client.storage.from(CARD_BUCKET).upload('x-cards/' + key + '.png', file, { contentType: 'image/png' });
    if (error && !(/exist|duplicate/i.test(error.message || '') || error.statusCode === '409')) return null;
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
  async function checkXCardLink(origin, key) {
    try {
      const res = await fetch(origin + '/c/' + key + '/', { cache: 'no-store' });
      if (!res.ok) return { ok: false, reason: 'the card page answered ' + res.status };
      const html = await res.text();
      const m = html.match(/<meta property="og:image" content="([^"]+)"/);
      if (!m || m[1].indexOf('x-cards/' + key) === -1) return { ok: false, reason: 'the card page doesn\u2019t show this card' };
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
        let text = 'It’s been ' + days.toLocaleString('en-GB') + ' days since Apple last updated the ' + p.name + '.';
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
      '3. Each post must be under 230 characters, in British English, in a friendly but neutral brand voice (no "I" or "my"), with no hashtags or links (those get added afterwards).',
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
  function eventPhase(event, now) {
    const start = eventStartMs(event);
    if (isNaN(start)) return null;
    const t = now == null ? Date.now() : now;
    if (t < start) return 'upcoming';
    if (t < start + EVENT_LIVE_MS) return 'live';
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
    const unit = (value, label, cls) => '<span class="countdown-unit' + (cls ? ' ' + cls : '') + '"><span class="countdown-value">' + value + '</span><span class="countdown-unit-label">' + label + '</span></span>';
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
      text = 'Apple\u2019s ' + quoted + ' event is live now. Everything announced will be on Apple Sunset.';
      card = { label: 'Apple Event', title: name, headline: 'Live now', line: whenLine, icon };
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

  // The countdown on its own (the event's page), while it is still to come.
  function eventCountdownHtml(event, now) {
    const start = eventStartMs(event);
    const t = now == null ? Date.now() : now;
    if (isNaN(start) || t >= start) return '';
    const uk = eventUkTime(event);
    return '<div class="event-detail-countdown" data-countdown-box><p class="event-detail-countdown-label">Starts in' + (uk ? ' <span>(' + escapeHtml(uk) + ')</span>' : '') + '</p>' +
      '<div class="event-hero-countdown" data-countdown-at="' + start + '" role="timer" aria-label="Time until the event">' + eventClockUnits(start - t) + '</div></div>';
  }

  // The hero tile. opts: href (the event's page on this site), products
  // (every product as { name, slug }, to link what was announced) and now.
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
      ? '<span class="event-hero-kicker event-hero-kicker--live"><span class="event-hero-dot" aria-hidden="true"></span>Live now</span>'
      : phase === 'recap'
      ? '<span class="event-hero-kicker">Just announced</span>'
      : '<span class="event-hero-kicker">Apple Event</span>';
    // The artwork fills whatever height the tile has: shown whole, over a
    // soft blurred copy of itself, so any shape of image looks intended.
    const art = event.image_url
      ? '<span class="event-hero-art"><img class="event-hero-art-bg" src="' + escapeHtml(event.image_url) + '" alt="" aria-hidden="true"><img class="event-hero-art-img" src="' + escapeHtml(event.image_url) + '" alt=""></span>'
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
      middle = '<p class="event-hero-note">It&rsquo;s on now. Everything Apple announces will be added here afterwards.</p>';
      cta = '<a class="event-hero-cta" href="' + (watchUrl || href) + '"' + (watchUrl ? ' target="_blank" rel="noopener"' : '') + '>Watch live' + (watchUrl ? ' <span aria-hidden="true">&#8599;</span>' : '') + '</a>';
    } else {
      const named = (event.announced_products || []).map((p) => (typeof p === 'string' ? { name: p, featured: false } : p)).filter((p) => p && p.name);
      const ordered = named.filter((p) => p.featured).sort((a, b) => a.name.localeCompare(b.name))
        .concat(named.filter((p) => !p.featured).sort((a, b) => a.name.localeCompare(b.name)));
      const bySlugName = {};
      (o.products || []).forEach((p) => { if (p && p.name && p.slug) bySlugName[p.name.toLowerCase()] = p.slug; });
      const shown = ordered.slice(0, 12);
      const more = ordered.length - shown.length;
      middle = ordered.length
        ? '<ul class="event-hero-products' + (shown.length > 4 ? ' event-hero-products--many' : '') + '">' + shown.map((p) => {
            const slug = bySlugName[p.name.toLowerCase()];
            return '<li>' + (slug ? '<a href="/products/' + escapeHtml(slug) + '/">' + escapeHtml(p.name) + '</a>' : escapeHtml(p.name)) + '</li>';
          }).join('') + (more > 0 ? '<li class="event-hero-more">+' + more + ' more</li>' : '') + '</ul>'
        : '<p class="event-hero-note">What Apple announced is being added now.</p>';
      cta = '<a class="event-hero-cta" href="' + href + '">' + (ordered.length ? 'See everything announced' : 'Go to the event page') + ' <span aria-hidden="true">&rarr;</span></a>';
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
    xPostLength,
    xPostPrompt,
    hashtagsFor,
    productNamed,
    xCardKey,
    cardGuess,
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
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = FactsKit;
  if (typeof window !== 'undefined') window.FactsKit = FactsKit;
})();
