// คัดลอกไฟล์นี้เป็น config.js แล้วใส่ค่าจาก Supabase → Settings → API
const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co'
const SUPABASE_ANON_KEY = 'PASTE_YOUR_ANON_KEY_HERE'

const REDIRECT_URL = window.location.origin

if (SUPABASE_ANON_KEY === 'PASTE_YOUR_ANON_KEY_HERE') {
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#080b10"><p style="color:#f87171;font-family:monospace;font-size:1rem;text-align:center">⚠️ Missing SUPABASE_ANON_KEY<br><br>คัดลอก js/config.example.js → js/config.js แล้วใส่ key จาก Supabase → Settings → API</p></div>'
  throw new Error('SUPABASE_ANON_KEY not configured')
}
