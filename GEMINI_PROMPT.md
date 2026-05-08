# Prompt สำหรับพัฒนาระบบใบสำคัญจ่ายเงิน (Payment Voucher System) ต่อ

## บทบาทของคุณ

คุณคือ Senior Full-Stack Developer ที่เชี่ยวชาญ Node.js, Express, และการทำงานกับ AI Vision API สำหรับอ่านเอกสารภาษาไทย คุณจะช่วยพัฒนาและแก้ไขระบบ Web Application สำหรับจัดการใบกำกับภาษีและใบสำคัญจ่ายเงินของ บริษัท ไอเอ็นซี เทคโนโลยี จำกัด

---

## ภาพรวมโปรเจค

**ชื่อระบบ:** ระบบใบสำคัญจ่ายเงิน - INC Technology
**วัตถุประสงค์:** อัปโหลดใบกำกับภาษี (Tax Invoice) ในรูปแบบ PDF หรือรูปภาพ → ใช้ AI Vision สกัดข้อมูลอัตโนมัติ → จัดเก็บในฐานข้อมูล → สร้างใบสำคัญจ่ายเงิน (Payment Voucher) → พิมพ์ออกมาได้

### Tech Stack
- **Backend:** Node.js + Express (CommonJS — ใช้ `require()` ไม่ใช้ ESM `import`)
- **Database:** sql.js (SQLite แบบ pure JavaScript — ไม่ต้องติดตั้ง native module)
- **AI Vision:** 
  - Priority 1: DeepSeek API (ราคาถูก — รองรับ PDF text extraction)
  - Priority 2: OpenAI API (text-based extraction via PDF text)
  - Priority 3: Google Gemini API (ดีที่สุด — รองรับ PDF และรูปภาพแบบ native)
  - Priority 4: Anthropic Claude API (เร็ว — รองรับ PDF และรูปภาพ)
  - Priority 5: Ollama local (ฟรี — ช้า, รองรับ vision model)
- **PDF→Image:** pdfjs-dist + canvas (pure JS — ไม่ต้องติดตั้ง ImageMagick/Ghostscript)
- **PDF→Text:** pdf-parse (pure JS)
- **Frontend:** Vanilla HTML/CSS/JS (ไม่ใช้ React/Vue)
- **Google Integration:** Google Drive (เก็บไฟล์) + Google Sheets (sync ข้อมูล) — optional

### โครงสร้างไฟล์
```
project/
├── server.js                 # Express server หลัก (381 บรรทัด)
├── server/
│   ├── ai-extractor.js       # AI Vision extraction (465 บรรทัด) ★ ไฟล์หลักที่ต้องแก้
│   ├── database.js            # SQLite database (72 บรรทัด)
│   ├── extractor.js           # Regex fallback extractor (218 บรรทัด)
│   ├── googleDrive.js         # Google Drive upload (49 บรรทัด)
│   └── googleSheets.js        # Google Sheets sync (33 บรรทัด)
├── public/
│   ├── index.html             # หน้าเว็บหลัก (535 บรรทัด)
│   ├── js/app.js              # Frontend JavaScript (944 บรรทัด)
│   └── css/style.css          # Stylesheet
├── .env                       # Configuration
├── package.json
└── data/voucher.db            # SQLite database file
```

---

## .env Configuration

```env
PORT=3000

# AI Vision API (ลำดับความสำคัญ: DeepSeek > OpenAI > Gemini > Anthropic > Ollama)
OPENAI_API_KEY=
OPENAI_API_KEY=sk-your-openai-api-key-here

GEMINI_API_KEY=your-gemini-api-key-here
ANTHROPIC_API_KEY=sk-ant-api-key-here
OLLAMA_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=gpt-4.1
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:31b-cloud
ANTHROPIC_API_KEY=
GEMINI_API_KEY=AIzaSyBGwOr3I21viMqXsLtOrobQAdo1pTv-lBs

# DeepSeek API - https://platform.deepseek.com/ (cost-effective, supports PDF text extraction)
DEEPSEEK_API_KEY=sk-5ccf4d39f0b74bd1b33e523e2daa68ba

# Google Drive & Sheets API
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_SHEET_ID=

# Company Info
COMPANY_NAME=บริษัท ไอเอ็นซี เทคโนโลยี จำกัด
COMPANY_TAX_ID=0105546142731
COMPANY_ADDRESS=126/260 ซอยรามอินทรา40 ถนนรามอินทรา แขวงคลองกุ่ม เขตบึงกุ่ม กรุงเทพมหานคร 10230
```

