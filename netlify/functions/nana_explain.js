// // netlify/functions/nana_explain.js
// import 'dotenv/config';
// import { JSDOM } from 'jsdom';
// import { Readability } from '@mozilla/readability';
// import { getStore } from '@netlify/blobs';

// // ---- config ----
// const TZ = 'America/Los_Angeles';
// const STORE_NAME = process.env.BLOBS_STORE || 'nana-explain';
// const OPENAI_API = 'https://api.openai.com/v1/chat/completions';
// const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';


// console.log('[blobs env]', {
//   SITE: !!process.env.NETLIFY_SITE_ID,
//   TOKEN_src: !!process.env.NETLIFY_AUTH_TOKEN || !!process.env.NETLIFY_BLOBS_TOKEN || !!process.env.NETLIFY_TOKEN,
//   SITE_len: (process.env.NETLIFY_SITE_ID || '').length,
//   TOKEN_len: (process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_TOKEN || '').length,
// });
// // ---- helpers ----
// function dateKey(d = new Date()) {
//   const fmt = new Intl.DateTimeFormat('en-CA', {
//     timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
//   });
//   return fmt.format(d); // YYYY-MM-DD (LA time)
// }

// async function getDocForDay(store, key) {
//   return (await store.getJSON(`${key}.json`)) || null;
// }
// async function putDocForDay(store, key, doc) {
//   await store.setJSON(`${key}.json`, doc);
// }

// async function extractReadable(url) {
//   // Node 18+: global fetch is available
//   const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
//   const html = await res.text();
//   const dom = new JSDOM(html, { url });
//   const reader = new Readability(dom.window.document);
//   const article = reader.parse();
//   const title = article?.title?.trim() || '';
//   const text  = article?.textContent?.replace(/\s+\n/g, '\n').trim() || '';
//   return { title, text };
// }

// function trimForModel(s, maxChars = 20000) {
//   if (!s) return '';
//   return s.length > maxChars ? s.slice(0, maxChars) + '\n…' : s;
// }

// async function nanaForArticle({ url, title, source, text }, values) {
//   const trimmed = trimForModel(text);
//   const grounding = (values && values.length)
//     ? values.join('; ')
//     : [
//         'human-centered design',
//         'rapid prototyping & iteration',
//         'storytelling impact',
//         'ethics (consent, attribution)',
//         'interoperability & open formats',
//         'accessibility & performance'
//       ].join('; ');

//   const system = `You are "Nana", a practical, plain-spoken mentor.
// Voice: warm, first-person, concise, no hype, no corporate jargon.
// Ground your take in the article’s details—don’t invent facts.
// Only suggest tools/experiments when they’re truly relevant and specific.
// Core values to lean on (without listing them): ${grounding}.`;

//   const user = `
// ARTICLE
// Title: ${title || '(untitled)'}
// Source: ${source || ''}
// URL: ${url}

// TEXT (full or near-full)
// ${trimmed || '(no body extracted — rely on title/URL and be cautious)'}

// TASK
// Return markdown in this exact shape:

// **Recap**
// - 4–8 bullet points, 10–18 words each.

// **Back in my day**
// Start the first sentence exactly with: “Back in my day we called this …”

// **Nana’s Take**
// 3–5 sentences, first person. If appropriate, up to two “You could…” suggestions.

// **Suggested Tools & Experiments (optional)**
// Only if the article implies a concrete workflow. 1–3 bullets.
// `;

//   const r = await fetch(OPENAI_API, {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
//     },
//     body: JSON.stringify({
//       model: MODEL,
//       temperature: 0.3,
//       max_tokens: 320,
//       messages: [
//         { role: 'system', content: system },
//         { role: 'user', content: user }
//       ]
//     })
//   });

//   if (!r.ok) throw new Error(`OpenAI API ${r.status}: ${await r.text()}`);
//   const data = await r.json();
//   return data?.choices?.[0]?.message?.content?.trim() || '(no output)';
// }

// // ---- handler ----
// export async function handler(event) {
//   try {
//     // Rely on Netlify’s injected context (works in prod & linked `netlify dev`)
//     const store = getStore(STORE_NAME);
//     const todayKey = dateKey();

//     // --- quick diagnostics: GET ?diag=1 writes/reads a tiny blob ---
//     if (event.httpMethod === 'GET' && new URLSearchParams(event.rawQuery || '').get('diag') === '1') {
//       await store.setJSON('diag.json', { ok: true, t: Date.now() });
//       const val = await store.getJSON('diag.json');
//       return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ diag: val }) };
//     }

//     // --- GET: fetch by date (or latest) ---
//     if (event.httpMethod === 'GET') {
//       const params = new URLSearchParams(event.rawQuery || '');
//       let key = params.get('date') || todayKey;

