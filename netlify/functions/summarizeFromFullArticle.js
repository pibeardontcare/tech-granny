// // netlify/functions/nana_summaries.js
// import { google } from 'googleapis';
// import { DateTime } from 'luxon';
// import OpenAI from 'openai';

// const TZ = 'America/New_York';
// const CUTOFF_HOUR = 6;
// const DAILY_FOLDER_NAME = 'Nana Daily';
// const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
// const MAX_CHARS = Number(process.env.NANA_MAX_CHARS || 8000);

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// // ---------- helpers ----------
// function nowET() { return DateTime.now().setZone(TZ); }
// function dailyKeyET(dt = nowET()) {
//   const cutoff = dt.set({ hour: CUTOFF_HOUR, minute: 0, second: 0, millisecond: 0 });
//   const effective = dt < cutoff ? dt.minus({ days: 1 }) : dt;
//   return effective.toFormat('yyyy-LL-dd');
// }
// function esc(s) { return String(s).replace(/'/g, "\\'"); }
// function summariesTitleFor(key) { return `Nana – Summaries & Perspectives — ${key}`; }

// function oauth() {
//   const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, OPENAI_API_KEY } = process.env;
//   if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) throw new Error('Missing Google env vars');
//   if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
//   const o = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
//   o.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
//   return o;
// }

// async function ensureFolder(drive, name = DAILY_FOLDER_NAME) {
//   const { data } = await drive.files.list({
//     q: `mimeType='application/vnd.google-apps.folder' and name='${esc(name)}' and trashed=false`,
//     fields: 'files(id,name)', spaces: 'drive', pageSize: 1,
//   });
//   if (data.files?.length) return data.files[0].id;
//   const { data: folder } = await drive.files.create({
//     requestBody: { name, mimeType: 'application/vnd.google-apps.folder' },
//     fields: 'id',
//   });
//   return folder.id;
// }



// /** Ensure a unique “Summaries & Perspectives” doc per day (by appProperties key) */
// async function ensureSummariesDoc(drive, docs, key) {
//   const parentId = process.env.NANA_FOLDER_ID || await ensureFolder(drive);
//   const title = summariesTitleFor(key);

//   // Look up by hidden key first
//   let { data } = await drive.files.list({
//     q: [
//       "mimeType='application/vnd.google-apps.document'",
//       "trashed=false",
//       `'${parentId}' in parents`,
//       `appProperties has { key='nanaSummariesKey' and value='${esc(key)}' }`,
//     ].join(' and '),
//     fields: 'files(id,name,appProperties,createdTime)', spaces: 'drive', pageSize: 10,
//   });
//   if (data.files?.length) {
//     data.files.sort((a,b) => new Date(a.createdTime) - new Date(b.createdTime));
//     return { id: data.files[0].id, created: false };
//   }

//   // Fallback by name (migration)
//   const byName = await drive.files.list({
//     q: [
//       "mimeType='application/vnd.google-apps.document'",
//       "trashed=false",
//       `'${parentId}' in parents`,
//       `name='${esc(title)}'`,
//     ].join(' and '),
//     fields: 'files(id,name,appProperties,createdTime)', spaces: 'drive', pageSize: 10,
//   });
//   if (byName.data.files?.length) {
//     const file = byName.data.files[0];
//     await drive.files.update({
//       fileId: file.id,
//       requestBody: { appProperties: { ...(file.appProperties || {}), nanaSummariesKey: key } },
//       fields: 'id',
//     });
//     return { id: file.id, created: false };
//   }

//   // Create new
//   const { data: created } = await drive.files.create({
//     requestBody: {
//       name: title,
//       mimeType: 'application/vnd.google-apps.document',
//       parents: [parentId],
//       appProperties: { nanaSummariesKey: key },
//     },
//     fields: 'id',
//   });

//   // Seed H1
//   await docs.documents.batchUpdate({
//     documentId: created.id,
//     requestBody: {
//       requests: [
//         { insertText: { location: { index: 1 }, text: `${title}\n\n` } },
//         {
//           updateParagraphStyle: {
//             range: { startIndex: 1, endIndex: 1 + title.length + 2 },
//             paragraphStyle: { namedStyleType: 'HEADING_1' },
//             fields: 'namedStyleType',
//           },
//         },
//       ],
//     },
//   });

