import { google } from 'googleapis';

export async function handler() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok:false, error:'Missing Google env vars' }),
    };
  }

  try {
    const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

    // Force an exchange to catch invalid_grant/invalid_client early:
    await auth.getAccessToken();

    const drive = google.drive({ version: 'v3', auth });
    const docs  = google.docs({ version: 'v1', auth });

    const { data: file } = await drive.files.create({
      requestBody: {
        name: `Nana – Auth Smoke Test ${new Date().toISOString()}`,
        mimeType: 'application/vnd.google-apps.document',
      },
      fields: 'id, webViewLink',
    });

    await docs.documents.batchUpdate({
      documentId: file.id,
      requestBody: { requests: [{ insertText: { location: { index: 1 }, text: 'Hello from Netlify ✅\n' } }] },
    });

    return { statusCode: 200, body: JSON.stringify({ ok:true, url: file.webViewLink }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: e.message }) };
  }
}
