// Sends a post to Buffer, which publishes it to X: added to Buffer's queue
// (its next free slot) or scheduled for a set time, with the card attached
// as an image. Also lists the X posts waiting in Buffer, the ones that
// failed and the last few sent, for the X posts tab's "Scheduled on X",
// and deletes or moves (reschedules) one from there.
// Called from the admin's X posts tab, by the site owner only.
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
let channelCache = null;
async function xChannel() {
  if (channelCache) return channelCache;
  channelCache = await findXChannel();
  return channelCache;
}
async function findXChannel() {
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
    if (x) return Object.assign({ organizationId: org.id }, x);
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

// --- Listing posts. Buffer's posts query takes the organisation, a filter
// (channel, status) and a sort; each post has its text, status, due time
// and images. Tried with every field first and fewer after, in case a
// field isn't Buffer's, and the shape that works is kept for the next list.
const POST_FIELDS = [
  'id text status dueAt sentAt createdAt isCustomScheduled error { message } assets { thumbnail source type }',
  'id text status dueAt sentAt createdAt isCustomScheduled assets { thumbnail source }',
  'id text status dueAt sentAt createdAt',
  'id text status dueAt',
];
let listShape = null;
function listQueries(orgId, channelId, statuses, direction, first) {
  const filter = 'filter: { channelIds: [' + lit(channelId) + '], status: [' + statuses.join(', ') + '] }';
  const sorts = [', sort: [{ field: dueAt, direction: ' + direction + ' }]', ''];
  const out = [];
  POST_FIELDS.forEach((f, fi) => sorts.forEach((sort, si) => out.push({
    key: fi + ':' + si,
    query: 'query { posts(first: ' + first + ', input: { organizationId: ' + lit(orgId) + ', ' + filter + sort + ' }) { edges { node { ' + f + ' } } } }',
  })));
  if (listShape) out.sort((a, b) => (b.key === listShape) - (a.key === listShape));
  return out;
}
const firstImage = (assets) => {
  const list = Array.isArray(assets) ? assets : assets ? [assets] : [];
  const a = list.find((x) => x && (x.thumbnail || x.source));
  return a ? a.thumbnail || a.source : '';
};
async function listPosts(orgId, channelId, statuses, direction, first) {
  let lastShapeError = '';
  for (const q of listQueries(orgId, channelId, statuses, direction, first)) {
    const r = await gql(q.query);
    if (r.errors.length) {
      const msg = r.errors.map((e) => e.message).join('; ');
      if (SHAPE_ERROR.test(msg)) { lastShapeError = msg; continue; }
      throw new Error('Buffer wouldn’t list the posts: ' + msg);
    }
    listShape = q.key;
    const edges = (r.data && r.data.posts && r.data.posts.edges) || [];
    return edges.map((e) => e && e.node).filter(Boolean).map((p) => ({
      id: p.id,
      text: p.text || '',
      status: String(p.status || '').toLowerCase(),
      dueAt: p.dueAt || null,
      sentAt: p.sentAt || null,
      custom: p.isCustomScheduled == null ? null : !!p.isCustomScheduled,
      image: firstImage(p.assets),
      error: p.error && p.error.message ? p.error.message : '',
    }));
  }
  throw new Error('Buffer didn’t accept the list’s format: ' + lastShapeError);
}
// The organisations to look in: the channel's own, else every one on the
// account (when the channel comes from BUFFER_CHANNEL_ID).
async function organisations(channel) {
  if (channel.organizationId) return [channel.organizationId];
  const orgs = await gql('query { account { organizations { id } } }');
  if (orgs.errors.length || !orgs.data) throw new Error('Couldn’t read your Buffer account: ' + orgs.errors.map((e) => e.message).join('; '));
  return ((orgs.data.account && orgs.data.account.organizations) || []).map((o) => o.id);
}
async function listAll(channel) {
  const orgIds = await organisations(channel);
  let lastError = null;
  for (const orgId of orgIds) {
    try {
      const upcoming = await listPosts(orgId, channel.id, ['scheduled', 'sending'], 'asc', 60);
      const sent = await listPosts(orgId, channel.id, ['sent'], 'desc', 8).catch(() => []);
      const failed = await listPosts(orgId, channel.id, ['error'], 'desc', 6).catch(() => []);
      if (!upcoming.length && !sent.length && !failed.length && orgIds.length > 1) continue;
      const by = (field, dir) => (a, b) => dir * (Date.parse(a[field] || 0) - Date.parse(b[field] || 0));
      // Failed posts only from the last fortnight: older ones are history.
      const fortnight = Date.now() - 14 * 86400000;
      return {
        upcoming: upcoming.sort(by('dueAt', 1)),
        sent: sent.sort((a, b) => Date.parse(b.sentAt || b.dueAt || 0) - Date.parse(a.sentAt || a.dueAt || 0)).slice(0, 8),
        failed: failed.filter((p) => !p.dueAt || Date.parse(p.dueAt) >= fortnight).sort(by('dueAt', -1)),
      };
    } catch (err) {
      if (err.fatal) throw err;
      lastError = err;
    }
  }
  if (lastError) throw lastError;
  return { upcoming: [], sent: [], failed: [] };
}

// --- Deleting and moving a post. Buffer's deletePost takes the post's
// id; editPost with only a new time and customScheduled moves it, keeping
// its text and image (fields left out stay as they are).
async function runMutation(variants, pick, what) {
  let lastShapeError = '';
  for (const m of variants) {
    const r = await gql(m);
    if (r.errors.length) {
      const msg = r.errors.map((e) => e.message).join('; ');
      if (SHAPE_ERROR.test(msg)) { lastShapeError = msg; continue; }
      throw new Error('Buffer refused to ' + what + ': ' + msg);
    }
    const result = pick(r.data);
    if (result && result.message) throw new Error('Buffer refused to ' + what + ': ' + result.message);
    if (result && result.__typename && /error/i.test(result.__typename)) throw new Error('Buffer refused to ' + what + ' (' + result.__typename + ').');
    return result || {};
  }
  throw new Error('Buffer didn’t accept the request’s format: ' + lastShapeError);
}
function deletePost(id) {
  const input = 'input: { id: ' + lit(id) + ' }';
  return runMutation([
    'mutation { deletePost(' + input + ') { __typename ... on DeletePostSuccess { id } ... on VoidMutationError { message } } }',
    'mutation { deletePost(' + input + ') { __typename } }',
  ], (d) => d && d.deletePost, 'delete the post');
}
function movePost(id, dueAt) {
  const input = 'input: { id: ' + lit(id) + ', mode: customScheduled, dueAt: ' + lit(dueAt) + ' }';
  const errors = ['NotFoundError', 'UnauthorizedError', 'UnexpectedError', 'LimitReachedError', 'InvalidInputError'].map((t) => '... on ' + t + ' { message }').join(' ');
  return runMutation([
    'mutation { editPost(' + input + ') { __typename ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }',
    'mutation { editPost(' + input + ') { __typename ... on PostActionSuccess { post { id dueAt } } ' + errors + ' } }',
    'mutation { editPost(' + input + ') { __typename } }',
  ], (d) => d && d.editPost, 'move the post');
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
    if (input.action === 'delete' || input.action === 'move') {
      const id = String(input.id || '').trim();
      if (!id) return json(400, { error: 'Which post? It has no id.' });
      if (input.action === 'delete') {
        await deletePost(id);
        return json(200, { ok: true, id });
      }
      const t = Date.parse(input.dueAt);
      if (isNaN(t)) return json(400, { error: 'Pick a date and time to move it to.' });
      if (t < Date.now() + 60000) return json(400, { error: 'That time has passed. Pick a time in the future.' });
      const dueAt = new Date(t).toISOString();
      const result = await movePost(id, dueAt);
      return json(200, { ok: true, id, dueAt: result.post && result.post.dueAt ? result.post.dueAt : dueAt });
    }
    if (input.action === 'list') {
      const lists = await listAll(channel);
      return json(200, Object.assign({ ok: true, channel: channel.name || '', at: new Date().toISOString() }, lists));
    }

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