//   return { id: created.id, created: true };
// }



// async function exportDocText(drive, docId) {
//   // Export Google Doc → text/plain
//   const res = await drive.files.export(
//     { fileId: docId, mimeType: 'text/plain' },
//     { responseType: 'text' }
//   );
//   return res.data || '';
// }

// // Pull each "**Summary** …" block that follows a "## Title" section.
// // Assumes your renderMarkdown format.
// function extractSummariesFromText(txt) {
//   const items = [];
//   const sectionRegex = /^##\s+(.*)\s*$/gm;
//   let m; const marks = [];
//   while ((m = sectionRegex.exec(txt)) !== null) {
//     marks.push({ title: (m[1] || '').trim(), index: m.index });
//   }
//   // sentinel
//   marks.push({ title: '__END__', index: txt.length });

//   for (let i = 0; i < marks.length - 1; i++) {
//     const { title, index } = marks[i];
//     const nextIndex = marks[i + 1].index;
//     const block = txt.slice(index, nextIndex);

//     const sumStart = block.indexOf('**Summary**');
//     if (sumStart === -1) { items.push({ title, summary: '' }); continue; }

//     const after = block.slice(sumStart + '**Summary**'.length);
//     const endMatch = after.search(/\n\*\*|^---/m);
//     const summaryRaw = endMatch === -1 ? after : after.slice(0, endMatch);
//     items.push({ title, summary: summaryRaw.trim() });
//   }
//   return items;
// }

// // Helper to add Nana-style transitions between stories
// function buildSegue(prevTitle, nextTitle, idx) {
//   const openers = [
//     "Alright darling,",
//     "Now then,",
//     "Okay sweet pea,",
//     "All right my dears,",
//     "Speaking of curious things,"
//   ];
//   const bridges = [
//     "that’s a lovely segue into",
//     "which nudges us nicely toward",
//     "and it pairs rather well with",
//     "and that sets the table for",
//     "and it reminds me to peek at"
//   ];
//   const flourishes = [
//     "let’s keep our eyes twinkling.",
//     "grab your tea—this is a good one.",
//     "mind the corners, this one turns quickly.",
//     "deep breath—this gets interesting.",
//     "scoot in closer, dear."
//   ];

//   const o = openers[Math.floor(Math.random() * openers.length)];
//   const b = bridges[Math.floor(Math.random() * bridges.length)];
//   const f = flourishes[Math.floor(Math.random() * flourishes.length)];

//   // First segue gets a slightly different rhythm
//   if (idx === 1) {
//     return `${o} that first one was a treat—${b} “${nextTitle}.” ${f}`;
//   }
//   return `${o} “${prevTitle}” ${b} “${nextTitle}.” ${f}`;
// }

// /// original summarize one

// // async function summarizeOne({ title, url, content }) {
// //   const safeContent = (content || '').slice(0, MAX_CHARS);

// //   const system = `You are Nana, a warm, witty grandmother who comments on technology and news
// // with playful asides from her past, little surprises, and an uplifting, human-centered angle.
// // Never call yourself creative or humble. Speak in plain, lively language, like you’re chatting
// // over tea.`;

// //   const user = `Please read this article and write a single engaging summary in Nana’s voice. 

// // Guidelines:
// // - Write in 1–3 short paragraphs (not bullet points).
// // - Bring in a personal aside once in a while (“When I was a girl…” / “This reminds me of…”).
// // - Sprinkle humor or wonder when appropriate, but keep it natural.
// // - End with a light encouragement for creative humans.
// // - Do NOT output 'Key Points' or labeled sections. Just flow as prose.

// // Title: ${title || "(Untitled)"}
// // Source: ${url}
// // Article text:
// // ${safeContent}`;

// //   const resp = await openai.chat.completions.create({
// //     model: MODEL,
// //     temperature: 0.6,
// //     messages: [{ role: "system", content: system }, { role: "user", content: user }],
// //   });

// //   const text = resp.choices?.[0]?.message?.content?.trim() || "";
// //   return { title, url, summary: text };
// // }


// async function summarizeOne({ title, url, content }) {
//   const safeContent = (content || '').slice(0, MAX_CHARS);

//   const system = `You are Nana, a warm, witty grandmother who comments on technology and news
// with playful asides from her past and an uplifting, human-centered angle. Keep it concise.`;

