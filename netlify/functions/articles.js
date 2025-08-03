// netlify/functions/articles.js
import fetch from 'node-fetch';

export async function handler(event, context) {
  const NEWS_API_KEY = process.env.NEWS_API_KEY;

  if (!NEWS_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing NEWS_API_KEY' })
    };
  }

  // === DATE RANGE ===
  const today = new Date();
  const day = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysSinceMonday = (day + 6) % 7;
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - daysSinceMonday);

  const fromDate = lastMonday.toISOString().split('T')[0];
  const toDate = today.toISOString().split('T')[0];

  // === QUERY SETUP ===
  const query = '("XR" OR "Extended Reality" OR "AR" OR "VR" AND "AI") -addicted2success.com';
  const url = `https://newsapi.org/v2/everything`;

  const params = new URLSearchParams({
    q: query,
    from: fromDate,
    to: toDate,
    sortBy: 'publishedAt',
    language: 'en',
    pageSize: '20',
    apiKey: NEWS_API_KEY
  });

  try {
    const res = await fetch(`${url}?${params}`);
    const data = await res.json();

    const output = data.articles.map(item => ({
      title: item.title,
      source: item.source.name,
      url: item.url,
      date: item.publishedAt.slice(0, 10),
      content: item.description || item.content || 'No summary available'
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(output)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch articles', details: err.message })
    };
  }
}
