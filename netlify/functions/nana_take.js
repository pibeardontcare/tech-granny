// // netlify/functions/nana_take.js
// import { google } from 'googleapis';
// import { DateTime } from 'luxon';
// import OpenAI from 'openai';

// const TZ = 'America/New_York';
// const CUTOFF_HOUR = 6;
// const DAILY_FOLDER_NAME = 'Nana Daily';          // same folder you used for daily docs
// const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'; // set via env if you like

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// function nowET() { return DateTime.now().setZone(TZ); }
// function dailyKeyET(dt = nowET()) {
//   const cutoff = dt.set({ hour: CUTOFF_HOUR, minute: 0, second: 0, millisecond: 0 });
//   const effective = dt < cutoff ? dt.minus({ days: 1 }) : dt;
//   return effective.toFormat('yyyy-LL-dd');
// }
// function docTitleFor(key) { return `Nana – ${key}`; }
// function esc(s) { return String(s).replace(/'/g, "\\'"); }

// function oauth() {
//   const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
//   if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
//     throw new Error('Missing Google env vars');
//   }
//   const o = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
//   o.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
//   return o;
// }

// async function ensureFolder(drive, name = DAILY_FOLDER_NAME) {
//   const { data } = await drive.files.list({
//     q: `mimeType='application/vnd.google-apps.folder' and name='${esc(name)}' and trashed=false`,
//     fields: 'files(id,name)',
//     pageSize: 1,
//     spaces: 'drive',
//   });
//   if (data.files?.length) return data.files[0].id;
//   const { data: folder } = await drive.files.create({
//     requestBody: { name, mimeType: 'application/vnd.google-apps.folder' },
//     fields: 'id',
//   });
//   return folder.id;
// }

// // Find the daily doc by appProperties (set by your creation fn) or fall back to name
// async function findDailyDoc(drive, docs, key) {
//   const parentId = process.env.NANA_FOLDER_ID || await ensureFolder(drive);
//   // Prefer the hidden key
//   let { data } = await drive.files.list({
//     q: [
//       "mimeType='application/vnd.google-apps.document'",
//       "trashed=false",
//       `'${parentId}' in parents`,
//       `appProperties has { key='nanaDailyKey' and value='${esc(key)}' }`,
//     ].join(' and '),
//     fields: 'files(id,name,appProperties,createdTime)',
//     pageSize: 10,
//     spaces: 'drive',
//   });
//   if (data.files?.length) return data.files[0];

//   // Fallback by title if key not present
//   const title = docTitleFor(key);
//   const byName = await drive.files.list({
//     q: [
//       "mimeType='application/vnd.google-apps.document'",
//       "trashed=false",
//       `'${parentId}' in parents`,
//       `name='${esc(title)}'`,
//     ].join(' and '),
//     fields: 'files(id,name,appProperties,createdTime)',
//     pageSize: 10,
//     spaces: 'drive',
//   });
//   return byName.data.files?.[0] || null;
// }

// function flattenDocText(doc) {
//   const out = [];
//   for (const c of doc?.body?.content || []) {
//     if (!c.paragraph?.elements) continue;
//     for (const e of c.paragraph.elements) {
//       if (e.textRun?.content) out.push(e.textRun.content);
//     }
//   }
//   return out.join('');
// }

// // Your articles are stored like:
// // ## Title
// // https://link
// //
// // full text
// //
// // ---
// //
// // Robustly split on the divider
// function parseArticlesFromText(text) {
//   const parts = text.split(/\r?\n\s*---\s*\r?\n/g);
//   const items = [];
//   for (const raw of parts) {
//     const lines = raw.split(/\r?\n/).map(s => s.trim());
//     if (!lines.length) continue;

//     // find the '## ' heading
//     const hIdx = lines.findIndex(l => l.startsWith('## '));
//     if (hIdx === -1) continue;

//     const title = lines[hIdx].replace(/^##\s*/, '').trim() || 'Untitled';
//     const urlLine = lines[hIdx + 1] || '';
//     const url = /^https?:\/\//i.test(urlLine) ? urlLine : '';

//     // content = everything after the blank line following URL (or after title if no URL)
//     const contentStart = url ? hIdx + 3 : hIdx + 1;
//     const content = lines.slice(contentStart).join('\n').trim();
//     if (!content) continue;

//     items.push({ title, url, content });
//   }
//   return items;
// }

// // Safety for empty docs when computing endIndex
// function safeEndIndex(doc) {
//   const content = doc?.body?.content;
//   if (!Array.isArray(content) || content.length === 0) return 1;
//   const last = content[content.length - 1];
//   return (typeof last?.endIndex === 'number') ? last.endIndex : 1;
// }

// // Summarize one article with calm, evidence-based tone
// async function summarizeOne({ title, url, content }) {
//   const sys = [
//     "You are Nana — a calm, evidence-based editor.",
//     "Explain clearly, avoid hype, and create calm even for hard topics (e.g., layoffs).",
//     "Be concise but cover all major points; suggest practical, creative ways to use the info.",
//     "Return strict JSON with keys: title, url, summary, key_points (array), nana_take, ideas (array).",
//   ].join(' ');

//   const user = [
//     `TITLE: ${title}`,
//     url ? `URL: ${url}` : '',
//     'ARTICLE:',
//     content,
//   ].join('\n');

//   // JSON-mode keeps output valid JSON
//   const resp = await openai.chat.completions.create({
//     model: MODEL,
//     temperature: 0.3,
//     response_format: { type: 'json_object' },        // JSON output mode
//     messages: [
//       { role: 'system', content: sys },
//       {
//         role: 'user',
//         content: `Summarize faithfully, then provide Nana's take and ideas.\nReturn JSON only.\n\n${user}`
//       },
//     ],
//   });