//   const user = `Read the article and return STRICT JSON with two keys:
// - "topic": a short noun phrase (3–7 words) capturing what this article is about.
// - "nana": 1–2 short paragraphs in Nana’s voice (no headings, no bullets, no title echoed).

// Return ONLY JSON.

// Title: ${title || "(Untitled)"}
// Source: ${url}
// Article text:
// ${safeContent}`;

//   const resp = await openai.chat.completions.create({
//     model: MODEL,
//     temperature: 0.6,
//     messages: [{ role: "system", content: system }, { role: "user", content: user }],
//   });

//   const raw = resp.choices?.[0]?.message?.content?.trim() || "{}";
//   let topic = "", nana = "";
//   try {
//     const obj = JSON.parse(raw);
//     topic = (obj.topic || "").toString().trim();
//     nana  = (obj.nana  || "").toString().trim();
//   } catch {
//     // Fallback: treat whole response as Nana's take
//     nana = raw;
//   }
//   return { title, url, topic, nana };
// }



// function introLine(item, isFirst=false) {
//   const patterns = [
//     `Here’s an article called “${item.title}.”`,
//     `This one is about ${item.topic || 'a timely topic'} — it’s titled “${item.title}.”`,
//   ];
//   // Prefer the more descriptive form after the first
//   return isFirst ? patterns[0] : patterns[Math.floor(Math.random() * patterns.length)];
// }

// async function buildSmartSegue(prevItem, nextItem) {
//   const system = `You are Nana, a warm, witty grandmother. Write one friendly bridging sentence.`;
//   const user = `Connect these two topics with ONE natural sentence in Nana’s voice.
// - Previous topic: ${prevItem.topic || prevItem.title}
// - Next topic: ${nextItem.topic || nextItem.title}

// Rules:
// - If there's no clear connection, respond exactly: "Here’s another one."
// - Do not mention the article titles.
// - One sentence only.`;

//   const resp = await openai.chat.completions.create({
//     model: MODEL,
//     temperature: 0.5,
//     messages: [{ role: "system", content: system }, { role: "user", content: user }],
//   });
//   const line = resp.choices?.[0]?.message?.content?.trim() || "Here’s another one.";
//   // Guardrail: ensure it's exactly one sentence-ish
//   return line.replace(/\s+/g, ' ').trim();
// }

// //old render markdown
// // function renderMarkdown(key, items) {
// //   const dt = DateTime.fromISO(key).toFormat('MMMM d, yyyy');

// //   let md = `# Nana’s Summaries & Perspectives — ${dt}\n\n`;
// //   md += `Good morning, dear—let’s peek at a few stories together. I’ll keep it cozy and clear.\n\n`;

// //   for (let i = 0; i < items.length; i++) {
// //     const it = items[i];

// //     if (i === 0) {
// //       // First item: a warm lead-in
// //       md += `**First up: ${it.title}.**\n\n`;
// //     } else {
// //       // Add a natural segue before each subsequent item
// //       const prevTitle = items[i - 1]?.title || "";
// //       md += buildSegue(prevTitle, it.title, i) + `\n\n**${it.title}.**\n\n`;
// //     }

// //     // Readable, TTS-friendly body (no URL)
// //     md += `${it.summary}\n\n---\n\n`;
// //   }

// //   // Gentle outro so TTS ends gracefully
// //   md += `That’s the lot for now, lovelies. Stretch your legs, sip your tea, and keep that bright mind humming.\n`;

// //   return md;
// // }



// function renderMarkdown(key, items, segues) {
//   const dt = DateTime.fromISO(key).toFormat('MMMM d, yyyy');

//   let md = `# Nana’s Summaries & Perspectives — ${dt}\n\n`;
//   md += `Good morning, dear—let’s peek at a few stories together. I’ll keep it cozy and clear.\n\n`;

//   for (let i = 0; i < items.length; i++) {
//     const it = items[i];
//     const intro = introLine(it, i === 0);

//     md += `${intro}\n\n${it.nana}\n`;
//     if (i < items.length - 1) {
//       md += `\n${segues[i] || "Here’s another one."}\n\n---\n\n`;
//     } else {
//       md += `\n\n`;
//     }
//   }

//   md += `That’s the lot for now, lovelies. Stretch your legs, sip your tea, and keep that bright mind humming.\n`;
//   return md;
// }

