// Rebuilds the site once a day so the numbers stay true.
//
// Everything on the site is worked out when the site is built: days since
// refresh, the countdown panel, "next expected". Without a rebuild those
// freeze at whenever the site was last published. This keeps them honest
// and retires a countdown by itself on release day.
//
// Runs on the schedule set in netlify.toml. It simply asks Netlify to
// build, using the same build hook the Publish button uses.

exports.handler = async () => {
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
