
import fetch from 'node-fetch';

export async function handler(event, context) {
  const NEWS_API_KEY = process.env.NEWS_API_KEY;

  if (!NEWS_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing NEWS_API_KEY' })
    };
  }

  const query = '("XR" OR "Extended Reality" OR "AR" OR "VR" AND "AI") -addicted2success.com';

  const baseUrl = `https://newsapi.org/v2/everything`;

  const params = new URLSearchParams({
    q: query,
    sortBy: 'publishedAt',
    language: 'en',
    pageSize: '15',
    apiKey: NEWS_API_KEY
  });

  try {

    const res = await fetch(`${baseUrl}?${params}`);
    const data = await res.json();

      console.log('🔍 Full NewsAPI response:', JSON.stringify(data, null, 2));
    console.log('📰 Article count:', data.articles?.length || 0);

    if (data.articles && data.articles.length > 0) {
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
    } else {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([])
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch articles', details: err.message })
    };
  }


}
