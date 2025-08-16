

import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export async function handler(event) {
  try {
    const { url } = JSON.parse(event.body || '{}');
    if (!url) return { statusCode: 400, body: JSON.stringify({ error: 'Missing url' }) };

    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();

    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    const content = article?.textContent?.trim() || '';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ title: article?.title || '', content })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'extract-failed', details: err.message }) };
  }
}
