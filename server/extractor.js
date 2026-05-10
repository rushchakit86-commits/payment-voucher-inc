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

  async extractWithOCR(filePath) {
    try {
      let createWorker;
      try { createWorker = require('tesseract.js').createWorker; } catch (e) {
        return { success: false, error: 'tesseract.js not installed' };
      }
      const worker = await createWorker('tha+eng');
      const ret = await worker.recognize(filePath);
      await worker.terminate();
      const text = ret.data.text;
      if (!text || text.trim().length < 20) {
        return { success: false, error: 'Cannot read text from file' };
      }
      return this.parseInvoiceText(text);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  parseInvoiceText(text) {
    var result = {
      success: true, raw_text: text, invoice_number: '', invoice_date: '',
      seller_name: '', seller_tax_id: '', seller_branch: '',
      items: [], subtotal: 0, discount: 0, total_before_vat: 0,
      vat_amount: 0, grand_total: 0, confidence: 'medium'
    };

    try {
      // ===== Invoice Number =====
      // Try multiple patterns common in Thai invoices
      var invPatterns = [
        /(?:เลขที่|Invoice\s*(?:No\.?|Number|#)|No\.?|เลขที่ใบกำกับ)[:\s]*([A-Z0-9][\w\-\/]{3,20})/i,
        /(\d{4}-[A-Z]{2}\d{3,5}-\d{3,6})/,                    // 2024-AB1234-001
        /([A-Z]{2,4}[\-\/]\d{2,4}[\-\/]\d{3,6})/,             // IV-2024-001, TAX/2567/001
        /([A-Z]{2,4}\d{2,4}-\d{3,6})/,                         // IV67-00123
        /(?:Invoice|Receipt|Tax)[:\s#]*([A-Z0-9][\w\-]{4,20})/i // Invoice: ABC12345
      ];
      for (var ip = 0; ip < invPatterns.length; ip++) {
        var invMatch = text.match(invPatterns[ip]);
        if (invMatch) { result.invoice_number = invMatch[1].trim(); break; }
      }

      // ===== Date (dd/mm/yyyy or other formats) =====
      var datePatterns = [
        /(?:วันที่|Date)[:\s]*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i,
        /(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/,
        /(\d{1,2}\s+(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s+\d{4})/
      ];
      for (var dp = 0; dp < datePatterns.length; dp++) {
        var dateMatch = text.match(datePatterns[dp]);
        if (dateMatch) { result.invoice_date = this.parseThaiDate(dateMatch[1]); break; }
      }

      // ===== Seller Name =====
      // Try Thai company name pattern first
      var thaiCompanyMatch = text.match(/(?:บริษัท|ห้างหุ้นส่วน)\s+[^\n]{3,50}\s*(?:จำกัด|มหาชน)/);
      if (thaiCompanyMatch) {
        result.seller_name = thaiCompanyMatch[0].trim();
      } else {
        // Try digital signature
        var sigMatch = text.match(/cn=([^,]+)/);
        if (sigMatch) {
          result.seller_name = sigMatch[1].trim();
        } else {
          var signedBy = text.match(/Digitally signed by\s+(.+?)[\n\r]/);
          if (signedBy) result.seller_name = signedBy[1].trim();
        }
      }

      // ===== Tax IDs (13 digits) =====
      var taxIds = [];
      var taxRe = /\b(\d{13})\b/g;
      var tm;
      while ((tm = taxRe.exec(text)) !== null) taxIds.push(tm[1]);
      if (taxIds.length > 0) result.seller_tax_id = taxIds[0];

      // ===== Branch =====
      var branchMatch = text.match(/(?:สาขา|Branch)[:\s]*([^\n]{2,30})/i);
      if (branchMatch) {
        result.seller_branch = branchMatch[1].trim();
      } else if (result.invoice_number) {
        var brFromInv = result.invoice_number.match(/-[A-Z]{2}(\d{4})-/);
        if (brFromInv) result.seller_branch = brFromInv[1];
      }

      // ===== Amounts — keyword-based extraction =====
      // Grand Total / จำนวนเงินรวมทั้งสิ้น
      var gtPatterns = [
        /(?:Grand\s*Total|จำนวนเงินรวมทั้งสิ้น|ยอดรวมสุทธิ|รวมทั้งสิ้น|Total\s*Amount|Net\s*Total)[:\s]*([\d,]+\.\d{2})/i,
        /(?:รวมเงิน|Total)[:\s]*([\d,]+\.\d{2})/i
      ];
      for (var gp = 0; gp < gtPatterns.length; gp++) {
        var gtMatch = text.match(gtPatterns[gp]);
        if (gtMatch) { result.grand_total = parseFloat(gtMatch[1].replace(/,/g, '')); break; }
      }

      // VAT / ภาษีมูลค่าเพิ่ม
      var vatPatterns = [
        /(?:VAT|ภาษีมูลค่าเพิ่ม|Vat\s*\d*%?)[:\s]*([\d,]+\.\d{2})/i
      ];
      for (var vp = 0; vp < vatPatterns.length; vp++) {
        var vatMatch = text.match(vatPatterns[vp]);
        if (vatMatch) { result.vat_amount = parseFloat(vatMatch[1].replace(/,/g, '')); break; }
      }

      // Total Before VAT / มูลค่าสินค้า
      var tbvPatterns = [
        /(?:Total\s*Before\s*VAT|มูลค่าสินค้า|ราคาสินค้า|มูลค่าก่อนภาษี|Sub\s*Total|Subtotal)[:\s]*([\d,]+\.\d{2})/i
      ];
      for (var tp = 0; tp < tbvPatterns.length; tp++) {
        var tbvMatch = text.match(tbvPatterns[tp]);
        if (tbvMatch) { result.total_before_vat = parseFloat(tbvMatch[1].replace(/,/g, '')); break; }
      }

      // Discount / ส่วนลด
      var discMatch = text.match(/(?:Discount|ส่วนลด)[:\s]*([\d,]+\.\d{2})/i);
      if (discMatch) result.discount = parseFloat(discMatch[1].replace(/,/g, ''));

      // Calculate missing values
      if (result.total_before_vat > 0 && result.vat_amount > 0 && !result.grand_total) {
        result.grand_total = result.total_before_vat + result.vat_amount;
      }
      if (result.grand_total > 0 && result.vat_amount > 0 && !result.total_before_vat) {
        result.total_before_vat = result.grand_total - result.vat_amount;
      }

      // ===== Items =====
      // PDF sometimes splits item into 2 lines:
      //   Line A: "Ultra Care+ for IT 20,001-30,000 บสท EXP 04-05-2029"
      //   Line B: " 2,490.00 2 2,490.00 1"
      // Or puts it all on one line:
      //   "LENOVO DESKTOP AIO ... 21,990.00 1 21,990.00 1"

      var lines = text.split('\n');
      var skipWords = /Discount|Grand|VAT|\/\s*Total|DESCRIPTION|Amount|Quantit|Unit\s*Price|RECEIPT|TAX\s*INVOICE|http|www\.|signed|Digitally|conditions|S\/N:/i;
      var pendingDesc = null;

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        if (skipWords.test(line)) { pendingDesc = null; continue; }

        // Check if this line is ONLY numbers: "2,490.00 2 2,490.00 1"
        var numsOnly = line.match(/^\s*([\d,]+\.\d{2})\s+(\d+)\s+([\d,]+\.\d{2})\s+(\d+)\s*$/);
        if (numsOnly && pendingDesc) {
          // This is the numbers part of a split item
          var p1 = parseFloat(numsOnly[1].replace(/,/g, ''));
          var n1 = parseInt(numsOnly[2]);
          var p2 = parseFloat(numsOnly[3].replace(/,/g, ''));
          var n2 = parseInt(numsOnly[4]);
          var qty = Math.min(n1, n2) || 1;
          result.items.push({
            description: this.cleanDesc(pendingDesc),
            quantity: qty, unit_price: p1, amount: p2
          });
          pendingDesc = null;
          continue;
        }

        // Check full item line: "DESC 21,990.00 1 21,990.00 1"
        var rightNums = line.match(/([\d,]+\.\d{2})\s+(\d+)\s+([\d,]+\.\d{2})\s+(\d+)\s*$/);
        if (rightNums) {
          var descPart = line.substring(0, line.length - rightNums[0].length).trim();
          if (descPart.length >= 5) {
            var rp1 = parseFloat(rightNums[1].replace(/,/g, ''));
            var rn1 = parseInt(rightNums[2]);
            var rp2 = parseFloat(rightNums[3].replace(/,/g, ''));
            var rn2 = parseInt(rightNums[4]);
            var rqty = Math.min(rn1, rn2) || 1;
            result.items.push({
              description: this.cleanDesc(descPart),
              quantity: rqty, unit_price: rp1, amount: rp2
            });
            pendingDesc = null;
            continue;
          }
        }

        // Check if line has description text but no price numbers at end
        // This could be the first part of a split item
        var hasProductKeywords = /[A-Z]{3,}|EXP|Care|Ultra|Lenovo|Dell|HP|Samsung/i.test(line);
        var endsWithNumbers = /([\d,]+\.\d{2})\s*$/.test(line);
        if (hasProductKeywords && !endsWithNumbers && line.length > 10) {
          pendingDesc = line;
          continue;
        }

        // Also handle: line with desc + 2 prices (no qty column)
        var twoPrices = line.match(/([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/);
        if (twoPrices) {
          var descC = line.substring(0, line.length - twoPrices[0].length).trim();
          if (descC.length >= 5 && !/S\/N:/i.test(descC)) {
            var cup = parseFloat(twoPrices[1].replace(/,/g, ''));
            var camt = parseFloat(twoPrices[2].replace(/,/g, ''));
            result.items.push({
              description: this.cleanDesc(descC),
              quantity: 1, unit_price: cup, amount: camt
            });
            pendingDesc = null;
          }
        }
      }

      // ===== Confidence =====
      var filled = [
        result.invoice_number, result.invoice_date,
        result.seller_name, result.grand_total > 0
      ].filter(Boolean);
      result.confidence = filled.length >= 3 ? 'high' : filled.length >= 2 ? 'medium' : 'low';

    } catch (err) {
      result.confidence = 'low';
    }
    return result;
  }

  cleanDesc(desc) {
    desc = desc.replace(/^\d+[\.\s]+/, '');
    desc = desc.replace(/\s*S\/N:\S+/g, '');
    return desc.trim();
  }

  parseThaiDate(dateStr) {
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(dateStr)) {
      var p = dateStr.split('.');
      return p[0] + '-' + p[1] + '-' + p[2];
    }
    var parts = dateStr.split(/[\/\-\.]/);
    if (parts.length !== 3) return '';
    var day = parseInt(parts[0]);
    var month = parseInt(parts[1]);
    var year = parseInt(parts[2]);
    if (year > 2500) year -= 543;
    if (year < 100) year += 2000;
    if (year > 2500) year -= 543;
    return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }
}

module.exports = new InvoiceExtractor();
