'use strict';

// ONE-TIME local helper: obtains the YouTube OAuth refresh token that the
// GitHub Action needs (secret YT_REFRESH_TOKEN).
//
// Before running:
//   1. In Google Cloud Console -> Credentials -> your OAuth client, add this
//      authorized redirect URI:  http://localhost:8765/callback
//   2. Publish the OAuth consent screen (Testing-mode refresh tokens die
//      after 7 days - useless for CI).
//
// Run:  node video/get_refresh_token.js <CLIENT_ID> <CLIENT_SECRET>
// Then open the printed URL in a browser, sign in with the channel account,
// and copy the refresh token it prints.

const http = require('http');
const { spawn } = require('child_process');

const CLIENT_ID = process.argv[2];
const CLIENT_SECRET = process.argv[3];
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Usage: node video/get_refresh_token.js <CLIENT_ID> <CLIENT_SECRET>');
  process.exit(1);
}
if (/PASTE|YOUR|SECRET_HERE|CLIENT_ID/i.test(CLIENT_SECRET) || !CLIENT_SECRET.startsWith('GOCSPX-')) {
  console.error('That does not look like a real client secret (they start with "GOCSPX-").');
  console.error('Copy it from Google Cloud Console -> Credentials -> your OAuth client -> Client secrets.');
  process.exit(1);
}

const PORT = 8765;
const REDIRECT = `http://localhost:${PORT}/callback`;

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/youtube',
  access_type: 'offline',
  prompt: 'consent'
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
  const code = url.searchParams.get('code');
  if (!code) {
    res.end('No code in callback - check the console for the error.');
    console.error('Callback without code:', req.url);
    return;
  }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code'
      }).toString()
    });
    const json = await tokenRes.json();
    if (!json.refresh_token) throw new Error(JSON.stringify(json));
    res.end('Done! Go back to the terminal - your refresh token is printed there. You can close this tab.');
    console.log('\n================================================');
    console.log('YT_REFRESH_TOKEN (save as a GitHub Actions secret):');
    console.log(json.refresh_token);
    console.log('================================================\n');
  } catch (e) {
    res.end('Token exchange failed - see terminal.');
    console.error('Token exchange failed:', e.message);
  } finally {
    server.close();
  }
});

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch (e) {
    return false;
  }
}

server.listen(PORT, () => {
  const opened = openBrowser(authUrl);
  if (opened) {
    console.log('A browser window is opening - sign in with the YouTube channel account and approve.');
  } else {
    console.log('Open this URL in your browser and sign in with the YouTube channel account:\n\n' + authUrl + '\n');
  }
  console.log('Waiting for Google to redirect back to ' + REDIRECT + ' ...');
  console.log('IMPORTANT: do NOT press Ctrl+C in this terminal - it kills the script before the redirect arrives.');
});
