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
    this.openaiApiKey = null;
    this.openaiModel = null;
    this.deepseekApiKey = null;
    this.ollamaUrl = null;
    this.ollamaModel = null;
  }

  initialize() {
    var ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    var ollamaModel = process.env.OLLAMA_MODEL || '';

    // Always save Ollama config for backup use
    if (ollamaModel) {
      this.ollamaUrl = ollamaUrl;
      this.ollamaModel = ollamaModel;
    }

    // Priority 1: DeepSeek (cost-effective, text extraction from PDF)
    if (process.env.DEEPSEEK_API_KEY) {
      this.deepseekApiKey = process.env.DEEPSEEK_API_KEY;
      this.provider = 'deepseek';
      console.log('[AI] Using DeepSeek API (cost-effective, PDF text support)');
      return true;
    }

    // Priority 2: OpenAI (text-based extraction)
    if (process.env.OPENAI_API_KEY) {
      this.openaiApiKey = process.env.OPENAI_API_KEY;
      this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4.1';
      this.provider = 'openai';
      console.log('[AI] Using OpenAI API model: ' + this.openaiModel);
      return true;
    }

    // Priority 3: Gemini (fastest — native PDF/image support, no conversion needed)
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

    // Priority 4: Anthropic Claude (fast, native PDF support)
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        var Anthropic = require('@anthropic-ai/sdk');
        this.anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        this.provider = 'anthropic';
        console.log('[AI] Using Anthropic Claude API');
        return true;
      } catch (e) { console.log('[AI] Anthropic error:', e.message); }
    }

    // Priority 4: Ollama (free, local — slower for vision tasks)
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

    console.log('[AI] No AI configured. Set OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, or OLLAMA_MODEL');
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

  httpPost(url, body, extraHeaders) {
    return new Promise(function(resolve, reject) {
      var mod = url.startsWith('https') ? require('https') : require('http');
      var parsed = new (require('url').URL)(url);
      var postData = JSON.stringify(body);
      var options = {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }, extraHeaders || {})
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

  // Convert PDF pages to JPEG base64 images using pdfjs-dist + canvas (pure JS, no external binaries)
  async convertPdfToImages(filePath) {
    try {
      var canvasLib = require('canvas');
      var createCanvas = canvasLib.createCanvas;
      var pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

      var data = new Uint8Array(fs.readFileSync(filePath));
      var doc = await pdfjsLib.getDocument({ data: data, useSystemFonts: true }).promise;
      var numPages = Math.min(doc.numPages, 2); // Max 2 pages for speed
      var images = [];

      for (var i = 1; i <= numPages; i++) {
        var page = await doc.getPage(i);
        // Calculate scale to fit max 1200px width (good enough for AI vision, much faster)
        var origViewport = page.getViewport({ scale: 1.0 });
        var scale = Math.min(1200 / origViewport.width, 1.5);
        var viewport = page.getViewport({ scale: scale });
        var canvas = createCanvas(viewport.width, viewport.height);
        var ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

        // Use JPEG at 80% quality — 3-5x smaller than PNG, still clear for AI
        var jpegBuffer = canvas.toBuffer('image/jpeg', { quality: 0.80 });
        var b64 = jpegBuffer.toString('base64');
        images.push(b64);
        console.log('[AI] PDF page ' + i + ' → JPEG ' + Math.round(jpegBuffer.length / 1024) + 'KB (scale=' + scale.toFixed(2) + ')');
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
      } else if (this.provider === 'openai') {
        jsonStr = await this.extractWithOpenAI(filePath, mimeType);
      } else if (this.provider === 'gemini') {
        jsonStr = await this.extractWithGemini(base64Data, mimeType);
      } else if (this.provider === 'deepseek') {
        jsonStr = await this.extractWithDeepSeek(filePath, mimeType);
      }

      var data = this.parseAIResponse(jsonStr);
      if (data) {
        var filled = [data.invoice_number, data.invoice_date, data.seller_name, data.grand_total > 0].filter(Boolean);
        if (filled.length === 0) {
          console.log('[AI] Primary AI (' + this.provider + ') returned empty data, trying backup...');
          var backupData = await this._tryBackupProviders(filePath, base64Data, mimeType);
          if (backupData) return backupData;
          // Last resort: regex
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
    // Try Ollama vision as backup (if not already primary)
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
    // Try Gemini as backup (if not already primary)
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
    // Try OpenAI as backup
    if (this.provider !== 'openai' && process.env.OPENAI_API_KEY) {
      try {
        console.log('[AI] Trying OpenAI backup...');
        var backupStr = await this.extractWithOpenAI(filePath, mimeType);
        var backupData = this.parseAIResponse(backupStr);
        if (backupData) {
          var of = [backupData.invoice_number, backupData.invoice_date, backupData.seller_name, backupData.grand_total > 0].filter(Boolean);
          if (of.length > 0) {
            backupData.success = true;
            backupData.confidence = of.length >= 3 ? 'high' : of.length >= 2 ? 'medium' : 'low';
            backupData.extraction_method = 'openai-backup (' + (process.env.OPENAI_MODEL || 'gpt-4.1') + ')';
            return backupData;
          }
        }
      } catch (e) { console.log('[AI] OpenAI backup failed:', e.message); }
    }
    // Try DeepSeek as backup
    if (this.provider !== 'deepseek' && process.env.DEEPSEEK_API_KEY) {
      try {
        console.log('[AI] Trying DeepSeek backup...');
        var dsStr = await this.extractWithDeepSeek(filePath, mimeType);
        var dsData = this.parseAIResponse(dsStr);
        if (dsData) {
          var dsf = [dsData.invoice_number, dsData.invoice_date, dsData.seller_name, dsData.grand_total > 0].filter(Boolean);
          if (dsf.length > 0) {
            dsData.success = true;
            dsData.extraction_method = 'deepseek (backup)';
            return dsData;
          }
        }
      } catch (e) { console.log('[AI] DeepSeek backup failed:', e.message); }
    }
    return null;
  }

  async extractWithOllama(filePath, base64Data, mimeType) {
    var isImage = mimeType.startsWith('image/');
    var isPdf = mimeType === 'application/pdf';
    var isVisionModel = /gemma[34]|llava|vision|moondream|bakllava/i.test(this.ollamaModel);

    if (isVisionModel) {
      // VISION MODEL: Send images for visual analysis
      var imagesToSend = [];

      if (isImage) {
        imagesToSend.push(base64Data);
        console.log('[AI] Sending image directly to vision model (' + mimeType + ')');
      } else if (isPdf) {
        console.log('[AI] Converting PDF to images for vision model...');
        imagesToSend = await this.convertPdfToImages(filePath);
        if (imagesToSend.length === 0) {
          console.log('[AI] Image conversion failed, falling back to text extraction');
          return this._extractWithOllamaText(filePath);
        }
        console.log('[AI] Sending ' + imagesToSend.length + ' page image(s) to vision model');
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
        console.log('[AI] Sending to Ollama vision... (this may take 30-120 seconds)');
        var response = await this.httpPost(this.ollamaUrl + '/api/chat', body);
        var result = JSON.parse(response);
        var content = result.message ? result.message.content : '';
        console.log('[AI] Ollama vision response: ' + content.length + ' chars');
        if (content.length > 0) {
          console.log('[AI] Response preview: ' + content.substring(0, 200));
        }
        return content;
      }
    }

    // NON-VISION MODEL: extract text then send to LLM
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

  async extractWithDeepSeek(filePath, mimeType) {
    let rawText = '';
    if (mimeType === 'application/pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(fs.readFileSync(filePath));
        rawText = data.text.substring(0, 8000);
        if (!rawText || rawText.trim().length === 0) {
          console.log('[AI] PDF text extraction returned empty, skipping DeepSeek');
          throw new Error('No text extracted from PDF');
        }
      } catch (e) {
        console.log('[AI] DeepSeek: PDF text extraction failed:', e.message);
        throw new Error('Cannot process PDF: ' + e.message);
      }
    } else {
      console.log('[AI] DeepSeek: Image file provided, but DeepSeek only supports text input.');
      throw new Error('DeepSeek requires PDF text extraction, not direct image analysis');
    }

    const textPrompt = EXTRACTION_PROMPT + '\n\nHere is the extracted text from a Thai tax invoice PDF:\n\n---\n' + rawText + '\n---\n\nExtract ALL invoice data and return ONLY valid JSON.';
    
    const body = {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are an expert at extracting data from Thai tax invoices. Return ONLY valid JSON, no markdown or explanation.' },
        { role: 'user', content: textPrompt }
      ],
      temperature: 0.1,
      max_tokens: 4096
    };

    try {
      const response = await this.httpPost('https://api.deepseek.com/chat/completions', body, {
        'Authorization': 'Bearer ' + this.deepseekApiKey,
        'Content-Type': 'application/json'
      });
      
      const result = JSON.parse(response);
      
      if (!result.choices || result.choices.length === 0) {
        console.log('[AI] DeepSeek API error:', result.error ? result.error.message : 'No response');
        throw new Error('DeepSeek API returned no content');
      }
      
      if (result.error) {
        console.log('[AI] DeepSeek API error:', result.error.message);
        throw new Error('DeepSeek API error: ' + result.error.message);
      }
      
      const content = result.choices[0].message.content;
      console.log('[AI] DeepSeek extraction: ' + content.length + ' chars, preview:', content.substring(0, 150));
      return content;
    } catch (err) {
      console.error('[AI] DeepSeek request failed:', err.message);
      throw err;
    }
  }

  async extractWithAnthropic(base64Data, mimeType) {
    var isImage = mimeType.startsWith('image/');
    if (!isImage) {
      var response = await this.anthropicClient.messages.create({
        model: 'claude-sonnet-4', max_tokens: 4096,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
          { type: 'text', text: EXTRACTION_PROMPT }
        ]}]
      });
      return response.content[0].text;
    } else {
      var response = await this.anthropicClient.messages.create({
        model: 'claude-sonnet-4', max_tokens: 4096,
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

  async extractWithOpenAI(filePath, mimeType) {
    var rawText = '';
    if (mimeType === 'application/pdf') {
      try {
        var pdfParse = require('pdf-parse');
        var data = await pdfParse(fs.readFileSync(filePath));
        rawText = data.text;
        if (!rawText || rawText.trim().length === 0) {
          throw new Error('No text extracted from PDF');
        }
      } catch (e) {
        console.log('[AI] OpenAI: PDF text extraction failed:', e.message);
        throw new Error('OpenAI requires text extraction from PDF. ' + e.message);
      }
    } else {
      throw new Error('OpenAI provider currently supports PDF text extraction only.');
    }

    var prompt = EXTRACTION_PROMPT + '\n\nHere is the extracted text from the invoice PDF:\n\n---\n' + rawText.substring(0, 15000) + '\n---\n\nReturn only valid JSON.';
    var body = {
      model: this.openaiModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 4096
    };
    try {
      var response = await this.httpPost('https://api.openai.com/v1/chat/completions', body, {
        Authorization: 'Bearer ' + this.openaiApiKey,
        'Content-Type': 'application/json'
      });
      var result = JSON.parse(response);
      if (result.error) {
        console.log('[AI] OpenAI API error:', result.error);
        throw new Error(result.error.message || 'OpenAI API error');
      }
      if (!result.choices || !result.choices.length) {
        throw new Error('OpenAI returned no choices');
      }
      return result.choices[0].message.content;
    } catch (e) {
      console.error('[AI] OpenAI request failed:', e.message);
      throw e;
    }
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
      console.error('[AI] JSON parse error:', e.message, 'Raw:', jsonStr.substring(0, 200));
      return null;
    }
  }
}

module.exports = new AIExtractor();
