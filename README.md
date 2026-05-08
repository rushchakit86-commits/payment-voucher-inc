# ระบบใบสำคัญจ่ายเงิน (Payment Voucher System)

ระบบเว็บสำหรับจัดการใบกำกับภาษี → สร้างใบสำคัญจ่ายเงิน  
ใช้ **AI Vision** สกัดข้อมูลจากเอกสาร PDF และรูปภาพ รองรับภาษาไทย

---

## สิ่งที่ต้องติดตั้งก่อนใช้งาน (Prerequisites)

### 1. Node.js (จำเป็น)
- **เวอร์ชันแนะนำ:** 20 ขึ้นไป
- **ดาวน์โหลด:** https://nodejs.org/en/download/
- ติดตั้งแล้วเปิด Terminal/PowerShell ทดสอบ: `node --version`

### 2. Ollama - AI ประมวลผลบนเครื่อง (แนะนำ, ฟรี)
- **ดาวน์โหลด:** https://ollama.com/download
- ติดตั้งแล้วเปิดโปรแกรม Ollama
- ดาวน์โหลดโมเดลที่รองรับ Vision:
  ```bash
  ollama pull gemma4:12b
  ```
  หรือถ้าเครื่องมี RAM มาก (32GB+):
  ```bash
  ollama pull gemma4:27b
  ```
  หรือใช้ Cloud model (ต้องสมัคร Google AI):
  ```bash
  ollama pull gemma4:31b-cloud
  ```
- **Vision Models ที่รองรับ:** gemma4, gemma3, llava, llama3.2-vision, moondream, bakllava

### 3. ทางเลือก AI อื่น (ไม่จำเป็นถ้าใช้ Ollama)
- **Google Gemini API (ฟรี):** สมัครที่ https://aistudio.google.com/apikey
- **Anthropic Claude API (เสียเงิน):** สมัครที่ https://console.anthropic.com/

---

## การติดตั้ง

```bash
# 1. Clone หรือดาวน์โหลดโปรเจค
cd "path/to/Web appication ใบสำคัญจ่าย"

# 2. ติดตั้ง dependencies
npm install

# 3. ตั้งค่า .env (แก้ไขตามต้องการ)
# แก้ไขไฟล์ .env ในโฟลเดอร์โปรเจค
# - OLLAMA_MODEL=gemma4:12b  (ชื่อโมเดลที่ดาวน์โหลด)
# - GEMINI_API_KEY=xxx        (ถ้าใช้ Gemini เป็น backup)

# 4. เริ่มต้น server
node server.js

# 5. เปิดเบราว์เซอร์
# ไปที่ http://localhost:3000
```

---

## ลำดับการเลือก AI Provider

ระบบเลือก AI provider ตามลำดับนี้:

1. **Ollama** (ฟรี, รันบนเครื่อง) — ถ้าตั้งค่า `OLLAMA_MODEL` ใน .env
2. **Anthropic Claude** — ถ้าตั้งค่า `ANTHROPIC_API_KEY` ใน .env
3. **Google Gemini** — ถ้าตั้งค่า `GEMINI_API_KEY` ใน .env
4. **Regex fallback** — สกัดข้อมูลด้วย pattern matching (ความแม่นยำต่ำกว่า)

ถ้า AI หลักสกัดข้อมูลไม่ได้ ระบบจะลอง Gemini เป็น backup อัตโนมัติ

---

## ไฟล์ที่รองรับ

- **PDF** (ใบกำกับภาษี) — แปลงเป็นภาพแล้วส่งให้ Vision AI อ่าน
- **JPG / JPEG** — ส่งให้ Vision AI โดยตรง
- **PNG** — ส่งให้ Vision AI โดยตรง
- **WebP, BMP, TIFF** — รองรับเช่นกัน

---

## การตั้งค่า .env

```env
PORT=3000

# Ollama (ฟรี, รันบนเครื่อง)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:12b

# Anthropic Claude API (ทางเลือก)
ANTHROPIC_API_KEY=

# Google Gemini API (ทางเลือก/backup)
GEMINI_API_KEY=

# ข้อมูลบริษัท
COMPANY_NAME=บริษัท ตัวอย่าง จำกัด
COMPANY_TAX_ID=0123456789012
COMPANY_ADDRESS=ที่อยู่บริษัท
```

---

## การแก้ปัญหา

### Ollama ไม่ทำงาน
1. ตรวจสอบว่าเปิดโปรแกรม Ollama แล้ว
2. ทดสอบ: `curl http://localhost:11434/api/tags`
3. ถ้าไม่มีโมเดล: `ollama pull gemma4:12b`

### AI สกัดข้อมูลไม่ถูกต้อง
- ตรวจสอบคุณภาพไฟล์ (PDF ชัด, ไม่เบลอ)
- ลองใช้ไฟล์รูปภาพ (JPG/PNG) แทน PDF
- ตั้งค่า Gemini API เป็น backup ใน .env

### Server ไม่เริ่มทำงาน
1. ตรวจสอบ Node.js: `node --version`
2. ติดตั้ง dependencies ใหม่: `npm install`
3. ตรวจสอบ port 3000 ว่างอยู่

---

## เทคโนโลยีที่ใช้

- **Backend:** Node.js, Express
- **Database:** SQLite (sql.js)
- **AI Vision:** Ollama (gemma4), Anthropic Claude, Google Gemini
- **PDF Processing:** pdfjs-dist + canvas (แปลง PDF → ภาพ)
- **PDF Generation:** PDFKit (สร้างใบสำคัญจ่าย)
