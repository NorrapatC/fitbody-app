# 🏋️ FitBody App — Setup Guide

## โครงสร้างไฟล์
```
nora/
├── index.html       ← หน้า Login / Register
├── input.html       ← กรอกข้อมูล InBody (อัปโหลดรูป หรือ กรอกเอง)
├── dashboard.html   ← Dashboard หลัก (แผนส่วนตัว)
├── setup.sql        ← SQL สำหรับสร้าง Database
├── js/
│   └── config.js   ← ← ← ใส่ Keys ของคุณตรงนี้
└── README.md        ← ไฟล์นี้
```

---

## ขั้นตอนที่ 1 — สร้าง Supabase Project

1. ไปที่ https://supabase.com → Login
2. กด **"New Project"**
   - Name: `fitness-app`
   - Region: **Southeast Asia (Singapore)**
   - ตั้ง Password อะไรก็ได้
3. รอ ~2 นาที

---

## ขั้นตอนที่ 2 — Copy API Keys

1. ใน Supabase → **Settings (⚙️) → API**
2. Copy สองค่านี้:
   - **Project URL** (เช่น `https://abcdef.supabase.co`)
   - **anon public** key (ยาว ๆ)
3. เปิดไฟล์ `js/config.js` แล้วแก้ไข:

```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co'   // ← ใส่ตรงนี้
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIs...'      // ← ใส่ตรงนี้
const ANTHROPIC_KEY = 'sk-ant-...'                         // ← ใส่ตรงนี้
```

---

## ขั้นตอนที่ 3 — รัน SQL สร้าง Database

1. ใน Supabase → **SQL Editor**
2. กด **"New Query"**
3. Copy เนื้อหาจากไฟล์ `setup.sql` ทั้งหมด แล้ว Paste
4. กด **"Run"** (▶)
5. ควรเห็น "Success" ✅

---

## ขั้นตอนที่ 4 — เปิด Google Login

1. ใน Supabase → **Authentication → Providers → Google**
2. Toggle เปิด Enable
3. ไปที่ https://console.cloud.google.com
4. สร้าง Project → **APIs & Services → Credentials**
5. สร้าง **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
6. Copy **Client ID** และ **Client Secret** ใส่ใน Supabase → Google Provider

---

## ขั้นตอนที่ 5 — สร้าง Storage Bucket

1. ใน Supabase → **Storage**
2. กด **"New Bucket"**
   - Name: `inbody-images`
   - Public bucket: ✅ เปิด
3. กด **Create**

---

## ขั้นตอนที่ 6 — หา Claude API Key

1. ไปที่ https://console.anthropic.com
2. **API Keys → Create Key**
3. Copy มาใส่ใน `js/config.js`

---

## ขั้นตอนที่ 7 — ทดสอบ

เปิดไฟล์ `index.html` ใน Browser ได้เลย!

> ⚠️ ถ้าใช้ Chrome อาจต้องรัน Local Server:
> - ติดตั้ง VS Code + Extension "Live Server"
> - คลิกขวาที่ index.html → "Open with Live Server"

---

## Flow การใช้งาน

```
1. เปิด index.html
2. Login ด้วย Google หรือ Email
3. ถ้าไม่มีข้อมูล → กด "+ เพิ่มข้อมูล InBody"
4. เลือก "อัปโหลดรูป" หรือ "กรอกเอง"
   - อัปโหลดรูป: AI อ่านตัวเลขให้อัตโนมัติ
   - กรอกเอง: ใส่ตัวเลขจาก InBody Sheet
5. กรอกข้อมูลส่วนตัว + เป้าหมาย + กีฬาที่เล่น
6. กด "บันทึก" → Dashboard ปรับแผนให้ตามข้อมูลของคุณ
```

---

## รองรับ User กี่คน?

Supabase Free Tier รองรับ:
- **50,000 MAU** (Monthly Active Users) ✅
- **500 MB Database** ✅
- **1 GB Storage** ✅
- **5 GB Bandwidth** ✅

สำหรับ 5–6 คน มากกว่าพอมากครับ 🎉

---

## ปัญหาที่พบบ่อย

| ปัญหา | วิธีแก้ |
|-------|---------|
| หน้าขาว / Error | เปิด Browser Console (F12) ดู Error |
| Login ไม่ได้ | ตรวจสอบ Supabase URL และ Key ใน config.js |
| AI อ่านรูปไม่ได้ | ตรวจสอบ Anthropic API Key |
| Google Login ไม่ทำงาน | ตรวจสอบ Redirect URI ใน Google Console |
| รูปอัปโหลดไม่ได้ | สร้าง Storage Bucket ชื่อ `inbody-images` |
