// netlify/functions/granny.js
export async function handler(event) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  const body = JSON.parse(event.body);
  const userPrompt = body.prompt || "What's new in AI and XR today?";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a sassy tech-savvy grandma who reads XR/AI news and chats with users." },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7
    })
  });

  const data = await response.json();
  return {
    statusCode: 200,
    body: JSON.stringify({ response: data.choices[0].message.content })
  };
}
