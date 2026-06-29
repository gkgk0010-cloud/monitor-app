import { ANTHROPIC_SONNET_MODEL } from '@/utils/anthropicModel'
import { ROLE_HINT_SUGGESTIONS } from '../../../teacher/grammar-lab/utils/slotDrillMode'

const BATCH_SYSTEM =
  'JSON 배열만 응답. 마크다운·코드블록·설명 없음. role_hint는 허용 라벨 중 하나의 짧은 한국어 문자열.'

/** 한 번에 보낼 박스 수 — 응답 JSON 잘림(max_tokens) 방지 */
const MAX_BOXES_PER_CHUNK = 20
const MAX_ITEMS_PER_CHUNK = 6

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

function chunkItems(items) {
  const chunks = []
  let current = []
  let boxCount = 0

  for (const item of items) {
    const boxes = (item.boxes || []).filter((b) => !b.role_hint)
    if (!boxes.length) continue

    const next = {
      item_id: item.item_id,
      sentence_text: item.sentence_text,
      boxes: boxes.map((b) => ({
        box_index: b.box_index,
        english: b.english,
        role_hint: null,
      })),
    }

    if (
      current.length &&
      (boxCount + next.boxes.length > MAX_BOXES_PER_CHUNK || current.length >= MAX_ITEMS_PER_CHUNK)
    ) {
      chunks.push(current)
      current = []
      boxCount = 0
    }

    current.push(next)
    boxCount += next.boxes.length
  }

  if (current.length) chunks.push(current)
  return chunks
}

async function callClaude(key, prompt, system) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_SONNET_MODEL,
      max_tokens: 8192,
      system: system || BATCH_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    let msg = data.error?.message || data.detail || 'Claude 요청 실패'
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
    text: data.content?.[0]?.text || '[]',
    stopReason: data.stop_reason,
  }
}

async function fillChunk(key, items) {
  const prompt = buildPrompt(items)
  let { text, stopReason } = await callClaude(key, prompt, BATCH_SYSTEM)

  try {
    return normalizeFilled(tryParseJsonArray(text))
  } catch (parseErr) {
    console.error('[fill-role-hints] JSON parse failed, retrying once', parseErr?.message, text?.slice?.(0, 400))
    ;({ text, stopReason } = await callClaude(
      key,
      `${prompt}\n\n이전 응답이 JSON 파싱에 실패했습니다. 유효한 JSON 배열만 다시 출력하세요.`,
      `${BATCH_SYSTEM} 반드시 유효한 JSON 배열만.`,
    ))
    try {
      return normalizeFilled(tryParseJsonArray(text))
    } catch (retryErr) {
      if (stopReason === 'max_tokens') {
        throw new Error('응답이 너무 길어 잘렸습니다. 잠시 후 다시 시도해 주세요.')
      }
      throw retryErr
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

  const chunks = chunkItems(payload)
  if (!chunks.length) {
    return Response.json({ filled: [], error: '채울 박스가 없습니다.' }, { status: 400 })
  }

  try {
    const filled = []
    let failedChunks = 0

    for (const chunk of chunks) {
      try {
        const part = await fillChunk(key, chunk)
        filled.push(...part)
      } catch (chunkErr) {
        failedChunks += 1
        console.error('[fill-role-hints] chunk failed', chunkErr?.message)
      }
    }

    if (!filled.length && failedChunks > 0) {
      return Response.json(
        { filled: [], error: 'role_hint 응답 파싱 실패. 잠시 후 재시도해 주세요.', parseError: true },
        { status: 502 },
      )
    }

    return Response.json({
      filled,
      failedChunks,
      chunkCount: chunks.length,
    })
  } catch (e) {
    return Response.json({ filled: [], error: e.message || '실패' }, { status: 502 })
  }
}
