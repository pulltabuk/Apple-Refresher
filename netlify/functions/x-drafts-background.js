// Writes the day's X post drafts for the admin to review ("Drafts to
// review" in the X posts tab). Nothing is posted from here: each draft
// waits until it is sent to Buffer or rejected in the admin.
//
// Two kinds of draft:
// - From the site's own data (always): "On this day" releases, the longest
//   "Still waiting", and a product's "Did you know?".
// - Researched by Claude (when ANTHROPIC_API_KEY is set in Netlify): Apple
//   history for today's date and a fact, each checked against two sources
//   found by web search, with those sources kept for the review.
//
// A background function (the name ends in -background), so it has up to
// 15 minutes. Started each morning by x-drafts-daily.js, or from the admin's
// "Make drafts now" by the site owner.

const FactsKit = require('../../public/facts-kit.js');
const { ownerCheck, internalKey } = require('../lib/owner');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORIGIN = 'https://applesunset.com';
const MODEL = 'claude-opus-5-5';

async function rest(path, opts) {
  const o = opts || {};
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: o.method || 'GET',
    headers: Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' }, o.headers || {}),
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  if (!res.ok) throw new Error('Supabase ' + (o.method || 'GET') + ' ' + path.split('?')[0] + ' answered ' + res.status + ': ' + (await res.text()).slice(0, 200));
  return res.status === 204 || o.method === 'POST' ? null : res.json();
}

// The card a draft gets: worked out from its text the same way the
// composer does, so it can be changed there before sending.
function cardFor(text) {
  const g = FactsKit.cardGuess(text);
  return { label: g.label, title: g.title, headline: g.headline, line: g.line, icon: 'auto', source: '' };
}

// Drafts from the site's own products: anniversaries today, plus one wait
// and one "Did you know?" that rotate day by day.
function siteDrafts(products) {
  const ideas = FactsKit.xPostIdeas(products, ORIGIN);
  const day = Math.floor(Date.now() / 86400000);
  const rotate = (list, n) => { const out = []; for (let i = 0; i < list.length && out.length < n; i++) out.push(list[(day + i) % list.length]); return out; };
  return [].concat(
    ideas.filter((i) => i.kind === 'On this day').slice(0, 2),
    rotate(ideas.filter((i) => i.kind === 'Still waiting'), 1),
    rotate(ideas.filter((i) => i.kind === 'Did you know?'), 1),
  ).map((i) => ({ kind: i.kind, origin: 'site', text: i.text, link: i.link || null, sources: [], card: cardFor(i.text) }));
}

// The tool Claude hands its finished posts to: a fixed shape, so nothing
// has to be read out of free text.
const SAVE_TOOL = {
  name: 'save_drafts',
  description: 'Save the finished, fact-checked posts for the site owner to review. Call once, with every post you are confident in.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['drafts'],
    properties: {
      drafts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'text', 'sources', 'confidence'],
          properties: {
            kind: { type: 'string', enum: ['On this day', 'Did you know?'] },
            text: { type: 'string', description: 'The post, 200 characters or fewer, no hashtags, links or emoji.' },
            sources: {
              type: 'array',
              description: 'At least two independent sources that confirm every fact in the post.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'url'],
                properties: { title: { type: 'string' }, url: { type: 'string' } },
              },
            },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
        },
      },
    },
  },
};