---

## Database Schema (sql.js / SQLite)

```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tax_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  seller_name TEXT NOT NULL,
  seller_tax_id TEXT,
  seller_branch TEXT,
  seller_address TEXT,
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  total_before_vat REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  grand_total REAL DEFAULT 0,
  withholding_tax REAL DEFAULT 0,
  net_total REAL DEFAULT 0,
  file_path TEXT,
  google_drive_id TEXT,
  google_drive_url TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  item_no INTEGER,
  description TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  FOREIGN KEY (invoice_id) REFERENCES tax_invoices(id) ON DELETE CASCADE
);

CREATE TABLE payment_vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_number TEXT,
  voucher_date DATE NOT NULL,
  invoice_id INTEGER,
  payee_name TEXT NOT NULL,
  description TEXT,
  amount REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  withholding_tax REAL DEFAULT 0,
  net_amount REAL DEFAULT 0,
  amount_in_words TEXT,
  payment_method TEXT DEFAULT 'cash',
  bank_name TEXT,
  bank_branch TEXT,
  cheque_number TEXT,
  cheque_date DATE,
  prepared_by TEXT,
  approved_by TEXT,
  received_by TEXT,
  checked_by TEXT,
  file_path TEXT,
  google_drive_id TEXT,
  google_drive_url TEXT,
  status TEXT DEFAULT 'draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES tax_invoices(id)
);

CREATE TABLE voucher_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id INTEGER NOT NULL,
  account_code TEXT,
  account_name TEXT,
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  FOREIGN KEY (voucher_id) REFERENCES payment_vouchers(id) ON DELETE CASCADE
);
```

---

## Source Code ทั้งหมด

### 1. server/ai-extractor.js (★ ไฟล์หลักที่มีปัญหา)

```javascript
const fs = require('fs');
const path = require('path');

const EXTRACTION_PROMPT = `You are an expert at reading Thai tax invoices.
Analyze this document and extract ALL data into JSON format.
Be extremely precise with numbers, dates, and Thai text.

Return ONLY valid JSON (no markdown, no explanation):
{
  "invoice_number": "invoice number",
  "invoice_date": "YYYY-MM-DD format",
  "seller_name": "seller company name in Thai",
  "seller_tax_id": "13-digit tax ID",
  "seller_branch": "branch number or office name",
  "buyer_name": "buyer company name",
  "buyer_tax_id": "buyer 13-digit tax ID",
  "items": [
    {"item_no": 1, "description": "item description", "quantity": 1, "unit_price": 0.00, "amount": 0.00}
  ],
  "discount": 0.00,
  "total_before_vat": 0.00,
  "vat_amount": 0.00,
  "grand_total": 0.00,
  "total_in_words": "amount in Thai words",
  "note": "any notes"
}

