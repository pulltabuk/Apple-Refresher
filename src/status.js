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

function computeStatus(product, today = new Date()) {
  const history = (product.refresh_history || [])
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

  return { daysSince, avgCycleDays, ratio, status, lastRefresh };
}

module.exports = { computeStatus, CATEGORY_DEFAULT_CYCLE_DAYS };
