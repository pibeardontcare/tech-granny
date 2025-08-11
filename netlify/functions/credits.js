

export async function handler(event) {
    const apiKey = process.env.ELEVENLABS_USER_API_KEY; 

  

  console.log("🔑 Using API Key:", apiKey ? "Exists" : "Missing");

  const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
    headers: {
      "xi-api-key": apiKey
    }
  });

  console.log("🌐 Request sent to ElevenLabs, status:", res.status);

  if (!res.ok) {
    const errorText = await res.text();
    console.error("❌ Failed to fetch subscription:", errorText);
    return {
      statusCode: res.status,
      body: JSON.stringify({ error: "Unable to fetch credits" })
    };
  }

  const data = await res.json();
  console.log("✅ Subscription data received:", data);

  return {
    statusCode: 200,
    body: JSON.stringify(data)
  };
}
