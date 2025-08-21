

// import fetch from 'node-fetch';
// import { JSDOM } from 'jsdom';
// import { Readability } from '@mozilla/readability';

// export async function handler(event) {
//   try {
//     const { url } = JSON.parse(event.body || '{}');
//     if (!url) return { statusCode: 400, body: JSON.stringify({ error: 'Missing url' }) };

//     const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
//     const html = await res.text();

//     const dom = new JSDOM(html, { url });
//     const reader = new Readability(dom.window.document);
//     const article = reader.parse();

//     const content = article?.textContent?.trim() || '';

//      // ✅ Log full article text
//     console.log(`\n=== FULL ARTICLE (${article?.title || 'Untitled'}) ===\n`);

//     console.log(content);
//     console.log('\n===============================\n');

//     return {
//       statusCode: 200,
//       headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
//       body: JSON.stringify({ title: article?.title || '', content })
//     };
//   } catch (err) {
//     return { statusCode: 500, body: JSON.stringify({ error: 'extract-failed', details: err.message }) };
//   }
// }


import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

// --- helpers ---
async function fetchAndExtract(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  return {
    url,
    title: article?.title || '',
    content: (article?.textContent || '').trim()
  };
}

// Builds a single big string, with dividers between articles
function buildMerged(results) {
  return results
    .filter(r => r && !r.error && r.content)
    .map(r => `# ${r.title || r.url}\n${r.url}\n\n${r.content}`)
    .join('\n\n---\n\n');
}

export async function handler(event) {
  try {
    // CORS preflight (optional but handy during local dev)
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST,OPTIONS'
        }
      };
    }

    const body = JSON.parse(event.body || '{}');

    // Accept either { url } or { urls: [...] }
    const urls = Array.isArray(body.urls)
      ? body.urls
      : body.url
      ? [body.url]
      : null;

    if (!urls || urls.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing or invalid urls array' })
      };
    }

    // Process all URLs 
    const results = [];
    for (const u of urls) {
      try {
        const r = await fetchAndExtract(u);

        // Per-article log (what you already had)
        console.log(`\n=== FULL ARTICLE (${r.title || 'Untitled'}) ===\n`);
      //  console.log(r.content);
        console.log('\n===============================\n');

        results.push(r);
      } catch (err) {
        results.push({ url: u, error: err.message });
      }
    }

    // 🔗 Build and log the single merged blob
    const merged = buildMerged(results);
    if (merged) {
      console.log('\n=== MERGED ARTICLES ===\n');
      //console.log(merged);
      //console.log('\n=======================\n');
    }



    const isSingle = !Array.isArray(body.urls) && !!body.url;
    const payload = isSingle ? results[0] : { results, merged };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(payload)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'extract-failed', details: err.message })
    };
  }
}
