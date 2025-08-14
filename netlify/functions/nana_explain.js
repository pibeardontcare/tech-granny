import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const OPENAI_API = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';



// --- tiny scraper using Readability ---
async function extractReadable(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const title = article?.title?.trim() || '';
  const text  = article?.textContent?.replace(/\s+\n/g, '\n').trim() || '';
  return { title, text };
}

// --- cost guard: trim text ---
function trimForModel(s, maxChars = 1600) { // ~600–800 tokens/article
  if (!s) return '';
  return s.length > maxChars ? s.slice(0, maxChars) + '\n…' : s;
}

// --- one cheap call per article, short structured output ---
async function nanaForArticle({ url, title, source, text }, values) {
  const trimmed = trimForModel(text);
  const grounding = (values && values.length)
    ? values.join('; ')
    : [
        'human-centered design',
        'rapid prototyping & iteration',
        'storytelling impact',
        'ethics (consent, attribution)',
        'interoperability & open formats',
        'accessibility & performance'
      ].join('; ');

  // Keep the prompt tiny but structured
  // keep the rest of nanaForArticle the same; just replace system + user strings

const system = `You are "Nana", a practical, plain-spoken mentor.
Voice: warm, first-person, concise, no hype, no corporate jargon.
Ground your take in the article’s details—don’t invent facts.
Only suggest tools/experiments when they’re truly relevant and specific.
Core values to lean on (without listing them): ${grounding}.`;

const user = `
ARTICLE
Title: ${title || '(untitled)'}
Source: ${source || ''}
URL: ${url}

TEXT (trimmed)
${trimmed || '(no body extracted — rely on title/URL and be cautious)'}

TASK
Return markdown in this exact shape:

**Recap**
- 4–8 bullet points, 10–18 words each.
- Cover all key claims, numbers/dates, drivers, tensions, and what’s new vs. status quo.
- Stick to facts from the text; if uncertain, qualify (“early report”, “vendor claim”).

**Back in my day**
Start the first sentence exactly with: “Back in my day we called this …”
Then in 1–2 sentences, name a plausible 1950s analog (practice, tool, or cultural pattern) and briefly connect the similarities/differences without anachronisms.

**Nana’s Take**
3–5 sentences. Synthesize what it really means, using specifics from the Recap.
Write in first person (“It seems to me…”, “I’d watch for…”).
Don’t address any group directly (no “dear creatives”); just offer grounded perspective.
If appropriate, include up to two gentle suggestions beginning with “You could…”.

**Suggested Tools & Experiments (optional)**
Include ONLY if the article clearly implies a concrete workflow or experiment.
1–3 bullets in the form: **Tool / workflow — tiny experiment**.
If nothing strong, omit this section entirely.

CONSTRAINTS
- Keep total under ~220 words.
- No lists of generic tools. Prefer one or two specific, article-driven ideas or omit.
- If this is a trailer/press release with little substance, say so briefly in Recap and narrow the Take.
`;


  const r = await fetch(OPENAI_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 280, // tight cap = low cost
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content?.trim() || '(no output)';
  return content;
}

export async function handler(event) {
  try {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'POST only' };
    }

    // Body can be { urls: string[], values?: string[] } OR { items: {url,title,source}[] }
    const { urls = [], items = [], values = [] } = JSON.parse(event.body || '{}');

    // Build list and CAP it early to keep runtime under 30s
    const incoming = (items.length ? items : urls.map(u => ({ url: u }))).slice(0, 3);

    if (!incoming.length) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Provide urls[] or items[]' })
      };
    }

    // 1) scrape all (in parallel)
    const scraped = await Promise.all(incoming.map(async (it) => {
      try {
        const { title, text } = await extractReadable(it.url);
        return { ...it, title: it.title || title, text };
      } catch (e) {
        console.warn('scrape fail:', it.url, e.message);
        return { ...it, text: '' };
      }
    }));

    // 2) run Nana per article (sequential = predictable cost)
    const outputs = [];
    for (const a of scraped) {
      const one = await nanaForArticle(a, values);
      outputs.push({ title: a.title || a.url, url: a.url, md: one });
    }

    // 3) combine into one markdown doc
    const combined = [
      `# Nana’s Take: What This Means for Creative Technologists`,
      '',
      ...outputs.map((o, i) => `## ${i + 1}. ${o.title}\n${o.url}\n\n${o.md}`)
    ].join('\n');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ count: outputs.length, doc: combined, items: outputs })
    };
  } catch (err) {
    console.error('[nana_explain] error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'nana_explain_failed', details: String(err?.message || err) })
    };
  }
}