// function safeEndIndex(doc) {
//   const content = doc?.body?.content;
//   if (!Array.isArray(content) || content.length === 0) return 1;
//   const last = content[content.length - 1];
//   return (typeof last?.endIndex === 'number') ? last.endIndex : 1;
// }

// function cors() {
//   return {
//     'Access-Control-Allow-Origin': '*',
//     'Access-Control-Allow-Headers': 'Content-Type',
//     'Access-Control-Allow-Methods': 'POST,OPTIONS',
//   };
// }
// function json(status, obj) {
//   return { statusCode: status, headers: { 'Content-Type': 'application/json', ...cors() }, body: JSON.stringify(obj) };
// }



// // ---------- route ----------
// export async function handler(event) {
//   try {
//     if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };
//     if (event.httpMethod !== 'POST') return json(405, { ok:false, error:'Method Not Allowed' });

//     let body;
//     try { body = JSON.parse(event.body || '{}'); }
//     catch { return json(400, { ok:false, error:'Invalid JSON body' }); }

//     // Accept {articles:[...]} or {results:[...]}
//     const itemsIn = body.articles || body.results || [];
//     if (!Array.isArray(itemsIn) || !itemsIn.length) {
//       return json(400, { ok:false, error:'No articles/results provided' });
//     }

//     const key = dailyKeyET();
//     const auth = oauth();
//     await auth.getAccessToken();

//     const drive = google.drive({ version: 'v3', auth });
//     const docs  = google.docs({ version: 'v1', auth });

//     // Ensure/find today's doc and check if already done
//     const { id: docId } = await ensureSummariesDoc(drive, docs, key);
//     const { data: meta } = await drive.files.get({ fileId: docId, fields: 'appProperties,webViewLink' });

//     // Early exit: already done today → client can start TTS immediately
//    // Early exit: already done today → return summaries for immediate TTS
//         if (meta.appProperties?.nanaSummariesDone === 'true') {
//         const plain = await exportDocText(drive, docId);
//         const items = extractSummariesFromText(plain);

//         return json(200, {
//             ok: true,
//             already: true,
//             url: meta.webViewLink,
//             playNow: true,
//             itemsCount: items.length,
//             items
//         });
//         }



//         // Summarize each article
//       const items = [];
//         for (const a of itemsIn) {
//           const title = a.title || 'Untitled';
//           const url = a.url || '';
//           const content = (a.content || a.fullText || '').toString();
//         if (!content.trim()) {
//         items.push({ title, url, topic: '', nana: '', error: 'No content' });
//         continue;
//           }
//         try {
//         const s = await summarizeOne({ title, url, content });
//         console.log(`\n=== Nana’s Take (${s.title}) ===\n${s.nana}\n===============================\n`);
//         items.push(s);
//       } catch (e) {
//         items.push({ title, url, topic: '', nana: '', error: e.message });
//       }
// }

// // Build segues between consecutive items
// const segues = [];
// for (let i = 0; i < items.length - 1; i++) {
//   segues[i] = await buildSmartSegue(items[i], items[i + 1]);
// }

// // Compose speech blocks per item (intro + nana + segue (if any))
// const itemsOut = items.map((it, i) => {
//   const intro = introLine(it, i === 0);
//   const tail  = (i < items.length - 1) ? `\n\n${segues[i]}` : '';
//   const speech = `${intro}\n\n${it.nana}${tail}`.trim();
//   return {
//     title: it.title,
//     topic: it.topic,
//     speech,          // preferred for playback
//     summary: speech, // backward compat with existing client
//   };
// });



//     // // Summarize each article
//     // const items = [];
//     // for (const a of itemsIn) {
//     //   const title = a.title || 'Untitled';
//     //   const url = a.url || '';
//     //   const content = (a.content || a.fullText || '').toString();
//     //   if (!content.trim()) {
//     //     items.push({ title, url, error: 'No content' });
//     //     continue;
//     //   }
//     //   try {
//     //     const s = await summarizeOne({ title, url, content });

//     //     // Debug print to function logs so you can see them immediately
//     //     console.log(`\n=== Nana’s Summary (${s.title}) ===\n`);
//     //     console.log(s.summary);
//     //     console.log("\n===============================\n");

