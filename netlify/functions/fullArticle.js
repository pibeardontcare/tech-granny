import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export async function handler(event) {
    console.log("📥 fullArticle handler called with event:", event);
    const { url } = JSON.parse(event.body || '{}');

  if (!url) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing article URL' })
    };
  }

  try {
    const response = await fetch(url);
    const html = await response.text();

    const $ = cheerio.load(html);

    // Try common content containers
    const candidates = [
      'article',
      'main',
      '[itemprop="articleBody"]',
      '.article-content',
      '.post-content',
      '.entry-content',
      '#article'
    ];

    let text = '';
    for (const selector of candidates) {
      const section = $(selector);
      if (section.length && section.text().length > 200) {
        text = section.text().trim();
        break;
      }
    }

    if (!text) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Could not extract article content' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ content: text.slice(0, 5000) }) // limit to 5k chars for safety
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Scraping failed', details: err.message })
    };
  }
}
