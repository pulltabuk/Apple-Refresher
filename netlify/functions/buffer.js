// Sends a post to Buffer, which publishes it to X: added to Buffer's queue
// (its next free slot) or scheduled for a set time, with the card attached
// as an image. Called from the admin's X posts tab, by the site owner only.
// The Buffer key lives in Netlify (BUFFER_API_KEY) and never reaches the
// browser.
//
// Buffer's API is GraphQL at https://api.buffer.com. Its exact shapes
// can't be tried from where this was written, so the post is attempted in
// the documented shape first and a couple of close variants after, and
// Buffer's own error is passed back word for word if none is accepted.

const { ownerCheck } = require('../lib/owner');

const BUFFER_URL = 'https://api.buffer.com';
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
// A GraphQL string literal: JSON's escaping is valid GraphQL.
const lit = (s) => JSON.stringify(String(s));

async function gql(query) {
  const res = await fetch(BUFFER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.BUFFER_API_KEY },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => null);
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Buffer didn’t accept the API key (' + res.status + '). Check BUFFER_API_KEY in Netlify.'), { fatal: true });
  if (!body) throw Object.assign(new Error('Buffer answered ' + res.status + ' with nothing readable.'), { fatal: true });
  return { data: body.data || null, errors: body.errors || [], status: res.status };
}

// The X channel: BUFFER_CHANNEL_ID if set, else the first X/Twitter
// channel in the first organisation that has one.
async function xChannel() {
  if (process.env.BUFFER_CHANNEL_ID) return { id: process.env.BUFFER_CHANNEL_ID, name: 'set in Netlify' };
  const orgs = await gql('query { account { organizations { id name } } }');
  if (orgs.errors.length || !orgs.data) throw new Error('Couldn’t read your Buffer account: ' + orgs.errors.map((e) => e.message).join('; '));
  const list = (orgs.data.account && orgs.data.account.organizations) || [];
  const seen = [];
  for (const org of list) {
    const ch = await gql('query { channels(input: { organizationId: ' + lit(org.id) + ' }) { id name service } }');
    if (ch.errors.length) throw new Error('Couldn’t list your Buffer channels: ' + ch.errors.map((e) => e.message).join('; '));
    const channels = (ch.data && ch.data.channels) || [];
    channels.forEach((c) => seen.push(c.service + ' (' + c.name + ')'));
    const x = channels.find((c) => /twitter|^x$/i.test(String(c.service || '')));
    if (x) return x;
  }
  throw new Error(seen.length ? 'No X channel found in Buffer. Channels there: ' + seen.join(', ') + '.' : 'No channels found in your Buffer account. Connect X in Buffer first.');
}

// Errors that mean "this shape isn't Buffer's", as opposed to Buffer
// refusing the post itself: try the next shape.
const SHAPE_ERROR = /unknown|not defined|cannot query|expected|undefined field|field .* (?:not|doesn)|argument|validat|syntax|type /i;

function mutations(text, channelId, imageUrl, mode, dueAt) {
  const base = 'text: ' + lit(text) + ', channelId: ' + lit(channelId) + ', schedulingType: automatic, ' +
    (mode === 'schedule' ? 'mode: customScheduled, dueAt: ' + lit(dueAt) : 'mode: addToQueue');
  const assets = imageUrl
    ? ['assets: { images: [{ url: ' + lit(imageUrl) + ' }] }', 'assets: [{ image: { url: ' + lit(imageUrl) + ' } }]']
    : [''];
  const results = [
    '... on PostActionSuccess { post { id dueAt } } ... on MutationError { message }',
    '... on PostActionSuccess { post { id } } ... on MutationError { message }',
    '__typename',
  ];
  const out = [];
  assets.forEach((a) => results.forEach((r) => out.push('mutation { createPost(input: { ' + base + (a ? ', ' + a : '') + ' }) { ' + r + ' } }')));
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const denied = await ownerCheck(event);
  if (denied) return json(denied.statusCode, { error: denied.error });
  if (!process.env.BUFFER_API_KEY) {
    return json(500, { error: 'Buffer isn’t connected yet: add your Buffer API key in Netlify as BUFFER_API_KEY (Site configuration → Environment variables), then publish once.' });
  }

  let input;
  try { input = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request.' }); }

  try {
    const channel = await xChannel();
    if (input.action === 'check') return json(200, { ok: true, channel: channel.name || channel.id });

    const text = String(input.text || '').trim();
    if (!text) return json(400, { error: 'There’s no post text.' });
    const mode = input.mode === 'schedule' ? 'schedule' : 'queue';
    let dueAt = null;
    if (mode === 'schedule') {
      const t = Date.parse(input.dueAt);
      if (isNaN(t)) return json(400, { error: 'Pick a date and time to schedule it for.' });
      if (t < Date.now() + 60000) return json(400, { error: 'That time has passed. Pick a time in the future.' });
      dueAt = new Date(t).toISOString();
    }
    const imageUrl = /^https:\/\//i.test(String(input.imageUrl || '')) ? String(input.imageUrl) : '';

    let lastShapeError = '';
    for (const m of mutations(text, channel.id, imageUrl, mode, dueAt)) {
      const r = await gql(m);
      if (r.errors.length) {
        const msg = r.errors.map((e) => e.message).join('; ');
        if (SHAPE_ERROR.test(msg)) { lastShapeError = msg; continue; }
        return json(502, { error: 'Buffer refused the post: ' + msg });
      }
      const result = r.data && r.data.createPost;
      if (result && result.message) return json(502, { error: 'Buffer refused the post: ' + result.message });
      if (result && result.__typename && /error/i.test(result.__typename)) return json(502, { error: 'Buffer refused the post (' + result.__typename + ').' });
      const post = result && result.post;
      return json(200, { ok: true, id: post ? post.id : null, dueAt: post && post.dueAt ? post.dueAt : dueAt, channel: channel.name || '' });
    }
    return json(502, { error: 'Buffer didn’t accept the post’s format: ' + lastShapeError });
  } catch (err) {
    return json(502, { error: err.message });
  }
};