//       if (params.get('latest') === '1') {
//         const today = await getDocForDay(store, todayKey);
//         if (today) key = todayKey;
//         else { const y = new Date(); y.setDate(y.getDate() - 1); key = dateKey(y); }
//       }

//       const doc = await getDocForDay(store, key);
//       return {
//         statusCode: doc ? 200 : 404,
//         headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
//         body: JSON.stringify(doc || { error: 'not_found', date: key })
//       };
//     }

//     // --- POST: append new URLs/items to today's blob ---
//     if (event.httpMethod === 'POST') {
//       const { urls = [], items = [], values = [] } = JSON.parse(event.body || '{}');
//       const incoming = (items.length ? items : urls.map(u => ({ url: u })));
//       if (!incoming.length) {
//         return {
//           statusCode: 400,
//           headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
//           body: JSON.stringify({ error: 'Provide urls[] or items[]' })
//         };
//       }

//       const existing = (await getDocForDay(store, todayKey)) || {
//         date: todayKey,
//         timezone: TZ,
//         createdAt: new Date().toISOString(),
//         items: [],   // [{ url, title, md, source }]
//         combined: '' // compiled markdown
//       };

//       const seen = new Set(existing.items.map(i => i.url));

//       for (const it of incoming) {
//         const url = it.url;
//         if (!url || seen.has(url)) continue;

//         let title = it.title || '';
//         let text = '';
//         try {
//           const { title: t, text: tx } = await extractReadable(url);
//           title = title || t;
//           text  = tx;
//         } catch (e) {
//           console.warn('scrape fail:', url, e.message);
//         }

//         const md = await nanaForArticle({ url, title, source: it.source || '', text }, values);
//         existing.items.push({ url, title: title || url, md, source: it.source || '' });
//         seen.add(url);
//       }

//       existing.combined = [
//         `# Nana’s Take — ${existing.date}`,
//         '',
//         ...existing.items.map((o, i) => `## ${i + 1}. ${o.title}\n${o.url}\n\n${o.md}`)
//       ].join('\n');

//       existing.updatedAt = new Date().toISOString();
//       await putDocForDay(store, todayKey, existing);

//       return {
//         statusCode: 200,
//         headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
//         body: JSON.stringify({ date: todayKey, count: existing.items.length, items: existing.items, doc: existing.combined })
//       };
//     }

//     return { statusCode: 405, body: 'Use GET or POST' };

//   } catch (err) {
//     // If you see "MissingBlobsEnvironmentError" here, you are not inside a linked `netlify dev`
//     console.error('[nana_explain] error', err);
//     return {
//       statusCode: 500,
//       headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
//       body: JSON.stringify({
//         error: 'nana_explain_failed',
//         details: String(err?.message || err),
//         hint: 'Run with `netlify dev` in a linked project, or deploy. Do not pass manual tokens.'
//       })
//     };
//   }
// }
// netlify/functions/nana_explain.js
import { getStore } from "@netlify/blobs";
// If you already use these, keep them.
// import { JSDOM } from "jsdom";
// import { Readability } from "@mozilla/readability";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const STORE = getStore("project-blobs");             // or any name you prefer

export async function handler(event) {
  try {
    const qs = event.queryStringParameters || {};
    const force = qs.force === "true";
    // Optional: make the cache key topic-aware so different topics have separate caches
    const topic = (qs.topic || "default").trim().toLowerCase();
    const KEY = `nanas/take/${topic}/latest.json`;

    // 1) Check freshness via metadata
    const meta = await STORE.getMetadata(KEY).catch(() => null);
    const now = Date.now();
    const last = Number(meta?.metadata?.generatedAt || 0);
    const age = now - last;

    if (!force && last && age < ONE_DAY_MS) {
      const cached = await STORE.get(KEY, { type: "json" });
      if (cached) return json(200, { source: "cache", ageMs: age, ...cached });
    }

    // 2) Generate fresh content (use your existing generator here)
    const fresh = await generateNanasTake(qs); // <-- plug in your current logic

    const payload = {
      take: fresh.take,                 // your summary / “Nana’s take”
      articles: fresh.articles || [],   // any context you keep
      generatedAt: now,
      topic,
    };

    // 3) Save + set metadata so we can check age next time
    await STORE.set(KEY, payload, {
      metadata: { generatedAt: String(now) },
    });

    return json(200, { source: "fresh", ...payload });
  } catch (err) {
    return json(500, { error: err.message || String(err) });
  }
}

// --- Replace this with your current nana_explain generation code ---
async function generateNanasTake(qs) {
  // Call your scraper / Readability / OpenAI logic here and return:
  // { take: "text", articles: [{ title, url, ...}, ...] }
  return { take: "Placeholder Nana’s take — wire in your real code.", articles: [] };
}

function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
