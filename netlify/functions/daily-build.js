// Rebuilds the site once a day so the numbers stay true.
//
// Everything on the site is worked out when the site is built: days since
// refresh, the countdown panel, "next expected". Without a rebuild those
// freeze at whenever the site was last published. This keeps them honest
// and retires a countdown by itself on release day.
//
// Runs on the schedule set in netlify.toml. It simply asks Netlify to
// build, using the same build hook the Publish button uses.

// The UK hour now (0-23), summer time or not.
function ukHour(now) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' }).format(now));
}

exports.handler = async () => {
  // Runs at 00:05, 05:05 and 06:05 UTC (netlify.toml). The midnight run
  // always builds; of the other two, only the one at 6am UK does, when
  // the homepage's tiles turn over (FactsKit.pickHeroTiles).
  const utcHour = new Date().getUTCHours();
  if (utcHour !== 0 && ukHour(new Date()) !== 6) {
    return { statusCode: 200, body: 'Not 6am in the UK: no rebuild this time.' };
  }
  const hook = process.env.NETLIFY_BUILD_HOOK;
  if (!hook) {
    console.error('No NETLIFY_BUILD_HOOK set, so the daily rebuild did nothing.');
    return { statusCode: 500, body: 'No build hook configured.' };
  }
  try {
    const res = await fetch(hook, { method: 'POST' });
    if (!res.ok) {
      console.error('Netlify refused the scheduled build:', res.status);
      return { statusCode: 502, body: 'Build request refused.' };
    }
    return { statusCode: 200, body: 'Daily rebuild started.' };
  } catch (err) {
    console.error('Could not reach Netlify for the scheduled build:', err.message);
    return { statusCode: 502, body: 'Could not reach Netlify.' };
  }
};
