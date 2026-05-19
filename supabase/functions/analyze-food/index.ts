import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_KEY = Deno.env.get('GEMINI_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

// In-memory rate limit: 20 calls / 60s per user (resets on cold-start)
const rateMap = new Map<string, { count: number; reset: number }>()
function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(userId)
  if (!entry || now > entry.reset) { rateMap.set(userId, { count: 1, reset: now + 60_000 }); return true }
  if (entry.count >= 20) return false
  entry.count++
  return true
}

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = ALLOWED_ORIGIN === '*'
    ? '*'
    : (origin === ALLOWED_ORIGIN || origin?.startsWith('http://localhost') ? origin! : ALLOWED_ORIGIN)
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null
}

function sanitize(raw: Record<string, unknown>) {
  return {
    food_name: typeof raw.food_name === 'string' ? raw.food_name.slice(0, 200) : '',
    calories_kcal: toNum(raw.calories_kcal),
    protein_g: toNum(raw.protein_g),
    carb_g: toNum(raw.carb_g),
    fat_g: toNum(raw.fat_g),
    portion_desc: typeof raw.portion_desc === 'string' ? raw.portion_desc.slice(0, 200) : '',
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const cors = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401, headers: cors })
  }
  const jwt = authHeader.replace('Bearer ', '')
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authError } = await adminClient.auth.getUser(jwt)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401, headers: cors })
  }

  if (!checkRateLimit(user.id)) {
    return new Response(JSON.stringify({ error: 'RATE_LIMIT' }), { status: 429, headers: cors })
  }

  try {
    const body = await req.json()
    const { foodName, imageBase64, mimeType } = body

    if (!foodName && !imageBase64) {
      return new Response(JSON.stringify({ error: 'MISSING_INPUT' }), { status: 400, headers: cors })
    }

    const jsonSchema = `{"food_name":"ชื่ออาหารที่ชัดเจน","calories_kcal":number,"protein_g":number,"carb_g":number,"fat_g":number,"portion_desc":"ปริมาณที่ประมาณ เช่น 1 จาน ~300g"}`

    let contents: unknown[]
    if (imageBase64) {
      const safeMime = ALLOWED_MIME.has(mimeType) ? mimeType : 'image/jpeg'
      contents = [{
        parts: [
          { inline_data: { mime_type: safeMime, data: imageBase64 } },
          { text: `วิเคราะห์อาหารที่เห็นในรูปนี้ ตอบเป็น JSON เท่านั้น ไม่ต้องอธิบาย:\n${jsonSchema}\nประมาณจากปริมาณที่เห็นในรูป ไม่ต้องใส่ null` }
        ]
      }]
    } else {
      const safe = String(foodName).replace(/[<>"'`]/g, '').slice(0, 200)
      contents = [{
        parts: [{ text: `คุณเป็นนักโภชนาการไทย ประมาณสารอาหารของ: \`\`\`${safe}\`\`\` (1 มื้อ / ขนาดเสิร์ฟปกติในไทย)\nตอบเป็น JSON เท่านั้น ไม่ต้องอธิบาย:\n${jsonSchema}\nประมาณให้สมจริง ไม่ต้องใส่ null` }]
      }]
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.2, maxOutputTokens: 300 }
        })
      }
    )

    const data = await res.json()
    const candidate = data.candidates?.[0]

    if (!candidate?.content || candidate.finishReason === 'SAFETY') {
      return new Response(JSON.stringify({ error: 'BLOCKED', reason: candidate?.finishReason ?? 'no candidate' }), { status: 422, headers: cors })
    }

    const text = candidate.content.parts[0].text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'NO_JSON' }), { status: 422, headers: cors })
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return new Response(JSON.stringify({ error: 'PARSE_ERROR' }), { status: 422, headers: cors })
    }

    return new Response(JSON.stringify(sanitize(parsed)), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })

  } catch {
    return new Response(JSON.stringify({ error: 'INTERNAL_ERROR' }), { status: 500, headers: cors })
  }
})