//     //     items.push(s);
//     //   } catch (e) {
//     //     items.push({ title, url, summary: '', error: e.message });
//     //   }
//     // }


    

//     // Write to Google Docs
//     const { data: existing } = await docs.documents.get({ documentId: docId });
//     const endIndex = safeEndIndex(existing);
//     const md = renderMarkdown(key, items);

//     await docs.documents.batchUpdate({
//       documentId: docId,
//       requestBody: { requests: [{ insertText: { location: { index: endIndex - 1 }, text: md } }] },
//     });

//     // Mark as done so it only runs once/day
//     await drive.files.update({
//       fileId: docId,
//       requestBody: { appProperties: { ...(meta.appProperties || {}), nanaSummariesDone: 'true' } },
//       fields: 'id',
//     });

//     const { data: link } = await drive.files.get({ fileId: docId, fields: 'webViewLink' });
//     return json(200, { ok:true, url: link.webViewLink, itemsCount: items.length, items });

//   } catch (e) {
//     return json(500, { ok:false, error: e?.message || String(e) });
//   }
// }
// netlify/functions/nana_summaries.js
import { google } from 'googleapis';
import { DateTime } from 'luxon';
import OpenAI from 'openai';

const TZ = 'America/New_York';
const CUTOFF_HOUR = 6;
const DAILY_FOLDER_NAME = 'Nana Daily';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_CHARS = Number(process.env.NANA_MAX_CHARS || 8000);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- helpers ----------
function nowET() { return DateTime.now().setZone(TZ); }
function dailyKeyET(dt = nowET()) {
  const cutoff = dt.set({ hour: CUTOFF_HOUR, minute: 0, second: 0, millisecond: 0 });
  const effective = dt < cutoff ? dt.minus({ days: 1 }) : dt;
  return effective.toFormat('yyyy-LL-dd');
}
function esc(s) { return String(s).replace(/'/g, "\\'"); }
function summariesTitleFor(key) { return `Nana – Summaries & Perspectives — ${key}`; }

function oauth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, OPENAI_API_KEY } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) throw new Error('Missing Google env vars');
  if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
  const o = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  o.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return o;
}

async function ensureFolder(drive, name = DAILY_FOLDER_NAME) {
  const { data } = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${esc(name)}' and trashed=false`,
    fields: 'files(id,name)', spaces: 'drive', pageSize: 1,
  });
  if (data.files?.length) return data.files[0].id;
  const { data: folder } = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return folder.id;
}

/** Ensure a unique “Summaries & Perspectives” doc per day (by appProperties key) */
async function ensureSummariesDoc(drive, docs, key) {
  const parentId = process.env.NANA_FOLDER_ID || await ensureFolder(drive);
  const title = summariesTitleFor(key);

  // Look up by hidden key first
  let { data } = await drive.files.list({
    q: [
      "mimeType='application/vnd.google-apps.document'",
      "trashed=false",
      `'${parentId}' in parents`,
      `appProperties has { key='nanaSummariesKey' and value='${esc(key)}' }`,
    ].join(' and '),
    fields: 'files(id,name,appProperties,createdTime)', spaces: 'drive', pageSize: 10,
  });
  if (data.files?.length) {
    data.files.sort((a,b) => new Date(a.createdTime) - new Date(b.createdTime));
    return { id: data.files[0].id, created: false };
  }

  // Fallback by name (migration)
  const byName = await drive.files.list({
    q: [
      "mimeType='application/vnd.google-apps.document'",
      "trashed=false",
      `'${parentId}' in parents`,
      `name='${esc(title)}'`,
    ].join(' and '),
    fields: 'files(id,name,appProperties,createdTime)', spaces: 'drive', pageSize: 10,
  });
  if (byName.data.files?.length) {
    const file = byName.data.files[0];
    await drive.files.update({
      fileId: file.id,
      requestBody: { appProperties: { ...(file.appProperties || {}), nanaSummariesKey: key } },
      fields: 'id',
    });
    return { id: file.id, created: false };
  }

  // Create new
  const { data: created } = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: 'application/vnd.google-apps.document',
      parents: [parentId],
      appProperties: { nanaSummariesKey: key },
    },
    fields: 'id',
  });

  // Seed H1
  await docs.documents.batchUpdate({
    documentId: created.id,
    requestBody: {
      requests: [
        { insertText: { location: { index: 1 }, text: `${title}\n\n` } },
        {
          updateParagraphStyle: {
            range: { startIndex: 1, endIndex: 1 + title.length + 2 },
            paragraphStyle: { namedStyleType: 'HEADING_1' },
            fields: 'namedStyleType',
          },
        },
      ],
    },
  });

  return { id: created.id, created: true };
}

