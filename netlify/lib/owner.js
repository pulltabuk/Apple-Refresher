// Who may use the admin's server functions: the site owner's login only,
// not just any valid Supabase session (anyone could create an account).
// ADMIN_EMAILS in Netlify's environment variables (comma separated)
// overrides the default.

const OWNER_EMAILS = (process.env.ADMIN_EMAILS || 'jgprice@mac.com').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

function isOwner(user) {
  return !!(user && user.email && OWNER_EMAILS.indexOf(String(user.email).toLowerCase()) !== -1);
}

// Checks the request's "Authorization: Bearer <token>" against Supabase.
// Returns null when it is the owner, else { statusCode, error }.
async function ownerCheck(event) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const token = ((event.headers || {}).authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return { statusCode: 401, error: 'Not signed in.' };
  if (!supabaseUrl || !anonKey) return { statusCode: 500, error: 'Supabase is not configured.' };
  try {
    const check = await fetch(supabaseUrl + '/auth/v1/user', { headers: { apikey: anonKey, Authorization: 'Bearer ' + token } });
    if (!check.ok) return { statusCode: 401, error: 'Session is not valid. Sign in again.' };
    if (!isOwner(await check.json())) return { statusCode: 403, error: 'This account can’t do that.' };
    return null;
  } catch (err) {
    return { statusCode: 502, error: 'Could not verify the session: ' + err.message };
  }
}

// A key only the site's own functions know (derived from the service role
// key), for the scheduled job to start the drafts job.
function internalKey() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!secret) return '';
  return require('crypto').createHash('sha256').update('x-drafts:' + secret).digest('hex');
}

module.exports = { isOwner, ownerCheck, internalKey };
