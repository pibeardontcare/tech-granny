

import { google } from 'googleapis';
import { DateTime } from 'luxon';

const TZ = 'America/New_York';
const CUTOFF_HOUR = 6;

function nowET() { return DateTime.now().setZone(TZ); }
function dailyKeyET(dt = nowET()) {
  const cutoff = dt.set({ hour: CUTOFF_HOUR, minute: 0, second: 0, millisecond: 0 });
  const effective = dt < cutoff ? dt.minus({ days: 1 }) : dt;
  return effective.toFormat('yyyy-LL-dd');
}
function docTitleFor(key) { return `Nana – ${key}`; }

function oauth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Missing Google env vars');
  }
  const o = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  o.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return o;
}

// Find/create the daily doc
async function ensureDailyDoc(drive, docs, title) {
  const { data } = await drive.files.list({
    q: [
      "mimeType = 'application/vnd.google-apps.document'",
      `name = '${title.replace(/'/g, "\\'")}'`,
      "trashed = false",
    ].join(' and '),
    fields: 'files(id,name)',
    pageSize: 1,
    spaces: 'drive',
  });
  if (data.files?.length) return data.files[0].id;

  const created = await drive.files.create({
    requestBody: { name: title, mimeType: 'application/vnd.google-apps.document' },
    fields: 'id',
  });

  await docs.documents.batchUpdate({
    documentId: created.data.id,
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
  return created.data.id;
}

// Scrape all URLs already present in the doc (from link styles or plain text)
function collectDocUrls(doc) {
  const urls = new Set();
  const re = /https?:\/\/\S+/g;
  const content = doc?.body?.content || [];
  for (const blk of content) {
    const p = blk.paragraph;
    if (!p?.elements) continue;
    for (const el of p.elements) {
      const tr = el.textRun;
      if (!tr) continue;
      if (tr.textStyle?.link?.url) urls.add(tr.textStyle.link.url.trim());
      const text = tr.content || '';
      const matches = text.match(re);
      if (matches) {
        for (let u of matches) {
          // strip trailing punctuation/brackets
          u = u.replace(/[)\]\s]+$/, '');
          urls.add(u);
        }
      }
    }
  }
  return urls;
}

function formatBlocks(articles) {
  const sep = '\n\n---\n\n';
  const blocks = articles.map(a => {
    const t = a.title || 'Untitled';
    const u = a.url ? `${a.url}\n\n` : '';
    const c = a.content || a.fullText || '';
    return `## ${t}\n${u}${c}\n`;
  });
  return blocks.join(sep) + '\n';
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

export async function handler(event) {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method Not Allowed' });

    const body = JSON.parse(event.body || '{}');
    let { articles } = body; // [{title,url,content/fullText}]
    if (!Array.isArray(articles) || !articles.length) return json(400, { ok: false, error: 'No articles' });

    // Normalize and drop empties
    articles = articles
      .map(a => ({ title: a.title || 'Untitled', url: a.url || '', content: a.content || a.fullText || '' }))
      .filter(a => a.content.trim().length > 0);

    const key = dailyKeyET();
    const title = docTitleFor(key);

    const auth = oauth();
    await auth.getAccessToken(); // early fail if creds bad

    const drive = google.drive({ version: 'v3', auth });
    const docs  = google.docs({ version: 'v1', auth });

    const docId = await ensureDailyDoc(drive, docs, title);

    // Read existing doc and collect URLs to dedup
    const { data: existing } = await docs.documents.get({ documentId: docId });
    const seen = collectDocUrls(existing);

    const toAppend = articles.filter(a => a.url ? !seen.has(a.url) : true);
    if (!toAppend.length) return json(200, { ok: true, added: 0, skipped: articles.length, message: 'Nothing new to add', title });

    // Append at end
    const endIndex = existing.body.content.slice(-1)[0].endIndex;
    const text = formatBlocks(toAppend);

    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests: [{ insertText: { location: { index: endIndex - 1 }, text } }] },
    });

    const { data: file } = await drive.files.get({ fileId: docId, fields: 'webViewLink' });
    return json(200, { ok: true, url: file.webViewLink, added: toAppend.length, skipped: articles.length - toAppend.length, title });

  } catch (e) {
    return json(500, { ok: false, error: e.message });
  }
}
