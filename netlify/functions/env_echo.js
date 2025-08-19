export async function handler() {
  const keys = ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN'];
  const report = {};
  for (const k of keys) {
    const v = process.env[k];
    report[k] = v ? { present: true, length: v.length } : { present: false };
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  };
}
