const SUPABASE_URL = 'https://xuqsxfhehilyfikgnflk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1cXN4ZmhlaGlseWZpa2duZmxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDkzNTAsImV4cCI6MjA5NDY4NTM1MH0.xWudGr_c-b2zpUCD1gvLhyQm-zME5o3wRaI-DkUtZm0'

const REDIRECT_URL = window.location.origin

if (SUPABASE_ANON_KEY === 'PASTE_YOUR_ANON_KEY_HERE') {
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#080b10"><p style="color:#f87171;font-family:monospace;font-size:1rem;text-align:center">⚠️ Missing SUPABASE_ANON_KEY<br><br>เปิดไฟล์ js/config.js แล้วใส่ key จาก Supabase → Settings → API</p></div>'
  throw new Error('SUPABASE_ANON_KEY not configured')
}
