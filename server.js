require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { initDB, queryAll, queryOne, runSQL } = require('./server/database');
const googleDrive = require('./server/googleDrive');
const googleSheets = require('./server/googleSheets');
const extractor = require('./server/extractor');
const aiExtractor = require('./server/ai-extractor');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// อัปโหลดไฟล์
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ========== หน้าเว็บ ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ========== API: โปรเจค ==========
app.get('/api/projects', (req, res) => {
  const projects = queryAll('SELECT * FROM projects ORDER BY name');
  res.json(projects);
});

app.post('/api/projects', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'ต้องระบุชื่อโปรเจค' });

  const id = runSQL('INSERT INTO projects (name, description) VALUES (?, ?)', [name, description || '']);

  try {
    await googleSheets.addProject({ id, name, description });
  } catch (e) { console.log('Google Sheets sync skipped:', e.message); }

  res.json({ id, name, description });
});

// ========== API: ใบกำกับภาษี ==========
app.get('/api/invoices', (req, res) => {
  const { search, project_id, date_from, date_to, status } = req.query;

  let sql = `SELECT ti.*, p.name as project_name FROM tax_invoices ti
             LEFT JOIN projects p ON ti.project_id = p.id WHERE 1=1`;
  const params = [];

  if (search) {
    sql += ` AND (ti.invoice_number LIKE ? OR ti.seller_name LIKE ? OR ti.notes LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (project_id) { sql += ` AND ti.project_id = ?`; params.push(Number(project_id)); }
  if (date_from) { sql += ` AND ti.invoice_date >= ?`; params.push(date_from); }
  if (date_to) { sql += ` AND ti.invoice_date <= ?`; params.push(date_to); }
  if (status) { sql += ` AND ti.status = ?`; params.push(status); }

  sql += ` ORDER BY ti.invoice_date DESC, ti.id DESC`;

  const invoices = queryAll(sql, params);
  res.json(invoices);
});

app.get('/api/invoices/:id', (req, res) => {
  const invoice = queryOne(`SELECT ti.*, p.name as project_name FROM tax_invoices ti
    LEFT JOIN projects p ON ti.project_id = p.id WHERE ti.id = ?`, [Number(req.params.id)]);
  if (!invoice) return res.status(404).json({ error: 'ไม่พบใบกำกับภาษี' });

  const items = queryAll('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY item_no', [Number(req.params.id)]);
  res.json({ ...invoice, items });
});

app.post('/api/invoices', upload.single('file'), async (req, res) => {
  try {
    const data = req.body;

    const subtotal = parseFloat(data.subtotal) || 0;
    const discount = parseFloat(data.discount) || 0;
    let totalBeforeVat = parseFloat(data.total_before_vat) || (subtotal - discount);
    const vatAmount = parseFloat(data.vat_amount) || 0;
    let grandTotal = parseFloat(data.grand_total) || (totalBeforeVat + vatAmount);

    // ตรวจจับ AI สลับ total_before_vat กับ grand_total
    // grand_total ต้องมากกว่า total_before_vat เสมอ (เพราะบวก VAT)
    if (grandTotal > 0 && totalBeforeVat > 0 && grandTotal < totalBeforeVat && vatAmount > 0) {
      console.log('[Validation] Detected swapped totals — auto-fixing: total_before_vat=' + totalBeforeVat + ' grand_total=' + grandTotal);
      const temp = grandTotal;
      grandTotal = totalBeforeVat;
      totalBeforeVat = temp;
    }

    // ตรวจสอบ VAT ~7% ถ้าไม่ตรง ให้คำนวณใหม่
    if (vatAmount > 0 && totalBeforeVat > 0) {
      const expectedVat = Math.round(totalBeforeVat * 0.07 * 100) / 100;
      const expectedTotal = Math.round((totalBeforeVat + vatAmount) * 100) / 100;
      if (Math.abs(grandTotal - expectedTotal) > 1) {
        console.log('[Validation] Grand total mismatch, recalculating: expected=' + expectedTotal + ' got=' + grandTotal);
        grandTotal = expectedTotal;
      }
    }

    const withholdingTax = parseFloat(data.withholding_tax) || 0;
    const netTotal = parseFloat(data.net_total) || (grandTotal - withholdingTax);

    let filePath = null, driveId = null, driveUrl = null;

    if (req.file) {
      filePath = req.file.path;
      try {
        const driveResult = await googleDrive.uploadFile(
          req.file.path, req.file.originalname,
          req.file.mimetype, process.env.GOOGLE_DRIVE_FOLDER_ID
        );
        if (driveResult) { driveId = driveResult.id; driveUrl = driveResult.url; }
      } catch (e) { console.log('Google Drive upload skipped:', e.message); }
    }

    const invoiceId = runSQL(`
      INSERT INTO tax_invoices (project_id, invoice_number, invoice_date, seller_name,
        seller_tax_id, seller_branch, seller_address, subtotal, discount, total_before_vat,
        vat_amount, grand_total, withholding_tax, net_total, file_path, google_drive_id,
        google_drive_url, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      Number(data.project_id) || 1, data.invoice_number, data.invoice_date, data.seller_name,
      data.seller_tax_id || '', data.seller_branch || '', data.seller_address || '',
      subtotal, discount, totalBeforeVat, vatAmount, grandTotal, withholdingTax, netTotal,
      filePath, driveId, driveUrl, data.notes || '', 'pending'
    ]);

    // บันทึกรายการสินค้า
    let items = [];
    try { items = JSON.parse(data.items || '[]'); } catch (e) { }

    let itemsDesc = [];
    items.forEach((item, idx) => {
      runSQL(`INSERT INTO invoice_items (invoice_id, item_no, description, quantity, unit_price, amount) VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, idx + 1, item.description, item.quantity || 1, item.unit_price || 0, item.amount || 0]);
      itemsDesc.push(item.description);
    });

    // Sync to Google Sheets
    const project = queryOne('SELECT name FROM projects WHERE id = ?', [Number(data.project_id) || 1]);
    try {
      await googleSheets.addInvoice({
        id: invoiceId,
        project_name: project ? project.name : 'ทั่วไป',
        invoice_number: data.invoice_number,
        invoice_date: data.invoice_date,
        seller_name: data.seller_name,
        seller_tax_id: data.seller_tax_id,
        seller_branch: data.seller_branch,
        items_description: itemsDesc.join(', '),
        total_before_vat: totalBeforeVat,
        vat_amount: vatAmount, discount, grand_total: grandTotal,
        withholding_tax: withholdingTax, net_total: netTotal,
        google_drive_url: driveUrl, notes: data.notes, status: 'pending'
      });
    } catch (e) { console.log('Google Sheets sync skipped:', e.message); }

    res.json({ id: invoiceId, message: 'บันทึกใบกำกับภาษีสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/invoices/:id', (req, res) => {
  const data = req.body;
  runSQL(`UPDATE tax_invoices SET
    project_id=?, invoice_number=?, invoice_date=?, seller_name=?, seller_tax_id=?,
    seller_branch=?, subtotal=?, discount=?, total_before_vat=?, vat_amount=?,
    grand_total=?, withholding_tax=?, net_total=?, notes=?, status=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?`, [
    data.project_id, data.invoice_number, data.invoice_date, data.seller_name, data.seller_tax_id,
    data.seller_branch, data.subtotal, data.discount, data.total_before_vat, data.vat_amount,
    data.grand_total, data.withholding_tax, data.net_total, data.notes, data.status, Number(req.params.id)
  ]);
  res.json({ message: 'อัปเดตสำเร็จ' });
});

app.delete('/api/invoices/:id', (req, res) => {
  runSQL('DELETE FROM invoice_items WHERE invoice_id = ?', [Number(req.params.id)]);
  runSQL('DELETE FROM tax_invoices WHERE id = ?', [Number(req.params.id)]);
  res.json({ message: 'ลบสำเร็จ' });
});

// ========== API: ใบสำคัญจ่ายเงิน ==========
app.get('/api/vouchers', (req, res) => {
  const { search, date_from, date_to } = req.query;

  let sql = `SELECT pv.*, ti.invoice_number FROM payment_vouchers pv
             LEFT JOIN tax_invoices ti ON pv.invoice_id = ti.id WHERE 1=1`;
  const params = [];

  if (search) {
    sql += ` AND (pv.voucher_number LIKE ? OR pv.payee_name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (date_from) { sql += ` AND pv.voucher_date >= ?`; params.push(date_from); }
  if (date_to) { sql += ` AND pv.voucher_date <= ?`; params.push(date_to); }

  sql += ` ORDER BY pv.voucher_date DESC, pv.id DESC`;

  const vouchers = queryAll(sql, params);
  res.json(vouchers);
});

app.get('/api/vouchers/:id', (req, res) => {
  const voucher = queryOne(`SELECT pv.*, ti.invoice_number FROM payment_vouchers pv
    LEFT JOIN tax_invoices ti ON pv.invoice_id = ti.id WHERE pv.id = ?`, [Number(req.params.id)]);
  if (!voucher) return res.status(404).json({ error: 'ไม่พบใบสำคัญจ่าย' });

  const accounts = queryAll('SELECT * FROM voucher_accounts WHERE voucher_id = ?', [Number(req.params.id)]);
  res.json({ ...voucher, accounts });
});

app.post('/api/vouchers', async (req, res) => {
  try {
    const data = req.body;

    const year = new Date().getFullYear() + 543;
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const countResult = queryOne(`SELECT COUNT(*) as cnt FROM payment_vouchers WHERE voucher_date LIKE ?`,
      [`${new Date().getFullYear()}-${month}%`]);
    const seq = String((countResult ? countResult.cnt : 0) + 1).padStart(4, '0');
    const voucherNumber = data.voucher_number || `PV${year}${month}-${seq}`;

    const amount = parseFloat(data.amount) || 0;
    const vatAmount = parseFloat(data.vat_amount) || 0;
    const withholdingTax = parseFloat(data.withholding_tax) || 0;
    const netAmount = parseFloat(data.net_amount) || (amount + vatAmount - withholdingTax);

    const voucherId = runSQL(`
      INSERT INTO payment_vouchers (voucher_number, voucher_date, invoice_id, payee_name,
        description, amount, vat_amount, withholding_tax, net_amount, amount_in_words,
        payment_method, bank_name, bank_branch, cheque_number, cheque_date,
        prepared_by, approved_by, received_by, checked_by, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      voucherNumber, data.voucher_date, data.invoice_id ? Number(data.invoice_id) : null, data.payee_name,
      data.description || '', amount, vatAmount, withholdingTax, netAmount,
      data.amount_in_words || '', data.payment_method || 'cash',
      data.bank_name || '', data.bank_branch || '', data.cheque_number || '', data.cheque_date || null,
      data.prepared_by || '', data.approved_by || '', data.received_by || '', data.checked_by || '', 'draft'
    ]);

    // บันทึกรายการบัญชี
    let accounts = [];
    try { accounts = JSON.parse(data.accounts || '[]'); } catch (e) { }

    accounts.forEach(acc => {
      runSQL(`INSERT INTO voucher_accounts (voucher_id, account_code, account_name, debit, credit) VALUES (?, ?, ?, ?, ?)`,
        [voucherId, acc.account_code || '', acc.account_name || '', acc.debit || 0, acc.credit || 0]);
    });

    // Sync to Google Sheets
    try {
      await googleSheets.addVoucher({
        id: voucherId, voucher_number: voucherNumber, voucher_date: data.voucher_date,
        invoice_number: '', payee_name: data.payee_name, description: data.description,
        amount, vat_amount: vatAmount, withholding_tax: withholdingTax, net_amount: netAmount,
        payment_method: data.payment_method === 'cheque' ? 'เช็ค' : 'เงินสด',
        prepared_by: data.prepared_by, status: 'draft'
      });
    } catch (e) { console.log('Google Sheets sync skipped:', e.message); }

    res.json({ id: voucherId, voucher_number: voucherNumber, message: 'สร้างใบสำคัญจ่ายสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========== API: แก้ไขใบสำคัญจ่าย ==========
app.put('/api/vouchers/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = queryOne('SELECT * FROM payment_vouchers WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'ไม่พบใบสำคัญจ่าย' });

    const data = req.body;
    const amount = parseFloat(data.amount) || existing.amount;
    const vatAmount = parseFloat(data.vat_amount) || existing.vat_amount;
    const withholdingTax = parseFloat(data.withholding_tax) || existing.withholding_tax;
    const netAmount = parseFloat(data.net_amount) || (amount + vatAmount - withholdingTax);

    runSQL(`UPDATE payment_vouchers SET
      voucher_date = ?, payee_name = ?, description = ?,
      amount = ?, vat_amount = ?, withholding_tax = ?, net_amount = ?,
      amount_in_words = ?, payment_method = ?,
      bank_name = ?, bank_branch = ?, cheque_number = ?, cheque_date = ?,
      prepared_by = ?, approved_by = ?, received_by = ?, checked_by = ?, status = ?
      WHERE id = ?`, [
      data.voucher_date || existing.voucher_date,
      data.payee_name || existing.payee_name,
      data.description !== undefined ? data.description : existing.description,
      amount, vatAmount, withholdingTax, netAmount,
      data.amount_in_words || existing.amount_in_words,
      data.payment_method || existing.payment_method,
      data.bank_name !== undefined ? data.bank_name : existing.bank_name,
      data.bank_branch !== undefined ? data.bank_branch : existing.bank_branch,
      data.cheque_number !== undefined ? data.cheque_number : existing.cheque_number,
      data.cheque_date !== undefined ? data.cheque_date : existing.cheque_date,
      data.prepared_by !== undefined ? data.prepared_by : existing.prepared_by,
      data.approved_by !== undefined ? data.approved_by : existing.approved_by,
      data.received_by !== undefined ? data.received_by : existing.received_by,
      data.checked_by !== undefined ? data.checked_by : existing.checked_by,
      data.status || existing.status,
      id
    ]);

    // อัปเดตรายการบัญชี (ถ้ามี)
    if (data.accounts) {
      runSQL('DELETE FROM voucher_accounts WHERE voucher_id = ?', [id]);
      let accounts = [];
      try { accounts = JSON.parse(data.accounts); } catch (e) { }
      accounts.forEach(acc => {
        runSQL('INSERT INTO voucher_accounts (voucher_id, account_code, account_name, debit, credit) VALUES (?, ?, ?, ?, ?)',
          [id, acc.account_code || '', acc.account_name || '', acc.debit || 0, acc.credit || 0]);
      });
    }

    res.json({ message: 'แก้ไขใบสำคัญจ่ายสำเร็จ', id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========== API: ลบใบสำคัญจ่าย ==========
app.delete('/api/vouchers/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = queryOne('SELECT * FROM payment_vouchers WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'ไม่พบใบสำคัญจ่าย' });

    // ลบรายการบัญชีที่เกี่ยวข้อง
    runSQL('DELETE FROM voucher_accounts WHERE voucher_id = ?', [id]);
    // ลบใบสำคัญจ่าย
    runSQL('DELETE FROM payment_vouchers WHERE id = ?', [id]);

    // คืนสถานะใบกำกับภาษี (ถ้ามี)
    if (existing.invoice_id) {
      runSQL("UPDATE tax_invoices SET status = 'pending' WHERE id = ?", [existing.invoice_id]);
    }

    res.json({ message: 'ลบใบสำคัญจ่ายสำเร็จ', id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========== API: Dashboard สรุป ==========
app.get('/api/dashboard', (req, res) => {
  const totalInvoices = (queryOne('SELECT COUNT(*) as cnt FROM tax_invoices') || {}).cnt || 0;
  const totalVouchers = (queryOne('SELECT COUNT(*) as cnt FROM payment_vouchers') || {}).cnt || 0;
  const totalAmount = (queryOne('SELECT COALESCE(SUM(grand_total), 0) as total FROM tax_invoices') || {}).total || 0;
  const pendingInvoices = (queryOne("SELECT COUNT(*) as cnt FROM tax_invoices WHERE status = 'pending'") || {}).cnt || 0;

  const recentInvoices = queryAll(`SELECT ti.*, p.name as project_name FROM tax_invoices ti
    LEFT JOIN projects p ON ti.project_id = p.id ORDER BY ti.created_at DESC LIMIT 10`);

  const projectSummary = queryAll(`
    SELECT p.name, COUNT(ti.id) as invoice_count, COALESCE(SUM(ti.grand_total), 0) as total_amount
    FROM projects p LEFT JOIN tax_invoices ti ON p.id = ti.project_id
    GROUP BY p.id ORDER BY total_amount DESC
  `);

  res.json({ totalInvoices, totalVouchers, totalAmount, pendingInvoices, recentInvoices, projectSummary });
});

// ========== API: AI Vision - สกัดข้อมูลจากเอกสาร ==========
app.post('/api/extract', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'กรุณาอัปโหลดไฟล์' });

  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tiff', '.tif'].includes(ext)) {
      return res.status(400).json({ error: 'รองรับเฉพาะ PDF และรูปภาพ (JPG, PNG, WebP, BMP, TIFF)' });
    }

    // Use AI Vision if API key is configured, fallback to regex
    const result = await aiExtractor.extractFromFile(req.file.path);
    res.json(result);
  } catch (err) {
    console.error('Extract error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== API: AI Status ==========
app.get('/api/ai/status', (req, res) => {
  aiExtractor.initialize();
  res.json({
    provider: aiExtractor.provider || 'none',
    available: !!aiExtractor.provider,
    message: aiExtractor.provider
      ? 'AI (' + aiExtractor.provider + ') พร้อมใช้งาน'
      : 'ไม่ได้ตั้งค่า API Key - ใช้ regex extractor แทน (ตั้งค่า GEMINI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY หรือ OLLAMA_MODEL ใน .env)'
  });
});

// ========== Google Auth ==========
app.get('/auth/google', (req, res) => {
  const url = googleDrive.getAuthUrl();
  if (!url) return res.json({ error: 'Google API not configured', configured: false });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    await googleDrive.setCredentials(req.query.code);
    googleSheets.configure(googleDrive.oauth2Client);

    if (!process.env.GOOGLE_SHEET_ID) {
      const sheet = await googleSheets.createSpreadsheet();
      if (sheet) {
        console.log('Created new spreadsheet:', sheet.url);
        const envPath = path.join(__dirname, '.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        envContent += `\nGOOGLE_SHEET_ID=${sheet.id}\n`;
        fs.writeFileSync(envPath, envContent);
        process.env.GOOGLE_SHEET_ID = sheet.id;
      }
    }

    res.redirect('/?google=connected');
  } catch (err) {
    console.error(err);
    res.redirect('/?google=error');
  }
});

app.get('/api/google/status', (req, res) => {
  res.json({
    configured: googleDrive.isConfigured,
    connected: !!googleDrive.drive,
    sheetsConfigured: googleSheets.isConfigured
  });
});

// ========== เสิร์ฟไฟล์ที่อัปโหลด ==========
app.use('/uploads', express.static(uploadDir));

// Start server
async function start() {
  await initDB();
  googleDrive.configure();
  googleDrive.loadSavedToken();

  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║  ระบบใบสำคัญจ่ายเงิน - INC Technology             ║
║  Server running at http://localhost:${PORT}           ║
╚════════════════════════════════════════════════════╝
    `);
  });
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
