// Each morning (the schedule is in netlify.toml) starts x-drafts-background,
// which writes the day's X post drafts for review in the admin. Scheduled
// functions only get 30 seconds; the background one gets 15 minutes, which
// researching posts can need.

const { internalKey } = require('../lib/owner');

exports.handler = async () => {
  const key = internalKey();
  if (!key) {
    console.error('x-drafts-daily: no SUPABASE_SERVICE_ROLE_KEY, so no drafts today.');
    return { statusCode: 500, body: 'Not configured.' };
  }
  const base = process.env.URL || 'https://applesunset.com';
  try {
    const res = await fetch(base + '/.netlify/functions/x-drafts-background', { method: 'POST', headers: { 'x-drafts-key': key } });
    return { statusCode: res.status === 202 || res.ok ? 200 : 502, body: 'Drafts job ' + (res.status === 202 || res.ok ? 'started.' : 'refused (' + res.status + ').') };
  } catch (err) {
    console.error('x-drafts-daily could not start the drafts job:', err.message);
    return { statusCode: 502, body: 'Could not start the drafts job.' };
  }
};