Rules:
- All amounts must be numbers (not strings)
- Date in YYYY-MM-DD (convert Thai Buddhist year: subtract 543)
- seller_name in Thai if available
- Extract ALL line items
- Empty string for missing text, 0 for missing numbers`;

class AIExtractor {
  constructor() {
    this.provider = null;
    this.anthropicClient = null;
    this.geminiModel = null;
    this.ollamaUrl = null;
    this.ollamaModel = null;
  }

  initialize() {
    var ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    var ollamaModel = process.env.OLLAMA_MODEL || '';

    if (ollamaModel) {
      this.ollamaUrl = ollamaUrl;
      this.ollamaModel = ollamaModel;
    }

    // Priority 1: Gemini (fastest — native PDF/image support)
    if (process.env.GEMINI_API_KEY) {
      try {
        var genai = require('@google/generative-ai');
        var ai = new genai.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.geminiModel = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
        this.provider = 'gemini';
        console.log('[AI] Using Google Gemini API (fast, native PDF support)');
        return true;
      } catch (e) { console.log('[AI] Gemini error:', e.message); }
    }

    // Priority 2: Anthropic Claude
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        var Anthropic = require('@anthropic-ai/sdk');
        this.anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        this.provider = 'anthropic';
        console.log('[AI] Using Anthropic Claude API');
        return true;
      } catch (e) { console.log('[AI] Anthropic error:', e.message); }
    }

    // Priority 3: Ollama (free, local — slower for vision)
    if (ollamaModel || process.env.OLLAMA_API_KEY) {
      this.ollamaUrl = ollamaUrl;
      this.ollamaModel = ollamaModel;
      this.provider = 'ollama';
      console.log('[AI] Using Ollama at ' + ollamaUrl + ' model: ' + (ollamaModel || 'auto-detect'));
      return true;
    }

    try {
      this.ollamaUrl = ollamaUrl;
      this.provider = 'ollama-pending';
    } catch (e) {}

    if (this.provider === 'ollama-pending') {
      console.log('[AI] Will try Ollama auto-detect on first request');
      return true;
    }

    console.log('[AI] No AI configured. Set GEMINI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_MODEL');
    return false;
  }

  async autoDetectOllama() {
    try {
      var response = await this.httpGet(this.ollamaUrl + '/api/tags');
      var data = JSON.parse(response);
      if (data.models && data.models.length > 0) {
        var visionModels = ['gemma4', 'gemma3', 'llava', 'llama3.2-vision', 'moondream', 'bakllava'];
        var allModels = data.models.map(function(m) { return m.name; });
        for (var i = 0; i < visionModels.length; i++) {
          for (var j = 0; j < allModels.length; j++) {
            if (allModels[j].toLowerCase().indexOf(visionModels[i]) >= 0) {
              this.ollamaModel = allModels[j];
              this.provider = 'ollama';
              console.log('[AI] Auto-detected Ollama vision model: ' + this.ollamaModel);
              return true;
            }
          }
        }
        for (var k = 0; k < allModels.length; k++) {
          if (allModels[k].indexOf(':cloud') >= 0) {
            this.ollamaModel = allModels[k];
            this.provider = 'ollama';
            console.log('[AI] Auto-detected Ollama cloud model: ' + this.ollamaModel);
            return true;
          }
        }
        this.ollamaModel = allModels[0];
        this.provider = 'ollama';
        console.log('[AI] Using first Ollama model: ' + this.ollamaModel);
        return true;
      }
    } catch (e) {
      console.log('[AI] Ollama not available:', e.message);
    }
    return false;
  }

  httpGet(url) {
    return new Promise(function(resolve, reject) {
      var mod = url.startsWith('https') ? require('https') : require('http');
      mod.get(url, function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() { resolve(data); });
      }).on('error', reject);
    });
  }

  httpPost(url, body) {
    return new Promise(function(resolve, reject) {
      var mod = url.startsWith('https') ? require('https') : require('http');
      var parsed = new (require('url').URL)(url);
      var postData = JSON.stringify(body);
      var options = {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
      };
      var req = mod.request(options, function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() { resolve(data); });
      });
      req.on('error', reject);
      req.setTimeout(180000, function() { req.destroy(new Error('Request timeout (3min)')); });
      req.write(postData);
      req.end();
    });
  }

  async convertPdfToImages(filePath) {
    try {
      var canvasLib = require('canvas');
      var createCanvas = canvasLib.createCanvas;
      var pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

      var data = new Uint8Array(fs.readFileSync(filePath));
      var doc = await pdfjsLib.getDocument({ data: data, useSystemFonts: true }).promise;
      var numPages = Math.min(doc.numPages, 2);
      var images = [];

      for (var i = 1; i <= numPages; i++) {
        var page = await doc.getPage(i);
        var origViewport = page.getViewport({ scale: 1.0 });
        var scale = Math.min(1200 / origViewport.width, 1.5);
        var viewport = page.getViewport({ scale: scale });
        var canvas = createCanvas(viewport.width, viewport.height);
        var ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

        var jpegBuffer = canvas.toBuffer('image/jpeg', { quality: 0.80 });
        var b64 = jpegBuffer.toString('base64');
        images.push(b64);
        console.log('[AI] PDF page ' + i + ' → JPEG ' + Math.round(jpegBuffer.length / 1024) + 'KB');
      }

      return images;
    } catch (err) {
      console.error('[AI] PDF to image conversion failed:', err.message);
      return [];
    }
  }

  async extractFromFile(filePath) {
    if (!this.provider) this.initialize();
    if (this.provider === 'ollama-pending') {
      var found = await this.autoDetectOllama();
      if (!found) this.provider = null;
    }

    if (!this.provider) {
      var regexExtractor = require('./extractor');
      var result = await regexExtractor.extractFromPDF(filePath);
      result.extraction_method = 'regex';
      return result;
    }

    try {
      var fileBuffer = fs.readFileSync(filePath);
      var base64Data = fileBuffer.toString('base64');
      var ext = path.extname(filePath).toLowerCase();
      var mimeType = ext === '.pdf' ? 'application/pdf' :
                     ext === '.png' ? 'image/png' :
                     ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                     ext === '.webp' ? 'image/webp' :
                     ext === '.gif' ? 'image/gif' :
                     ext === '.bmp' ? 'image/bmp' :
                     ext === '.tiff' || ext === '.tif' ? 'image/tiff' : 'application/pdf';

      var jsonStr;
      if (this.provider === 'ollama') {
        jsonStr = await this.extractWithOllama(filePath, base64Data, mimeType);
      } else if (this.provider === 'anthropic') {
        jsonStr = await this.extractWithAnthropic(base64Data, mimeType);
      } else if (this.provider === 'gemini') {
        jsonStr = await this.extractWithGemini(base64Data, mimeType);
      }

      var data = this.parseAIResponse(jsonStr);
      if (data) {
        var filled = [data.invoice_number, data.invoice_date, data.seller_name, data.grand_total > 0].filter(Boolean);
        if (filled.length === 0) {
          console.log('[AI] Primary AI returned empty data, trying backup...');
          var backupData = await this._tryBackupProviders(filePath, base64Data, mimeType);
          if (backupData) return backupData;
          var regexExtractor = require('./extractor');
          var fallback = await regexExtractor.extractFromPDF(filePath);
          fallback.extraction_method = 'regex-fallback';
          fallback.ai_error = 'All AI providers returned empty data';
          return fallback;
        }
        data.success = true;
        data.confidence = filled.length >= 3 ? 'high' : filled.length >= 2 ? 'medium' : 'low';
        data.extraction_method = this.provider + (this.provider === 'ollama' && this.ollamaModel ? ' (' + this.ollamaModel + ')' : '');
        return data;
      }
      throw new Error('Failed to parse AI response');
    } catch (err) {
      console.error('[AI] Error:', err.message);
      var backupData = await this._tryBackupProviders(filePath, base64Data, mimeType);
      if (backupData) return backupData;
      var regexExtractor = require('./extractor');
      var result = await regexExtractor.extractFromPDF(filePath);
      result.extraction_method = 'regex-fallback';
      result.ai_error = err.message;
      return result;
    }
  }

  async _tryBackupProviders(filePath, base64Data, mimeType) {
    if (this.provider !== 'ollama' && this.ollamaModel) {
      try {
        console.log('[AI] Trying Ollama backup (' + this.ollamaModel + ')...');
        var backupStr = await this.extractWithOllama(filePath, base64Data, mimeType);
        var backupData = this.parseAIResponse(backupStr);
        if (backupData) {
          var bf = [backupData.invoice_number, backupData.invoice_date, backupData.seller_name, backupData.grand_total > 0].filter(Boolean);
          if (bf.length > 0) {
            backupData.success = true;
            backupData.confidence = bf.length >= 3 ? 'high' : bf.length >= 2 ? 'medium' : 'low';
            backupData.extraction_method = 'ollama-backup (' + this.ollamaModel + ')';
            return backupData;
          }
        }
      } catch (e) { console.log('[AI] Ollama backup failed:', e.message); }
    }
    if (this.provider !== 'gemini' && process.env.GEMINI_API_KEY) {
      try {
        console.log('[AI] Trying Gemini backup...');
        var genai = require('@google/generative-ai');
        var ai = new genai.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        var model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
        var result = await model.generateContent([
          { inlineData: { mimeType: mimeType, data: base64Data } },
          { text: EXTRACTION_PROMPT }
        ]);
        var str = result.response.text();
        var gData = this.parseAIResponse(str);
        if (gData) {
          var gf = [gData.invoice_number, gData.invoice_date, gData.seller_name, gData.grand_total > 0].filter(Boolean);
          if (gf.length > 0) {
            gData.success = true;
            gData.confidence = gf.length >= 3 ? 'high' : gf.length >= 2 ? 'medium' : 'low';
            gData.extraction_method = 'gemini (backup)';
            return gData;
          }
        }
      } catch (e) { console.log('[AI] Gemini backup failed:', e.message); }
    }
    return null;
  }

  async extractWithOllama(filePath, base64Data, mimeType) {
    var isImage = mimeType.startsWith('image/');
    var isPdf = mimeType === 'application/pdf';
    var isVisionModel = /gemma[34]|llava|vision|moondream|bakllava/i.test(this.ollamaModel);

    if (isVisionModel) {
      var imagesToSend = [];
      if (isImage) {
        imagesToSend.push(base64Data);
      } else if (isPdf) {
        imagesToSend = await this.convertPdfToImages(filePath);
        if (imagesToSend.length === 0) {
          return this._extractWithOllamaText(filePath);
        }
      }

      if (imagesToSend.length > 0) {
        var body = {
          model: this.ollamaModel,
          messages: [{
            role: 'user',
            content: EXTRACTION_PROMPT + '\n\nAnalyze the invoice image(s) carefully. Read ALL Thai and English text visible in the document.',
            images: imagesToSend
          }],
          stream: false,
          options: { temperature: 0.1 }
        };
        var response = await this.httpPost(this.ollamaUrl + '/api/chat', body);
        var result = JSON.parse(response);
        return result.message ? result.message.content : '';
      }
    }

    return this._extractWithOllamaText(filePath);
  }

  async _extractWithOllamaText(filePath) {
    var rawText = '';
    try {
      var pdfParse = require('pdf-parse');
      var data = await pdfParse(fs.readFileSync(filePath));
      rawText = data.text;
    } catch (e) {
      rawText = 'Could not extract text: ' + e.message;
    }

    var textPrompt = EXTRACTION_PROMPT + '\n\nHere is the raw text from the Thai tax invoice PDF. Thai characters may be garbled, but numbers and English text should be correct:\n\n---\n' + rawText.substring(0, 5000) + '\n---';

    var body = {
      model: this.ollamaModel,
      messages: [{ role: 'user', content: textPrompt }],
      stream: false,
      options: { temperature: 0.1 }
    };
    var response = await this.httpPost(this.ollamaUrl + '/api/chat', body);
    var result = JSON.parse(response);
    return result.message ? result.message.content : '';
  }

  async extractWithAnthropic(base64Data, mimeType) {
    var isImage = mimeType.startsWith('image/');
    if (!isImage) {
      var response = await this.anthropicClient.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 4096,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
          { type: 'text', text: EXTRACTION_PROMPT }
        ]}]
      });
      return response.content[0].text;
    } else {
      var response = await this.anthropicClient.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 4096,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
          { type: 'text', text: EXTRACTION_PROMPT }
        ]}]
      });
      return response.content[0].text;
    }
  }

  async extractWithGemini(base64Data, mimeType) {
    var result = await this.geminiModel.generateContent([
      { inlineData: { mimeType: mimeType, data: base64Data } },
      { text: EXTRACTION_PROMPT }
    ]);
    return result.response.text();
  }

  parseAIResponse(text) {
    if (!text) return null;
    var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    var start = jsonStr.indexOf('{');
    var end = jsonStr.lastIndexOf('}');
    if (start >= 0 && end > start) jsonStr = jsonStr.substring(start, end + 1);

    try {
      var data = JSON.parse(jsonStr);
      return {
        invoice_number: String(data.invoice_number || ''),
        invoice_date: String(data.invoice_date || ''),
        seller_name: String(data.seller_name || ''),
        seller_tax_id: String(data.seller_tax_id || ''),
        seller_branch: String(data.seller_branch || ''),
        buyer_name: String(data.buyer_name || ''),
        buyer_tax_id: String(data.buyer_tax_id || ''),
        items: Array.isArray(data.items) ? data.items.map(function(item) {
          return {
            item_no: parseInt(item.item_no) || 0,
            description: String(item.description || ''),
            quantity: parseFloat(item.quantity) || 1,
            unit_price: parseFloat(item.unit_price) || 0,
            amount: parseFloat(item.amount) || 0
          };
        }) : [],
        discount: parseFloat(data.discount) || 0,
        total_before_vat: parseFloat(data.total_before_vat) || 0,
        vat_amount: parseFloat(data.vat_amount) || 0,
        grand_total: parseFloat(data.grand_total) || 0,
        total_in_words: String(data.total_in_words || ''),
        note: String(data.note || '')
      };
    } catch (e) {
      console.error('[AI] JSON parse error:', e.message);
      return null;
    }
  }
}

module.exports = new AIExtractor();
```

