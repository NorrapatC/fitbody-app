import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_KEY = Deno.env.get('GEMINI_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ALLOWED_ORIGIN env var: set via `supabase secrets set ALLOWED_ORIGIN=https://your-app.vercel.app`
// Falls back to allowing all origins — JWT auth is the real security layer
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

// Allowlist of fields returned to client — never pass raw Gemini output through
const ALLOWED_FIELDS = ['weight_kg','body_fat_pct','muscle_kg','fat_kg','bmi','visceral_fat','inbody_score','height_cm','age'] as const
type AllowedField = typeof ALLOWED_FIELDS[number]

function sanitizeResponse(raw: Record<string, unknown>): Record<AllowedField, number | null> {
  const result = {} as Record<AllowedField, number | null>
  for (const field of ALLOWED_FIELDS) {
    const val = raw[field]
    if (val === null || val === undefined) {
      result[field] = null
    } else {
      const num = Number(val)
      result[field] = isFinite(num) ? num : null
    }
  }
  return result
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const cors = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // --- JWT Auth check ---
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401, headers: cors })
  }
  const jwt = authHeader.replace('Bearer ', '')

  // Reject anon key — must be a real user JWT
  if (jwt === Deno.env.get('SUPABASE_ANON_KEY')) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401, headers: cors })
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authError } = await adminClient.auth.getUser(jwt)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401, headers: cors })
  }
  // --- End auth ---

  try {
    const { imageBase64, mimeType } = await req.json()
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return new Response(JSON.stringify({ error: 'NO_IMAGE' }), { status: 400, headers: cors })
    }

    const prompt = `คุณเป็น AI ผู้เชี่ยวชาญอ่านผล InBody Sheet ภาษาไทย
จากรูปนี้ให้ดึงข้อมูลออกมาเป็น JSON format เท่านั้น ไม่ต้องอธิบายเพิ่ม:
{
  "weight_kg": number,
  "body_fat_pct": number,
  "muscle_kg": number,
  "fat_kg": number,
  "bmi": number,
  "visceral_fat": number,
  "inbody_score": number,
  "height_cm": number,
  "age": number
}
ถ้าไม่เห็นค่าไหนให้ใส่ null`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
              { text: prompt }
            ]
          }]
        })
      }
    )

    const data = await res.json()
    const candidate = data.candidates?.[0]

    if (!candidate || !candidate.content || candidate.finishReason === 'SAFETY') {
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

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return new Response(JSON.stringify({ error: 'PARSE_ERROR' }), { status: 422, headers: cors })
    }

    // Only return whitelisted numeric fields — never pass raw AI output to client
    const sanitized = sanitizeResponse(parsed)

    return new Response(JSON.stringify(sanitized), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR' }),
      { status: 500, headers: cors }
    )
  }
})
