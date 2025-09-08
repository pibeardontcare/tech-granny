import fs from 'fs/promises';
import { google } from 'googleapis';
import readline from 'readline';



const SCOPES = ['https://www.googleapis.com/auth/documents'];
const TOKEN_PATH = 'credentials/token.json';

async function authorize() {
  const content = await fs.readFile('credentials/client_secret.json', 'utf-8');
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  try {
    const token = await fs.readFile(TOKEN_PATH, 'utf-8');
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  } catch {
    return getNewToken(oAuth2Client);
  }
}

function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Enter the code from that page here: ', async (code) => {
      rl.close();
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);
      await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
      resolve(oAuth2Client);
    });
  });
}

async function createDoc(auth, nanaText) {
  const docs = google.docs({ version: 'v1', auth });
  const newDoc = await docs.documents.create({
    requestBody: {
      title: "Nana's Daily Wisdom",
    },
  });

  const docId = newDoc.data.documentId;

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: nanaText,
          },
        },
      ],
    },
  });

  console.log(`Created doc: https://docs.google.com/document/d/${docId}/edit`);
}

authorize().then(auth => {
  const nanaText = `Hello dear, this is Nana's take for today: ...`;
  createDoc(auth, nanaText);
});
