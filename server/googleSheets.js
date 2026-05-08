let google;
try { google = require('googleapis').google; } catch (e) { google = null; }

class GoogleSheetsService {
  constructor() { this.sheets = null; this.oauth2Client = null; this.spreadsheetId = null; this.isConfigured = false; }

  configure(oauth2Client) {
    if (!google) return;
    this.oauth2Client = oauth2Client;
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (oauth2Client && this.spreadsheetId) {
      this.sheets = google.sheets({ version: 'v4', auth: oauth2Client }); this.isConfigured = true;
    }
  }

  async createSpreadsheet() { return null; }

  async _append(sheetName, row) {
    if (!this.isConfigured) return null;
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId, range: sheetName + '!A:Z',
      valueInputOption: 'USER_ENTERED', resource: { values: [row] }
    });
    return true;
  }

  async addInvoice(d) { return this._append('Invoices', [d.id, d.project_name, d.invoice_number, d.invoice_date, d.seller_name, d.grand_total, d.status, new Date().toLocaleString('th-TH')]); }
  async addVoucher(d) { return this._append('Vouchers', [d.id, d.voucher_number, d.voucher_date, d.payee_name, d.net_amount, d.status, new Date().toLocaleString('th-TH')]); }
  async addProject(d) { return this._append('Projects', [d.id, d.name, d.description, new Date().toLocaleString('th-TH')]); }
}

module.exports = new GoogleSheetsService();
