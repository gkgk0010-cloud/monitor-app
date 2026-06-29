import { ANTHROPIC_SONNET_MODEL } from '@/utils/anthropicModel'
import { ROLE_HINT_SUGGESTIONS } from '../../../teacher/grammar-lab/utils/slotDrillMode'

function buildPrompt(items) {
  const labels = ROLE_HINT_SUGGESTIONS.join(', ')
  return `
다음 영어 문장의 박스(칸)마다 role_hint(한국어 역할 라벨)를 1개씩 지정하세요.

허용 라벨(가능하면 이 중에서): ${labels}

입력:
${JSON.stringify(items)}

응답 JSON 배열만:
[{"item_id":"...","box_index":0,"role_hint":"주절"}, ...]
`.trim()
}

function parseFilled(text) {
  const cleaned = String(text || '')
    .replace(/```json|```/g, '')
    .trim()
  const arr = JSON.parse(cleaned)
  if (!Array.isArray(arr)) return []
  return arr.map((r) => ({
    item_id: String(r.item_id ?? ''),
    box_index: Number(r.box_index),
    role_hint: String(r.role_hint ?? '').trim(),
  }))
}

async function callClaude(key, prompt, retry) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_SONNET_MODEL,
      max_tokens: 4000,
      system: 'JSON 배열만. 마크다운 없음.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    let msg = data.error?.message || data.detail || 'Claude 요청 실패'
    if (/model|retired|not found|does not exist/i.test(String(msg))) {
      msg = `[Anthropic] 모델 오류 (${ANTHROPIC_SONNET_MODEL}): ${msg}`
    }
    throw new Error(msg)
  }
  const text = data.content?.[0]?.text || '[]'
  try {
    return parseFilled(text)
  } catch (e) {
    if (!retry) {
      return callClaude(key, `${prompt}\n\nJSON 파싱 실패. 유효한 JSON 배열만 다시.`, true)
    }
    console.error('[fill-role-hints] parse failed', e?.message)
    throw e
  }
}

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return Response.json({ filled: [], error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })

  const { items } = await req.json()
  const payload = (items || [])
    .map((it) => ({
      item_id: String(it.item_id ?? ''),
      sentence_text: String(it.sentence_text ?? '').trim(),
      boxes: (it.boxes || []).map((b) => ({
        box_index: Number(b.box_index),
        english: String(b.english ?? '').trim(),
        role_hint: b.role_hint ? String(b.role_hint).trim() : null,
      })),
    }))
    .filter((it) => it.item_id && it.sentence_text && it.boxes.length)

  if (!payload.length) {
    return Response.json({ filled: [], error: 'items 비어 있음' }, { status: 400 })
  }

  try {
    const filled = await callClaude(key, buildPrompt(payload), false)
    return Response.json({ filled: filled.filter((f) => f.item_id && f.role_hint) })
  } catch (e) {
    return Response.json({ filled: [], error: e.message || '실패' }, { status: 502 })
  }
}