### 2. server.js (Express Server)

```javascript
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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

// API: Projects
app.get('/api/projects', (req, res) => {
  res.json(queryAll('SELECT * FROM projects ORDER BY name'));
});

app.post('/api/projects', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'ต้องระบุชื่อโปรเจค' });
  const id = runSQL('INSERT INTO projects (name, description) VALUES (?, ?)', [name, description || '']);
  try { await googleSheets.addProject({ id, name, description }); } catch (e) {}
  res.json({ id, name, description });
});

// API: Tax Invoices (CRUD)
app.get('/api/invoices', (req, res) => {
  const { search, project_id, date_from, date_to, status } = req.query;
  let sql = `SELECT ti.*, p.name as project_name FROM tax_invoices ti LEFT JOIN projects p ON ti.project_id = p.id WHERE 1=1`;
  const params = [];
  if (search) { sql += ` AND (ti.invoice_number LIKE ? OR ti.seller_name LIKE ? OR ti.notes LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (project_id) { sql += ` AND ti.project_id = ?`; params.push(Number(project_id)); }
  if (date_from) { sql += ` AND ti.invoice_date >= ?`; params.push(date_from); }
  if (date_to) { sql += ` AND ti.invoice_date <= ?`; params.push(date_to); }
  if (status) { sql += ` AND ti.status = ?`; params.push(status); }
  sql += ` ORDER BY ti.invoice_date DESC, ti.id DESC`;
  res.json(queryAll(sql, params));
});

