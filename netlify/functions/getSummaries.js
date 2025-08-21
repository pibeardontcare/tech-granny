///reads summaries if they exists in google drive


import { google } from 'googleapis';
import { DateTime } from 'luxon';

const TZ = 'America/New_York';
const CUTOFF_HOUR = 6;
const DAILY_FOLDER_NAME = 'Nana Daily';

function nowET() { return DateTime.now().setZone(TZ); }
function dailyKeyET(dt = nowET()) {
  const cutoff = dt.set({ hour: CUTOFF_HOUR, minute: 0, second: 0, millisecond: 0 });
  const effective = dt < cutoff ? dt.minus({ days: 1 }) : dt;
  return effective.toFormat('yyyy-LL-dd');
}
function summariesTitleFor(key) { return `Nana – Summaries & Perspectives — ${key}`; }
function esc(s){ return String(s).replace(/'/g, "\\'"); }

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

function oauth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) throw new Error('Missing Google env vars');
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
  return null; // read-only: don't create
}

async function findTodayDoc(drive, key) {
  const parentId = process.env.NANA_FOLDER_ID || await ensureFolder(drive);
  if (!parentId) return null;

  // Look by hidden key first
  let { data } = await drive.files.list({
    q: [
      "mimeType='application/vnd.google-apps.document'",
      "trashed=false",
      `'${parentId}' in parents`,
      `appProperties has { key='nanaSummariesKey' and value='${esc(key)}' }`,
    ].join(' and '),
    fields: 'files(id,name,appProperties,webViewLink)', spaces: 'drive', pageSize: 10,
  });
  if (data.files?.length) return data.files[0];

  // Fallback by name
  const title = summariesTitleFor(key);
  const byName = await drive.files.list({
    q: [
      "mimeType='application/vnd.google-apps.document'",
      "trashed=false",
      `'${parentId}' in parents`,
      `name='${esc(title)}'`,
    ].join(' and '),
    fields: 'files(id,name,appProperties,webViewLink)', spaces: 'drive', pageSize: 10,
  });
  return byName.data.files?.[0] || null;
}

async function exportDocText(drive, docId) {
  const res = await drive.files.export(
    { fileId: docId, mimeType: 'text/plain' },
    { responseType: 'text' }
  );
  return res.data || '';
}

// Pull "**Summary**" sections following "## Title" style, and your new format too.
function extractSummariesFromText(txt) {
  const items = [];

  // Newer format ("**First up: Title.**" then prose until '---')
  const blocks = txt.split(/\n---\n/g);
  for (const b of blocks) {
    const titleMatch = b.match(/\*\*(?:First up:\s*)?(.+?)\.\*\*/);
    if (titleMatch) {
      const title = titleMatch[1].trim();
      const summary = b.replace(/\*\*.*?\*\*\s*/s, '').trim();
      if (title && summary) items.push({ title, summary });
    }
  }
  if (items.length) return items;

  // Legacy "## Title" + "**Summary**" blocks
  const sectionRegex = /^##\s+(.*)\s*$/gm;
  let m; const marks = [];
  while ((m = sectionRegex.exec(txt)) !== null) marks.push({ title: (m[1] || '').trim(), index: m.index });
  marks.push({ title: '__END__', index: txt.length });
  for (let i = 0; i < marks.length - 1; i++) {
    const { title, index } = marks[i];
    const nextIndex = marks[i + 1].index;
    const block = txt.slice(index, nextIndex);
    const sumStart = block.indexOf('**Summary**');
    if (sumStart === -1) continue;
    const after = block.slice(sumStart + '**Summary**'.length);
    const endMatch = after.search(/\n\*\*|^---/m);
    const summaryRaw = endMatch === -1 ? after : after.slice(0, endMatch);
    const summary = summaryRaw.trim();
    if (title && summary) items.push({ title, summary });
  }
  return items;
}

export async function handler(event) {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors() };
    if (event.httpMethod !== 'POST') return json(405, { ok:false, error:'Method Not Allowed' });

    const key = dailyKeyET();
    const auth = oauth();
    await auth.getAccessToken();
    const drive = google.drive({ version: 'v3', auth });

    const file = await findTodayDoc(drive, key);
    if (!file) return json(200, { ok:true, items: [], url: null, already: false });

    const plain = await exportDocText(drive, file.id);
    const items = extractSummariesFromText(plain);

    return json(200, { ok:true, items, url: file.webViewLink || null, already: true });
  } catch (e) {
    return json(500, { ok:false, error: e?.message || 'Server error' });
  }
}
