let google;
try { google = require('googleapis').google; } catch (e) { google = null; }
const fs = require('fs');
const path = require('path');

class GoogleDriveService {
  constructor() { this.oauth2Client = null; this.drive = null; this.isConfigured = false; }

  configure() {
    if (!google) { console.log('googleapis not installed. Google Drive disabled.'); return; }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !clientSecret || clientId === 'your_client_id_here') {
      console.log('Google Drive not configured. Local-only mode.'); this.isConfigured = false; return;
    }
    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    this.isConfigured = true;
  }

  getAuthUrl() { if (!this.isConfigured) return null; return this.oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/drive.file'] }); }

  async setCredentials(code) {
    if (!this.isConfigured) return;
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'google-token.json'), JSON.stringify(tokens));
  }

  loadSavedToken() {
    if (!this.isConfigured) return false;
    const tokenPath = path.join(__dirname, '..', 'data', 'google-token.json');
    if (fs.existsSync(tokenPath)) {
      this.oauth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenPath, 'utf8')));
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client }); return true;
    }
    return false;
  }

  async uploadFile(filePath, fileName, mimeType, folderId) {
    if (!this.drive) return null;
    const r = await this.drive.files.create({ resource: { name: fileName, parents: folderId ? [folderId] : [] }, media: { mimeType, body: fs.createReadStream(filePath) }, fields: 'id, webViewLink' });
    return { id: r.data.id, url: r.data.webViewLink };
  }
}

module.exports = new GoogleDriveService();