// ... (POST /api/invoices, PUT /api/invoices/:id, DELETE /api/invoices/:id — full CRUD)
// ... (GET/POST /api/vouchers — full CRUD)
// ... (GET /api/dashboard — summary statistics)

// API: AI Vision Extract
app.post('/api/extract', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'กรุณาอัปโหลดไฟล์' });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tiff', '.tif'].includes(ext)) {
      return res.status(400).json({ error: 'รองรับเฉพาะ PDF และรูปภาพ' });
    }
    const result = await aiExtractor.extractFromFile(req.file.path);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: AI Status
app.get('/api/ai/status', (req, res) => {
  aiExtractor.initialize();
  res.json({
    provider: aiExtractor.provider || 'none',
    available: !!aiExtractor.provider,
    message: aiExtractor.provider
      ? 'AI Vision (' + aiExtractor.provider + ') พร้อมใช้งาน'
      : 'ไม่ได้ตั้งค่า API Key'
  });
});

// Google Auth routes ...
// Start server
async function start() {
  await initDB();
  googleDrive.configure();
  googleDrive.loadSavedToken();
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}
start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
```

### 3. server/database.js

```javascript
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
  fs.writeFileSync(DB_PATH, buffer);
}

async function initDB() {
  const database = await getDB();
  // Create tables (see schema above)
  saveDB();
}

