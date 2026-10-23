// Triggers a Netlify rebuild so changes made in the admin panel appear
// on the live site. The build hook URL is held as an environment
// variable, never in page source, and the caller must present a valid
// Supabase session so this cannot be triggered by a passer-by.

// The site owner's login(s). ADMIN_EMAILS in Netlify's environment
// variables (comma separated) overrides the default.
const OWNER_EMAILS = (process.env.ADMIN_EMAILS || 'jgprice@mac.com').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
function isOwner(user) {
  return !!(user && user.email && OWNER_EMAILS.indexOf(String(user.email).toLowerCase()) !== -1);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const hookUrl = process.env.NETLIFY_BUILD_HOOK;
  if (!hookUrl) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'No build hook configured. Add NETLIFY_BUILD_HOOK in Netlify under Site configuration, Environment variables.' }),
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '');

  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in.' }) };
  }

  // Confirm the token belongs to the site owner before building: a real
  // signed-in user isn't enough, since anyone could create an account.
  if (!supabaseUrl || !anonKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase is not configured.' }) };
  }
  try {
    const check = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token },
    });
    if (!check.ok) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Session is not valid. Sign in again.' }) };
    }
    const user = await check.json();
    if (!isOwner(user)) {
      return { statusCode: 403, body: JSON.stringify({ error: 'This account can\u2019t publish the site.' }) };
    }
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not verify the session: ' + err.message }) };
  }

  try {
    const res = await fetch(hookUrl, { method: 'POST' });
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Netlify refused the build request (' + res.status + ').' }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not reach Netlify: ' + err.message }) };
  }
};
