import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_KEY = Deno.env.get('GEMINI_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*'

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

type MealItem = { main: string; alt: string; amt: string }
type Meal = { name: string; items: MealItem[] }
type MealPlan = {
  day_label: string
  breakfast: Meal
  lunch: Meal
  dinner: Meal
  post_workout: Meal
}

const DAY_NAMES_TH = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์']
const GOAL_TH: Record<string, string> = {
  fat_loss: 'ลดไขมัน (Caloric Deficit)',
  muscle_gain: 'เพิ่มกล้ามเนื้อ (Caloric Surplus)',
  maintain: 'รักษาน้ำหนัก (Maintenance)',
}
const SPORT_TH: Record<string, string> = {
  weight_training: 'เวทเทรนนิ่ง',
  running: 'วิ่ง',
  badminton: 'แบดมินตัน',
  swimming: 'ว่ายน้ำ',
  cycling: 'จักรยาน',
  hyrox: 'Hyrox',
  football: 'ฟุตบอล',
  muaythai: 'มวยไทย',
}

function sanitizeMealPlan(raw: unknown): MealPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  function sanitizeMeal(m: unknown): Meal | null {
    if (!m || typeof m !== 'object') return null
    const meal = m as Record<string, unknown>
    const name = typeof meal.name === 'string' ? meal.name.slice(0, 200) : ''
    const rawItems = Array.isArray(meal.items) ? meal.items : []
    const items: MealItem[] = rawItems.slice(0, 6).map((it: unknown) => {
      const i = (it || {}) as Record<string, unknown>
      return {
        main: typeof i.main === 'string' ? i.main.slice(0, 150) : '',
        alt: typeof i.alt === 'string' ? i.alt.slice(0, 150) : '',
        amt: typeof i.amt === 'string' ? i.amt.slice(0, 60) : '',
      }
    })
    return { name, items }
  }

  const breakfast = sanitizeMeal(r.breakfast)
  const lunch = sanitizeMeal(r.lunch)
  const dinner = sanitizeMeal(r.dinner)
  const post_workout = sanitizeMeal(r.post_workout)
  if (!breakfast || !lunch || !dinner || !post_workout) return null

  return {
    day_label: typeof r.day_label === 'string' ? r.day_label.slice(0, 100) : '',
    breakfast,
    lunch,
    dinner,
    post_workout,
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const cors = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // JWT auth
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401, headers: cors })
  }
  const jwt = authHeader.replace('Bearer ', '')
  if (jwt === Deno.env.get('SUPABASE_ANON_KEY')) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401, headers: cors })
  }
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authError } = await adminClient.auth.getUser(jwt)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401, headers: cors })
  }

  try {
    const body = await req.json()
    const { proteinG, carbG, fatG, targetCal, goal, sports, dayOfWeek } = body

    if (!proteinG || !carbG || !targetCal) {
      return new Response(JSON.stringify({ error: 'MISSING_PARAMS' }), { status: 400, headers: cors })
    }

    const dayIdx = typeof dayOfWeek === 'number' && dayOfWeek >= 0 && dayOfWeek <= 6
      ? dayOfWeek
      : new Date().getDay()

    const goalTh = GOAL_TH[goal] || 'รักษาน้ำหนัก'
    const sportsTh = Array.isArray(sports) && sports.length > 0
      ? sports.map((s: string) => SPORT_TH[s] || s).join(', ')
      : 'ออกกำลังกายทั่วไป'
    const dayTh = DAY_NAMES_TH[dayIdx]

    const prompt = `คุณเป็น AI โค้ชโภชนาการชาวไทย เชี่ยวชาญด้านอาหารไทยสำหรับนักกีฬา
สร้างแผนอาหารไทยประจำวัน${dayTh}สำหรับผู้ใช้ที่มีเป้าหมาย: ${goalTh}
กีฬาที่เล่น: ${sportsTh}
เป้าหมายสารอาหาร: โปรตีน ${proteinG}g | คาร์บ ${carbG}g | ไขมัน ${fatG}g | รวม ${targetCal} kcal/วัน

ตอบเป็น JSON เท่านั้น ไม่ต้องอธิบายเพิ่ม รูปแบบ:
{
  "day_label": "วัน${dayTh} — [ชื่อธีมวันนี้เป็นภาษาอังกฤษ] [emoji]",
  "breakfast": {
    "name": "ชื่อเมนูมื้อเช้า (2-4 รายการ)",
    "items": [
      {"main": "ชื่ออาหาร", "alt": "ทางเลือก/เหตุผลด้านโภชนาการ", "amt": "ปริมาณ"},
      ...
    ]
  },
  "lunch": { "name": "...", "items": [...] },
  "dinner": { "name": "...", "items": [...] },
  "post_workout": { "name": "...", "items": [...] }
}
กฎ: ใช้อาหารไทยที่หาได้จริง หลากหลาย ไม่ซ้ำกับวันอื่น โปรตีนสูง น้ำมันน้อย เหมาะกับเป้าหมาย`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 1024 }
        })
      }
    )

    const data = await res.json()
    const candidate = data.candidates?.[0]

    if (!candidate?.content || candidate.finishReason === 'SAFETY') {
      return new Response(
        JSON.stringify({ error: 'BLOCKED', reason: candidate?.finishReason ?? 'no candidate' }),
        { status: 422, headers: cors }
      )
    }

    const text = candidate.content.parts[0].text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'NO_JSON' }), { status: 422, headers: cors })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return new Response(JSON.stringify({ error: 'PARSE_ERROR' }), { status: 422, headers: cors })
    }

    const sanitized = sanitizeMealPlan(parsed)
    if (!sanitized) {
      return new Response(JSON.stringify({ error: 'INVALID_STRUCTURE' }), { status: 422, headers: cors })
    }

    return new Response(JSON.stringify(sanitized), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })

  } catch {
    return new Response(JSON.stringify({ error: 'INTERNAL_ERROR' }), { status: 500, headers: cors })
  }
})
