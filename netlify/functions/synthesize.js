// import OpenAI from 'openai';

// export async function handler(event) {
//   try {
//     const { items, dateRange, values } = JSON.parse(event.body || '{}');
//     if (!items?.length) return { statusCode: 400, body: JSON.stringify({ error: 'No items' }) };

//     // keep costs low: trim per-article text
//     const MAX_CHARS = 3000; // ~1–1.5K tokens across all items if you have ~5–8 articles
//     const trimmed = items.map(a => ({
//       title: a.title || '',
//       source: a.source || '',
//       url: a.url || '',
//       text: (a.content || '').slice(0, MAX_CHARS)
//     }));

//     const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'; // low-cost default

//     const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

//     const system = [
//       "You are 'Nana', a friendly, practical analyst for creative technologists.",
//       "Deliver concise insights with concrete, actionable uses.",
//       "Avoid hype; prefer specific tools, workflows, and small experiments someone could run this week."
//     ].join(' ');

//     const defaultValues = [
//       "human-centered design",
//       "rapid prototyping & iteration",
//       "storytelling & audience impact",
//       "ethical use & consent/attribution",
//       "interoperability & open formats",
//       "accessibility & performance"
//     ];
//     const guardrails = (values?.length ? values : defaultValues).join('; ');

//     const user = `
// DATE RANGE: ${dateRange || 'today'}
// GROUNDING VALUES: ${guardrails}

// ARTICLES:
// ${trimmed.map((a,i)=>`[${i+1}] ${a.title} — ${a.source}\n${a.url}\n${a.text}`).join('\n\n')}

// TASK:
// 1) Bullet recap (1–2 bullets per article, max 14 words each).
// 2) Synthesis across articles (what's really new / patterns).
// 3) “What it means for creative technologists/innovators/storytellers” — use the grounding values.
// 4) 6 concrete TODOs (tiny experiments, tools to try, prompts, prototypes).
// Return markdown sections: Recap, Patterns, What It Means, Six Things To Try.
// `;

//     const resp = await client.chat.completions.create({
//       model,
//       messages: [
//         { role: 'system', content: system },
//         { role: 'user', content: user }
//       ],
//       temperature: 0.4,
//       max_tokens: 900
//     });

//     const text = resp.choices[0]?.message?.content || '';
//     return {
//       statusCode: 200,
//       headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
//       body: JSON.stringify({ analysis: text })
//     };
//   } catch (err) {
//     return { statusCode: 500, body: JSON.stringify({ error: 'synthesize-failed', details: err.message }) };
//   }
// }