async function researchedDrafts(recentTexts) {
  const { Anthropic } = require('@anthropic-ai/sdk');
  const client = new Anthropic();
  const now = new Date();
  const dayMonth = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' });
  const year = Number(now.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'Europe/London' }));
  const system = 'You write posts for the X account of Apple Sunset (applesunset.com), a site that tracks how long it has been since each Apple product was refreshed or discontinued. Write in British English, in a friendly but neutral brand voice: no "I" or "my", and no hashtags, links or emoji in the post text (those are added later).';
  const prompt = [
    'Today is ' + dayMonth + ' ' + year + '. Write 3 posts:',
    '- 2 "On this day" posts about Apple product history: things that happened on ' + dayMonth + ' in earlier years (different years and different events). Start each with "On this day in YEAR, ".',
    '- 1 "Did you know?" post: a surprising, specific fact about an Apple product, past or present.',
    '',
    'Rules:',
    '- Use web search. Confirm every date, number and name in at least two independent, reliable sources (for example Apple Newsroom, Apple Support pages, major news outlets). Leave out anything you can\'t confirm. If you can\'t find two real events for ' + dayMonth + ', write fewer posts rather than stretching a date.',
    '- Each post must be 200 characters or fewer, spaces included.',
    '- Where you can, give each post one striking figure (a price, a count, a span of days or years): it becomes the big headline on the post\'s image card.',
    '- Don\'t repeat any of these recent posts:',
    recentTexts.length ? recentTexts.map((t) => '  - ' + t).join('\n') : '  (none yet)',
    '',
    'When you are done, call save_drafts once with the posts and their sources.',
  ].join('\n');

  const messages = [{ role: 'user', content: prompt }];
  for (let turn = 0; turn < 6; turn++) {
    // Streamed, so a long search doesn't hit a request timeout. "default"
    // fallbacks re-run a request a safety classifier declines on the model
    // Anthropic recommends for it, instead of returning nothing.
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high' },
      system,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 10 }, SAVE_TOOL],
      messages,
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error('Claude declined to write today’s posts.');
    const call = msg.content.find((b) => b.type === 'tool_use' && b.name === 'save_drafts');
    if (call) return (call.input && call.input.drafts) || [];
    messages.push({ role: 'assistant', content: msg.content });
    // A long web search pauses the turn: send it back to carry on.
    if (msg.stop_reason === 'pause_turn') continue;
    messages.push({ role: 'user', content: 'Please call save_drafts now with the posts you have confirmed.' });
  }
  throw new Error('Claude didn’t hand back any posts.');
}

// Same words, ignoring case, spacing and punctuation.
const sameText = (a, b) => String(a).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === String(b).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

exports.handler = async (event) => {
  // The morning job sends the site's own key; the admin sends the owner's login.
  const fromSchedule = internalKey() && (event.headers || {})['x-drafts-key'] === internalKey();
  if (!fromSchedule) {
    const denied = await ownerCheck(event);
    if (denied) { console.error('x-drafts refused:', denied.error); return; }
  }
  if (!SUPABASE_URL || !SERVICE_KEY) { console.error('x-drafts: Supabase is not configured.'); return; }

  const run = { at: new Date().toISOString(), site: 0, researched: 0, notes: [] };
  try {
    const products = (await rest('products?select=*')).map((p) => Object.assign({}, p, { name: FactsKit.appleName(p.name), category: FactsKit.appleName(p.category) }));
    FactsKit.setCardProducts(products);
    const since = new Date(Date.now() - 365 * 86400000).toISOString();
    const recent = await rest('x_drafts?select=kind,origin,text,link,created_at&created_at=gte.' + encodeURIComponent(since) + '&order=created_at.desc&limit=500');
    const fortnight = Date.now() - 14 * 86400000;
    // Not again: the same words within the year, or the same kind of post
    // about the same product within a fortnight (a wait's day count changes).
    const fresh = (d) => !recent.some((r) => sameText(r.text, d.text) ||
      (d.link && r.link === d.link && r.kind === d.kind && Date.parse(r.created_at) > fortnight));

    const drafts = siteDrafts(products).filter(fresh);
    run.site = drafts.length;

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const found = await researchedDrafts(recent.filter((r) => r.origin === 'claude').slice(0, 60).map((r) => r.text));
        found
          .map((d) => ({ kind: d.kind, text: String(d.text || '').trim(), sources: (d.sources || []).filter((s) => /^https?:\/\//i.test(s.url)), confidence: d.confidence }))
          .filter((d) => d.text && d.text.length <= 240 && d.sources.length >= 1 && d.confidence !== 'low')
          .map((d) => ({ kind: d.kind, origin: 'claude', text: d.text, link: null, sources: d.sources, card: cardFor(d.text) }))
          .filter(fresh)
          .forEach((d) => { drafts.push(d); run.researched += 1; });
      } catch (err) {
        console.error('x-drafts research failed:', err);
        run.notes.push('Researched posts failed: ' + err.message);
      }
    } else {
      run.notes.push('No researched posts: add ANTHROPIC_API_KEY in Netlify to have Claude write some.');
    }

    if (drafts.length) {
      await rest('x_drafts', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: drafts.map((d) => ({ kind: d.kind, origin: d.origin, text: d.text, link: d.link, sources: d.sources, card: d.card, status: 'new' })),
      });
    }
  } catch (err) {
    console.error('x-drafts failed:', err);
    run.notes.push('Drafts failed: ' + err.message);
  }
  // How the last run went, for the admin to show.
  try {
    await rest('site_content', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { id: 'x-drafts-run', body: JSON.stringify(run) } });
  } catch (err) {
    console.error('x-drafts could not record the run:', err.message);
  }
};
