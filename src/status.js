// Category fallbacks used only until a product has at least two logged
// refreshes of its own — after that, its own history takes over.
const CATEGORY_DEFAULT_CYCLE_DAYS = {
  iPhone: 365,
  Mac: 500,
  iPad: 450,
  'Apple Watch': 365,
  AirPods: 730,
  Other: 400,
};

const DAY_MS = 24 * 60 * 60 * 1000;

// A product's releases together with those of the models it replaced
// (its previous_model, and theirs), oldest first, up to its own latest:
// the line's history. A successor (HomePod mini 2 after the HomePod
// mini) has one release of its own, but its line has a refresh cycle.
// Keep in step with lineHistoryJS() in public/app.js.
function lineHistory(product, bySlug) {
  const own = (product.refresh_history || []).slice().sort();
  const last = own[own.length - 1];
  const seen = new Set();
  const dates = new Set(own);
  let prev = product.previous_model;
  while (prev && prev !== '__new__' && bySlug[prev] && !seen.has(prev)) {
    seen.add(prev);
    (bySlug[prev].refresh_history || []).forEach((d) => { if (!last || d <= last) dates.add(d); });
    prev = bySlug[prev].previous_model;
  }
  return Array.from(dates).sort();
}

// Gives each product whose line reaches further back than its own
// releases a line_history, which computeStatus measures the cycle with.
function withLineHistory(products) {
  const bySlug = {};
  (products || []).forEach((p) => { bySlug[p.slug] = p; });
  (products || []).forEach((p) => {
    const line = lineHistory(p, bySlug);
    if (line.length > (p.refresh_history || []).length) p.line_history = line;
  });
  return products;
}

function computeStatus(product, today = new Date()) {
  const history = (product.line_history || product.refresh_history || [])
    .map((d) => new Date(d))
    .sort((a, b) => a - b);

  const lastRefresh = history[history.length - 1];
  if (!lastRefresh) return null;

  const daysSince = Math.floor((today - lastRefresh) / DAY_MS);

  let avgCycleDays;
  if (history.length >= 2) {
    let totalGapMs = 0;
    for (let i = 1; i < history.length; i++) {
      totalGapMs += history[i] - history[i - 1];
    }
    avgCycleDays = Math.round(totalGapMs / (history.length - 1) / DAY_MS);
  } else {
    avgCycleDays =
      CATEGORY_DEFAULT_CYCLE_DAYS[product.category] ||
      CATEGORY_DEFAULT_CYCLE_DAYS.Other;
  }

  const ratio = daysSince / avgCycleDays;

  let status;
  if (ratio < 0.5) status = 'fresh';
  else if (ratio < 1.0) status = 'aging';
  else status = 'overdue';

  // With a single release in the whole line there is no real cycle
  // (avgCycleDays above is only a category guess), so nothing should
  // state one or predict a date.
  const hasCycle = history.length >= 2;

  return { daysSince, avgCycleDays, ratio, status, lastRefresh, hasCycle };
}

module.exports = { computeStatus, lineHistory, withLineHistory, CATEGORY_DEFAULT_CYCLE_DAYS };
