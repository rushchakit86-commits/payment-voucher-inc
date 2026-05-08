const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'voucher.db');
let db = null;

async function getDB() {
  if (db) return db;
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  return db;
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(DB_PATH, buffer);
}

async function initDB() {
  const database = await getDB();
  database.run("CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  database.run("CREATE TABLE IF NOT EXISTS tax_invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, invoice_number TEXT NOT NULL, invoice_date DATE NOT NULL, seller_name TEXT NOT NULL, seller_tax_id TEXT, seller_branch TEXT, seller_address TEXT, subtotal REAL DEFAULT 0, discount REAL DEFAULT 0, total_before_vat REAL DEFAULT 0, vat_amount REAL DEFAULT 0, grand_total REAL DEFAULT 0, withholding_tax REAL DEFAULT 0, net_total REAL DEFAULT 0, file_path TEXT, google_drive_id TEXT, google_drive_url TEXT, notes TEXT, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (project_id) REFERENCES projects(id))");
  database.run("CREATE TABLE IF NOT EXISTS invoice_items (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL, item_no INTEGER, description TEXT NOT NULL, quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0, amount REAL DEFAULT 0, FOREIGN KEY (invoice_id) REFERENCES tax_invoices(id) ON DELETE CASCADE)");
  database.run("CREATE TABLE IF NOT EXISTS payment_vouchers (id INTEGER PRIMARY KEY AUTOINCREMENT, voucher_number TEXT, voucher_date DATE NOT NULL, invoice_id INTEGER, payee_name TEXT NOT NULL, description TEXT, amount REAL DEFAULT 0, vat_amount REAL DEFAULT 0, withholding_tax REAL DEFAULT 0, net_amount REAL DEFAULT 0, amount_in_words TEXT, payment_method TEXT DEFAULT 'cash', bank_name TEXT, bank_branch TEXT, cheque_number TEXT, cheque_date DATE, prepared_by TEXT, approved_by TEXT, received_by TEXT, checked_by TEXT, file_path TEXT, google_drive_id TEXT, google_drive_url TEXT, status TEXT DEFAULT 'draft', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (invoice_id) REFERENCES tax_invoices(id))");
  database.run("CREATE TABLE IF NOT EXISTS voucher_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, voucher_id INTEGER NOT NULL, account_code TEXT, account_name TEXT, debit REAL DEFAULT 0, credit REAL DEFAULT 0, FOREIGN KEY (voucher_id) REFERENCES payment_vouchers(id) ON DELETE CASCADE)");

  const result = database.exec('SELECT COUNT(*) as cnt FROM projects');
  const count = result.length > 0 ? result[0].values[0][0] : 0;
  if (count === 0) {
    database.run("INSERT INTO projects (name, description) VALUES (?, ?)", ['General', 'Default project']);
  }
  saveDB();
  console.log('Database initialized successfully');
}

function queryAll(sql, params) {
  try {
    const stmt = db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  } catch (e) { console.error('Query error:', e.message); return []; }
}

function queryOne(sql, params) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function runSQL(sql, params) {
  db.run(sql, params);
  saveDB();
  const result = db.exec('SELECT last_insert_rowid()');
  return result.length > 0 ? result[0].values[0][0] : 0;
}

module.exports = { getDB, initDB, saveDB, queryAll, queryOne, runSQL };