async function exportDocText(drive, docId) {
  const res = await drive.files.export(
    { fileId: docId, mimeType: 'text/plain' },
    { responseType: 'text' }
  );
  return res.data || '';
}

// NEW: split the doc’s narration into TTS-ready blocks
function extractNarrationBlocks(txt) {
  // drop the first H1 line if present
  txt = txt.replace(/^# .*\n+/, '');
  // blocks are separated by the line with --- that you write in renderMarkdown
  return txt.split(/\n---\n/g).map(s => s.trim()).filter(Boolean);
}

// Helper to add Nana-style transitions between stories (may be unused now)
function buildSegue(prevTitle, nextTitle, idx) {
  const openers = [
    "Alright darling,",
    "Now then,",
    "Okay sweet pea,",
    "All right my dears,",
    "Speaking of curious things,"
  ];
  const bridges = [
    "that’s a lovely segue into",
    "which nudges us nicely toward",
    "and it pairs rather well with",
    "and that sets the table for",
    "and it reminds me to peek at"
  ];
  const flourishes = [
    "let’s keep our eyes twinkling.",
    "grab your tea—this is a good one.",
    "mind the corners, this one turns quickly.",
    "deep breath—this gets interesting.",
    "scoot in closer, dear."
  ];

  const o = openers[Math.floor(Math.random() * openers.length)];
  const b = bridges[Math.floor(Math.random() * bridges.length)];
  const f = flourishes[Math.floor(Math.random() * flourishes.length)];

  if (idx === 1) return `${o} that first one was a treat—${b} “${nextTitle}.” ${f}`;
  return `${o} “${prevTitle}” ${b} “${nextTitle}.” ${f}`;
}

async function summarizeOne({ title, url, content }) {
  const safeContent = (content || '').slice(0, MAX_CHARS);

  const system = `You are Nana, a warm, witty grandmother who comments on technology and news
with playful asides from her past and an uplifting, human-centered angle. Keep it concise.`;

  const user = `Read the article and return STRICT JSON with two keys:
- "topic": a short noun phrase (3–7 words) capturing what this article is about.
- "nana": 1–2 short paragraphs in Nana’s voice (no headings, no bullets, no title echoed).

Return ONLY JSON.

Title: ${title || "(Untitled)"}
Source: ${url}
Article text:
${safeContent}`;

  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.6,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });

  const raw = resp.choices?.[0]?.message?.content?.trim() || "{}";
  let topic = "", nana = "";
  try {
    const obj = JSON.parse(raw);
    topic = (obj.topic || "").toString().trim();
    nana  = (obj.nana  || "").toString().trim();
  } catch {
    nana = raw;
  }
  return { title, url, topic, nana };
}

function introLine(item, isFirst=false) {
  const patterns = [
    `Here’s an article called “${item.title}.”`,
    `This one is about ${item.topic || 'a timely topic'} — it’s titled “${item.title}.”`,
  ];
  return isFirst ? patterns[0] : patterns[Math.floor(Math.random() * patterns.length)];
}

async function buildSmartSegue(prevItem, nextItem) {
  const system = `You are Nana, a warm, witty grandmother. Write one friendly bridging sentence.`;
  const user = `Connect these two topics with ONE natural sentence in Nana’s voice.
- Previous topic: ${prevItem.topic || prevItem.title}
- Next topic: ${nextItem.topic || nextItem.title}

Rules:
- If there's no clear connection, respond exactly: "Here’s another one."
- Do not mention the article titles.
- One sentence only.`;

  const resp = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.5,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
  const line = resp.choices?.[0]?.message?.content?.trim() || "Here’s another one.";
  return line.replace(/\s+/g, ' ').trim();
}

