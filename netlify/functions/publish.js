// Triggers a Netlify rebuild so changes made in the admin panel appear
// on the live site. The build hook URL is held as an environment
// variable, never in page source, and the caller must present a valid
// Supabase session so this cannot be triggered by a passer-by.

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

  // Confirm the token belongs to a real signed-in user before building.
  if (supabaseUrl && anonKey) {
    try {
      const check = await fetch(supabaseUrl + '/auth/v1/user', {
        headers: { apikey: anonKey, Authorization: 'Bearer ' + token },
      });
      if (!check.ok) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Session is not valid. Sign in again.' }) };
      }
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Could not verify the session: ' + err.message }) };
    }
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
