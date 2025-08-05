export async function handler(event) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = "JYX3xP3PaX9s5iYt6Uzk"; // Replace with your chosen voice

  try {
    const { text } = JSON.parse(event.body);

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.3, similarity_boost: 0.75 }
      })
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'ElevenLabs API error' })
      };
    }

    const audioBuffer = await response.arrayBuffer();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Access-Control-Allow-Origin': '*'
      },
      body: Buffer.from(audioBuffer).toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}
