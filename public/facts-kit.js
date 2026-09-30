// "Did you know?" facts, shared by the admin panel (admin.js) and the
// phone app (upload.js): working out fact candidates from product data,
// the tweet text, and the image card that goes with a tweet.
(function () {
  function buildTweetText(factText) {
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
    const footer = uniqueHashtags.join(' ') + '\n' + window.location.host;
    let body = hook + ' ' + factText;
    let full = body + '\n\n' + footer;

    // Twitter's 280-char limit: trim the fact text itself (never the
    // hashtags or link) if the combined text runs over.
    if (full.length > 280) {
      const overBy = full.length - 280;
      const keep = Math.max(20, factText.length - overBy - 1);
      const trimmed = factText.slice(0, keep).trim() + '\u2026';
      body = hook + ' ' + trimmed;
      full = body + '\n\n' + footer;
    }
    return full;
  }

  // The 1200x675 "Did you know?" card as a canvas.
  function drawFactCanvas(factText) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 675;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 1200, 675);
    gradient.addColorStop(0, '#0071e3');
    gradient.addColorStop(1, '#14213d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1200, 675);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px system-ui, -apple-system, sans-serif';
    ctx.fillText('\ud83c\udf4e DID YOU KNOW?', 80, 120);

    ctx.font = '700 52px system-ui, -apple-system, sans-serif';
    const words = factText.split(' ');
    let line = '';
    let y = 230;
    const lineHeight = 66;
    const maxWidth = 1040;
    words.forEach((word) => {
      const testLine = line + word + ' ';
      if (ctx.measureText(testLine).width > maxWidth && line !== '') {
        ctx.fillText(line.trim(), 80, y);
        line = word + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    });
    ctx.fillText(line.trim(), 80, y);

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '400 26px system-ui, -apple-system, sans-serif';
    ctx.fillText(window.location.host, 80, 610);

    return canvas;
  }

  function generateFactImage(factText) {
    return drawFactCanvas(factText).toDataURL('image/png');
  }

  // The same card as a PNG file, for the iPhone share sheet.
  function factImageFile(factText) {
    return new Promise((resolve) => {
      drawFactCanvas(factText).toBlob((blob) => {
        resolve(blob ? new File([blob], 'apple-sunset-fact.png', { type: 'image/png' }) : null);
      }, 'image/png');
    });
  }

  function generateFactCandidates(products) {
    const cachedProducts = products || [];
    const facts = [];
    const allDates = [];
    cachedProducts.forEach((p) => (p.refresh_history || []).forEach((d) => allDates.push(d)));

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
      const hist = (p.refresh_history || []).slice().sort();
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

  window.FactsKit = {
    sameFact,
    buildTweetText,
    drawFactCanvas,
    generateFactImage,
    factImageFile,
    generateFactCandidates,
  };
})();