function queryAll(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
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
```

### 4. server/extractor.js (Regex Fallback — ไม่แม่นยำ)

```javascript
const fs = require('fs');
const path = require('path');

class InvoiceExtractor {
  async extractFromPDF(filePath) {
    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      const text = data.text;
      if (!text || text.trim().length < 50) {
        return await this.extractWithOCR(filePath);
      }
      return this.parseInvoiceText(text);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // parseInvoiceText ใช้ regex จับข้อมูล — มีปัญหาเรื่อง:
  // - ภาษาไทยจาก pdf-parse จะเป็นอักขระแปลกๆ (garbled)
  // - จับตัวเลขผิดตำแหน่ง (discount กลายเป็น grand_total)
  // - ไม่รองรับรูปแบบใบกำกับภาษีที่หลากหลาย
  // ★ ไม่ควรพึ่งพา regex เป็นหลัก — ใช้ AI Vision เท่านั้น
}

module.exports = new InvoiceExtractor();
```

### 5. package.json

```json
{
  "name": "payment-voucher-system",
  "version": "1.0.0",
  "description": "ระบบจัดการใบกำกับภาษีและใบสำคัญจ่ายเงิน",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.95.1",
    "@google/generative-ai": "^0.24.1",
    "canvas": "^3.2.3",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "pdf-parse": "^1.1.1",
    "pdfjs-dist": "^4.4.168",
    "sql.js": "^1.9.0"
  },
  "optionalDependencies": {
    "googleapis": "^130.0.0",
    "tesseract.js": "^5.0.4"
  }
}
```

---

## ★ ปัญหาหลักที่ต้องแก้ไข

### 1. AI สกัดข้อมูลได้แต่ข้อมูลไม่ถูกต้อง (Critical)

**อาการ:** เมื่อใช้ AI Vision (Gemini) สกัดข้อมูลจากใบกำกับภาษี PDF/รูปภาพ ระบบสกัดได้สำเร็จ แต่ข้อมูลที่ได้ไม่ตรงกับเอกสารจริง เช่น:
- ตัวเลขจำนวนเงินผิด
- วันที่ผิด (อาจแปลงปี พ.ศ. ไม่ถูก)
- ชื่อผู้ขาย/รายการสินค้าไม่ตรง
- เลขที่ใบกำกับภาษีไม่ครบ

**สาเหตุที่เป็นไปได้:**
- EXTRACTION_PROMPT อาจไม่ชัดเจนพอสำหรับใบกำกับภาษีไทย
- ใบกำกับภาษีไทยมีหลายรูปแบบมาก (แนวตั้ง/แนวนอน, มี/ไม่มีตาราง, ภาษาไทย/อังกฤษผสม)
- อาจต้องใช้ structured output หรือ few-shot examples ใน prompt
- การแปลงปี พ.ศ. → ค.ศ. อาจไม่ชัดเจนใน prompt

**สิ่งที่ต้องทำ:**
1. ปรับปรุง EXTRACTION_PROMPT ให้เฉพาะเจาะจงมากขึ้นสำหรับใบกำกับภาษีไทย
2. เพิ่ม validation ตรวจสอบข้อมูลหลังสกัด เช่น:
   - เลขภาษี 13 หลักถูกต้อง?
   - total_before_vat * 1.07 ≈ grand_total?
   - items amount รวมกันได้เท่า subtotal?
3. เพิ่มระบบ retry — ถ้า validation ไม่ผ่าน ลองส่งใหม่พร้อม feedback
4. อาจต้องเพิ่ม example ของ JSON output ที่ถูกต้องใน prompt

### 2. Regex Fallback ข้อมูลไม่ตรง (Known Issue — ไม่ต้องแก้)

ผู้ใช้ยืนยันแล้วว่า regex fallback ไม่สามารถใช้งานได้จริง เพราะ pdf-parse อ่านภาษาไทยไม่ได้ (garbled text) ดังนั้น **ต้องพึ่งพา AI Vision เท่านั้น** — regex ควรเป็น last resort เท่านั้น

### 3. Ollama Vision ช้ามาก (Known Issue — ลดความสำคัญ)

Ollama vision model (gemma4:31b-cloud) ใช้เวลา 30-120 วินาทีต่อเอกสาร แม้จะ optimize ด้วย JPEG compression แล้ว ปัจจุบัน Gemini เป็น primary provider (เร็ว 6-10 วินาที) Ollama เป็น backup เท่านั้น

---

## ฟีเจอร์ที่ต้องพัฒนาเพิ่ม

### ลำดับความสำคัญสูง
1. **แก้ไขความถูกต้องของ AI extraction** — ปรับ prompt, เพิ่ม validation, เพิ่ม retry logic
2. **เพิ่ม buyer_name/buyer_tax_id** ในฟอร์มและ database — ปัจจุบันมีใน extraction prompt แต่ไม่ได้เก็บใน DB
3. **Preview เอกสาร** — แสดงรูปภาพ/PDF ในหน้าเว็บเพื่อให้ผู้ใช้ตรวจสอบข้อมูลที่ AI สกัดได้

### ลำดับความสำคัญกลาง
4. **Export ใบสำคัญจ่ายเป็น PDF** — ปัจจุบันแค่ print หน้าเว็บ ควรสร้าง PDF ที่มีรูปแบบสวยงาม
5. **Batch upload** — อัปโหลดหลายไฟล์พร้อมกัน สกัดข้อมูลทีเดียว
6. **Edit invoice** — ปัจจุบันแก้ไขข้อมูลใน DB ได้ แต่ไม่มี UI สำหรับแก้ไข items
7. **รองรับภาษีหัก ณ ที่จ่ายอัตโนมัติ** — คำนวณ 1%, 2%, 3%, 5% ตามประเภท

### ลำดับความสำคัญต่ำ
8. **User authentication** — ระบบ login สำหรับหลาย user
9. **Google Drive integration** — อัปโหลดไฟล์ไปเก็บใน Drive อัตโนมัติ
10. **รายงาน** — สรุปยอดรายเดือน, ส่งออก Excel

---

## รูปแบบใบกำกับภาษีไทยทั่วไป

ใบกำกับภาษีไทยมักมีข้อมูลดังนี้:
- **หัวเอกสาร:** "ใบกำกับภาษี/ใบเสร็จรับเงิน" หรือ "TAX INVOICE/RECEIPT"
- **ผู้ขาย:** ชื่อบริษัท, เลขประจำตัวผู้เสียภาษี 13 หลัก, สาขา, ที่อยู่
- **ผู้ซื้อ:** ชื่อบริษัท, เลขภาษี 13 หลัก
- **เลขที่ใบกำกับภาษี:** มีหลายรูปแบบ เช่น `6905-BR1439-00182`, `INV-2024-001`, `RE68050001234`
- **วันที่:** อาจเป็น พ.ศ. (เช่น 08/05/2569) หรือ ค.ศ. (เช่น 08/05/2026) — ต้องแปลงเป็น YYYY-MM-DD
- **รายการสินค้า:** ตาราง — ลำดับ, รายละเอียด, จำนวน, ราคาต่อหน่วย, จำนวนเงิน
- **ส่วนลด:** discount (ถ้ามี)
- **มูลค่าก่อน VAT:** total_before_vat
- **ภาษีมูลค่าเพิ่ม 7%:** vat_amount
- **ยอดรวมทั้งสิ้น:** grand_total
- **จำนวนเงินเป็นตัวอักษร:** เช่น "สองหมื่นสามพันห้าร้อยห้าสิบเก้าบาทสามสิบสตางค์"

---

## ข้อจำกัดและข้อควรระวัง

1. **CommonJS เท่านั้น** — ใช้ `require()` ห้ามใช้ `import` (ESM) เพราะ dependencies บางตัวไม่รองรับ
2. **Pure JavaScript** — ไม่ต้องติดตั้ง ImageMagick, Ghostscript หรือ binary อื่นๆ
3. **sql.js** — เป็น pure JS SQLite ไม่ต้อง compile native module ทำงานได้ทุก OS
4. **canvas** — มี prebuilt binary สำหรับ Windows/Mac/Linux ติดตั้งผ่าน npm ได้เลย
5. **ใบกำกับภาษีไทย** — ต้องรองรับทั้งภาษาไทยและอังกฤษ, ปี พ.ศ. และ ค.ศ.
6. **AI Providers:**
   - **Gemini API** (Priority 1) — ใช้ model `gemini-2.0-flash` รองรับ PDF และรูปภาพ native
   - **Anthropic Claude API** (Priority 2) — รองรับ PDF และรูปภาพ native
   - **DeepSeek API** (Priority 3) — ราคาถูก, รองรับ PDF text extraction เท่านั้น (ไม่ใช่ vision)
   - **Ollama Local** (Priority 4) — ฟรี, ช้า, รองรับ vision models (gemma4, llava)

### วิธีตั้งค่า DeepSeek API

1. สมัคร account ที่ https://platform.deepseek.com/
2. สร้าง API Key ใหม่ จากบอร์ด: https://platform.deepseek.com/api_keys
3. คัดลอก API Key ไปใส่ใน `.env` ที่ `DEEPSEEK_API_KEY=sk_live_xxxxx`
4. ระบบจะใช้ DeepSeek เป็น Priority 3 (หากไม่มี Gemini/Anthropic)

**เสีย**: DeepSeek รองรับการ extract PDF text แต่ **ไม่รองรับการส่ง image โดยตรง** ต้องแปลง PDF → text ก่อน เพราะฉะนั้นค่อนข้างไม่แม่นยำสำหรับใบกำกับภาษีแบบรูปภาพ ควรใช้ Gemini หรือ Anthropic เป็นหลัก

---

## วิธีรันโปรเจค

```bash
npm install
node server.js
# เปิด http://localhost:3000
```

---

## คำแนะนำในการพัฒนาต่อ

เมื่อคุณได้รับโค้ดและบริบทนี้แล้ว กรุณา:

1. **วิเคราะห์ EXTRACTION_PROMPT** ปัจจุบันและเสนอ prompt ใหม่ที่แม่นยำกว่า
2. **เพิ่ม validation logic** หลังจากสกัดข้อมูล เพื่อตรวจสอบความถูกต้อง
3. **เพิ่ม retry mechanism** — ถ้า validation ไม่ผ่าน ส่ง AI อีกรอบพร้อม feedback
4. **ทดสอบกับใบกำกับภาษีหลายรูปแบบ** — ให้มั่นใจว่าทำงานได้กับเอกสารจริงๆ
5. **เพิ่ม error handling** ที่ดีขึ้น — แสดงข้อผิดพลาดที่เข้าใจง่ายให้ผู้ใช้
6. **พิจารณา UI/UX** — เพิ่มฟีเจอร์ preview เอกสารเทียบกับข้อมูลที่สกัดได้
