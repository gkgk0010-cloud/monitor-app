import { ANTHROPIC_SONNET_MODEL } from '@/utils/anthropicModel'
import { friendlyHttpError } from '@/utils/fetchApiJson'
import { callAnthropicMessages } from '@/utils/callAnthropicMessages'
import { ROLE_HINT_SUGGESTIONS } from '../../../teacher/grammar-lab/utils/slotDrillMode'

/** Vercel serverless — Claude 호출 여유 */
export const maxDuration = 60

const BATCH_SYSTEM =
  'JSON 배열만 응답. 마크다운·코드블록·설명 없음. role_hint는 허용 라벨 중 하나의 짧은 한국어 문자열.'

function buildPrompt(items) {
  const labels = ROLE_HINT_SUGGESTIONS.join(', ')
  return `
다음 영어 문장의 박스(칸)마다 role_hint(한국어 역할 라벨)를 1개씩 지정하세요.

허용 라벨(가능하면 이 중에서): ${labels}

규칙:
1. 입력 boxes의 box_index마다 정확히 1개씩 role_hint를 반환한다.
2. item_id·box_index는 입력과 동일하게 유지한다.
3. JSON 문자열 안 따옴표·역슬래시는 반드시 이스케이프한다.

입력:
${JSON.stringify(items)}

응답 JSON 배열만:
[{"item_id":"...","box_index":0,"role_hint":"주절"}, ...]
`.trim()
}

function tryParseJsonArray(text) {
  const cleaned = String(text || '')
    .replace(/```json|```/g, '')
    .trim()
  try {
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : []
  } catch (firstErr) {
    const start = cleaned.indexOf('[')
    if (start < 0) throw firstErr
    let slice = cleaned.slice(start)
    const lastBrace = slice.lastIndexOf('}')
    if (lastBrace > 0) {
      slice = `${slice.slice(0, lastBrace + 1)}]`
      try {
        const parsed = JSON.parse(slice)
        if (Array.isArray(parsed)) return parsed
      } catch {
        /* fall through */
      }
    }
    throw firstErr
  }
}

function normalizeFilled(arr) {
  return (arr || [])
    .map((r) => ({
      item_id: String(r.item_id ?? ''),
      box_index: Number(r.box_index),
      role_hint: String(r.role_hint ?? '').trim(),
    }))
    .filter((f) => f.item_id && Number.isFinite(f.box_index) && f.role_hint)
}

async function callClaude(key, prompt, system, user_id) {
  const { ok, data, text, raw, status } = await callAnthropicMessages({
    apiKey: key,
    model: ANTHROPIC_SONNET_MODEL,
    feature: 'grammar_lab_fill_role_hints',
    user_id,
    system: system || BATCH_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 8192,
  })
  if (!ok) {
    let msg = data.error?.message || data.detail || friendlyHttpError(status, raw)
    if (/model|retired|not found|does not exist/i.test(String(msg))) {
      msg = `[Anthropic] 모델 오류 (${ANTHROPIC_SONNET_MODEL}): ${msg}`
    }
    if (/credit|balance|billing|insufficient|payment/i.test(String(msg))) {
      msg =
        '[Anthropic/Claude] API 크레딧이 부족합니다. console.anthropic.com → Plans & Billing 을 확인하세요.'
    }
    throw new Error(msg)
  }
  return {
    text: text || '[]',
    stopReason: data.stop_reason,
  }
}

async function fillChunk(key, items, user_id) {
  const prompt = buildPrompt(items)
  let { text, stopReason } = await callClaude(key, prompt, BATCH_SYSTEM, user_id)

  try {
    return normalizeFilled(tryParseJsonArray(text))
  } catch (parseErr) {
    console.error('[fill-role-hints] JSON parse failed, retrying once', parseErr?.message, text?.slice?.(0, 400))
    ;({ text, stopReason } = await callClaude(
      key,
      `${prompt}\n\n이전 응답이 JSON 파싱에 실패했습니다. 유효한 JSON 배열만 다시 출력하세요.`,
      `${BATCH_SYSTEM} 반드시 유효한 JSON 배열만.`,
      user_id,
    ))
    try {
      return normalizeFilled(tryParseJsonArray(text))
    } catch (retryErr) {
      if (stopReason === 'max_tokens') {
        throw new Error('응답이 너무 길어 잘렸습니다. 다시 누르면 남은 박스만 이어서 채웁니다.')
      }
      throw new Error('AI 응답 형식 오류. 잠시 후 다시 시도해 주세요.')
    }
  }
}

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return Response.json({ filled: [], error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ filled: [], error: 'Invalid JSON' }, { status: 400 })
  }

  const payload = (body.items || [])
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
    return Response.json({ filled: [], error: '채울 박스가 없습니다.' }, { status: 400 })
  }

  try {
    const filled = await fillChunk(key, payload, body.user_id)
    return Response.json({
      filled,
      failedChunks: 0,
      chunkCount: 1,
    })
  } catch (e) {
    return Response.json({ filled: [], error: e.message || '실패', failedChunks: 1 }, { status: 502 })
  }
}