//   const txt = resp.choices?.[0]?.message?.content || '{}';
//   const obj = JSON.parse(txt);
//   // Ensure required fields
//   return {
//     title: obj.title || title,
//     url: obj.url || url || '',
//     summary: obj.summary || '',
//     key_points: Array.isArray(obj.key_points) ? obj.key_points : [],
//     nana_take: obj.nana_take || '',
//     ideas: Array.isArray(obj.ideas) ? obj.ideas : [],
//   };
// }

// function renderMarkdown(key, items) {
//   const dt = DateTime.fromISO(key).toFormat('MMMM d, yyyy');
//   let md = `# Nana’s Calm Summary — ${dt}\n\n`;
//   for (const it of items) {
//     md += `## ${it.title}\n`;
//     if (it.url) md += `${it.url}\n\n`;
//     md += `**Summary**\n${it.summary}\n\n`;
//     if (it.key_points?.length) {
//       md += `**Key Points**\n`;
//       for (const k of it.key_points) md += `- ${k}\n`;
//       md += `\n`;
//     }
//     md += `**Nana’s Take**\n${it.nana_take}\n\n`;
//     if (it.ideas?.length) {
//       md += `**Ideas to Use This**\n`;
//       for (const idea of it.ideas) md += `- ${idea}\n`;
//       md += `\n`;
//     }
//     md += `---\n\n`;
//   }
//   return md;
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

// export async function handler(event) {
//   try {
//     if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };
//     // You can POST with empty body; we read the Daily Doc ourselves
//     if (event.httpMethod !== 'POST') return json(405, { ok:false, error:'Method Not Allowed' });

//     if (!process.env.OPENAI_API_KEY) return json(500, { ok:false, error:'Missing OPENAI_API_KEY' });

//     const key = dailyKeyET();
//     const auth = oauth();
//     await auth.getAccessToken();

//     const drive = google.drive({ version: 'v3', auth });
//     const docs  = google.docs({ version: 'v1', auth });

//     // Locate today’s doc
//     const file = await findDailyDoc(drive, docs, key);
//     if (!file) return json(404, { ok:false, error:'Daily Doc not found' });

//     // Idempotency: if we've already appended Nana’s Calm Summary, skip
//     const appProps = file.appProperties || {};
//     if (appProps.nanaTakeDone === 'true') {
//       const { data: link } = await drive.files.get({ fileId: file.id, fields: 'webViewLink' });
//       return json(200, { ok:true, url: link.webViewLink, already: true, message: 'Nana’s summary already exists for today.' });
//     }

//     // Read, parse articles
//     const { data: existing } = await docs.documents.get({ documentId: file.id });
//     const plain = flattenDocText(existing);
//     const articles = parseArticlesFromText(plain);
//     if (!articles.length) return json(200, { ok:true, added:0, message:'No articles found to summarize.' });

//     // Summarize each article (sequential for simplicity; small N per day)
//     const items = [];
//     for (const a of articles) {
//       try {
//         items.push(await summarizeOne(a));
//       } catch (e) {
//         // If one fails, keep going
//         items.push({
//           title: a.title,
//           url: a.url,
//           summary: 'Summary failed.',
//           key_points: [],
//           nana_take: 'Unable to generate take for this article.',
//           ideas: [],
//         });
//       }
//     }

//     // Append to the Doc
//     const endIndex = safeEndIndex(existing);
//     const md = renderMarkdown(key, items);
//     await docs.documents.batchUpdate({
//       documentId: file.id,
//       requestBody: { requests: [{ insertText: { location: { index: endIndex - 1 }, text: md } }] },
//     });

//     // Mark as done so it only runs once/day
//     await drive.files.update({
//       fileId: file.id,
//       requestBody: { appProperties: { ...(file.appProperties || {}), nanaTakeDone: 'true' } },
//       fields: 'id',
//     });

//     const { data: link } = await drive.files.get({ fileId: file.id, fields: 'webViewLink' });
//     return json(200, { ok:true, url: link.webViewLink, itemsCount: items.length, title: docTitleFor(key) });

//   } catch (e) {
//     return json(500, { ok:false, error: e?.message || String(e) });
//   }
// }


// async function exportDocText(drive, docId) {
//   const res = await drive.files.export(
//     { fileId: docId, mimeType: 'text/plain' },
//     { responseType: 'text' }
//   );
//   return res.data || '';
// }

// function extractSummariesFromText(txt) {
//   const items = [];
//   const sectionRegex = /^##\s+(.*)\s*$/gm;
//   let m; const indices = [];

//   while ((m = sectionRegex.exec(txt)) !== null) {
//     indices.push({ title: m[1].trim(), index: m.index });
//   }
//   indices.push({ title: '__END__', index: txt.length });

//   for (let i = 0; i < indices.length - 1; i++) {
//     const { title, index } = indices[i];
//     const nextIndex = indices[i + 1].index;
//     const block = txt.slice(index, nextIndex);

//     const urlMatch = block.match(/^\s*(https?:\/\/\S+)\s*$/m);
//     const url = urlMatch ? urlMatch[1] : '';

//     const sumStart = block.indexOf('**Summary**');
//     if (sumStart === -1) { items.push({ title, url, summary: '' }); continue; }

//     const after = block.slice(sumStart + '**Summary**'.length);
//     const endIdx = after.search(/\n\*\*|^\s*---\s*$/m);
//     const summary = (endIdx === -1 ? after : after.slice(0, endIdx)).trim();

//     items.push({ title, url, summary });
//   }
//   return items;
// }