function renderMarkdown(key, items, segues) {
  const dt = DateTime.fromISO(key).toFormat('MMMM d, yyyy');

  let md = `# Nana’s Summaries & Perspectives — ${dt}\n\n`;
  md += `Good morning, dear—let’s peek at a few stories together. I’ll keep it cozy and clear.\n\n`;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const intro = introLine(it, i === 0);

    md += `${intro}\n\n${it.nana}\n`;
    if (i < items.length - 1) {
      md += `\n${segues[i] || "Here’s another one."}\n\n---\n\n`;
    } else {
      md += `\n\n`;
    }
  }

  md += `That’s the lot for now, lovelies. Stretch your legs, sip your tea, and keep that bright mind humming.\n`;
  return md;
}

function safeEndIndex(doc) {
  const content = doc?.body?.content;
  if (!Array.isArray(content) || content.length === 0) return 1;
  const last = content[content.length - 1];
  return (typeof last?.endIndex === 'number') ? last.endIndex : 1;
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };
}
function json(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', ...cors() }, body: JSON.stringify(obj) };
}

// ---------- route ----------
export async function handler(event) {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };
    if (event.httpMethod !== 'POST') return json(405, { ok:false, error:'Method Not Allowed' });

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return json(400, { ok:false, error:'Invalid JSON body' }); }

    // Accept {articles:[...]} or {results:[...]}
    const itemsIn = body.articles || body.results || [];
    if (!Array.isArray(itemsIn) || !itemsIn.length) {
      return json(400, { ok:false, error:'No articles/results provided' });
    }

    const key = dailyKeyET();
    const auth = oauth();
    await auth.getAccessToken();

    const drive = google.drive({ version: 'v3', auth });
    const docs  = google.docs({ version: 'v1', auth });

    // Ensure/find today's doc and check if already done
    const { id: docId } = await ensureSummariesDoc(drive, docs, key);
    const { data: meta } = await drive.files.get({ fileId: docId, fields: 'appProperties,webViewLink' });

    // Early exit: already done → return narration blocks for immediate TTS
    if (meta.appProperties?.nanaSummariesDone === 'true') {
      const plain = await exportDocText(drive, docId);
      const blocks = extractNarrationBlocks(plain);
      const items = blocks.map(b => ({ title: '', topic: '', speech: b, summary: b }));
      return json(200, {
        ok: true,
        already: true,
        url: meta.webViewLink,
        playNow: true,
        itemsCount: items.length,
        items
      });
    }

    // Summarize each article
    const items = [];
    for (const a of itemsIn) {
      const title = a.title || 'Untitled';
      const url = a.url || '';
      const content = (a.content || a.fullText || '').toString();
      if (!content.trim()) {
        items.push({ title, url, topic: '', nana: '', error: 'No content' });
        continue;
      }
      try {
        const s = await summarizeOne({ title, url, content });
        console.log(`\n=== Nana’s Take (${s.title}) ===\n${s.nana}\n===============================\n`);
        items.push(s);
      } catch (e) {
        items.push({ title, url, topic: '', nana: '', error: e.message });
      }
    }

    // Build segues between consecutive items
    const segues = [];
    for (let i = 0; i < items.length - 1; i++) {
      segues[i] = await buildSmartSegue(items[i], items[i + 1]);
    }

    // Compose speech blocks per item (intro + nana + segue (if any))
    const itemsOut = items.map((it, i) => {
      const intro = introLine(it, i === 0);
      const tail  = (i < items.length - 1) ? `\n\n${segues[i]}` : '';
      const speech = `${intro}\n\n${it.nana}${tail}`.trim();
      return {
        title: it.title,
        topic: it.topic,
        speech,
        summary: speech, // backward compat
      };
    });

    // Write to Google Docs
    const { data: existing } = await docs.documents.get({ documentId: docId });
    const endIndex = safeEndIndex(existing);
    const md = renderMarkdown(key, items, segues);

    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests: [{ insertText: { location: { index: endIndex - 1 }, text: md } }] },
    });

    // Mark as done so it only runs once/day
    await drive.files.update({
      fileId: docId,
      requestBody: { appProperties: { ...(meta.appProperties || {}), nanaSummariesDone: 'true' } },
      fields: 'id',
    });

    const { data: link } = await drive.files.get({ fileId: docId, fields: 'webViewLink' });
    return json(200, {
      ok: true,
      url: link.webViewLink,
      itemsCount: itemsOut.length,
      items: itemsOut
    });

  } catch (e) {
    return json(500, { ok:false, error: e?.message || String(e) });
  }
}
