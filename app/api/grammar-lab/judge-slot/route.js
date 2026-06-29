import { ANTHROPIC_HAIKU_MODEL } from '@/utils/anthropicModel'
import { friendlyHttpError } from '@/utils/fetchApiJson'
import { ROLE_HINT_SUGGESTIONS } from '../../../teacher/grammar-lab/utils/slotDrillMode'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const PASS_THRESHOLD = 75

const JUDGE_SLOT_SYSTEM = `너는 원준쌤 토익 구문 채점 보조다. JSON 배열만 출력.

채점 원칙:
- hint_ko(운영자 해석)가 기준. 조사·의역은 관대.
- 조사·전치사 표현 차이(에/를/려고/의/대상으로 등)는 감점 X.
- **동사 시제·태(능동/수동) 불일치는 엄격히** 50~65 (명확하면 50 이하).
- 의역 OK. 의미·역할·시제·태가 맞으면 80~94. 95~100은 거의 동일할 때만.
- of를 소유격으로만 요구하지 말 것. 대상이면 '대상으로' OK.
- 박스에 finite 동사 없으면 시제·태 검사 생략.

점수: 95~100 거의 동일 | 80~94 의역+시제·태 OK | 65~79 경미 누락 | 50~64 시제·태·역할 오류 | 0~49 명백 오답`

function json(data, status = 200) {
  return Response.json(data, { status, headers: CORS_HEADERS })
}

function buildJudgePrompt(payload) {
  const labels = ROLE_HINT_SUGGESTIONS.join(', ')
  return `
영어 문장을 박스(칸)별로 나눈 뒤, 학생이 각 칸에 쓴 한국어 해석을 채점하세요.

전체 문장: ${payload.sentence_text}
참고 해석(hint_ko, 있으면): ${payload.hint_ko || '(없음)'}

박스별 데이터:
${JSON.stringify(payload.boxes, null, 2)}

규칙:
1. 각 box_index마다 score 0~100 (정수), feedback 한국어 1~2문장
2. role_hint(역할)에 맞는 의미인지 평가 — 조사·표현 일치는 요구하지 않음
3. **동사 시제·태(능동/수동)는 영어 박스와 일치해야 함 — 불일치 시 50~65 엄격 감점**
4. 의역·동의어 허용 (노력=헌신, 낮추려고=낮추는 데, 대상으로=…의) — 시제·태 맞을 때
5. 의미·시제·태가 맞으면 80점 이상. 조사만 다르면 70점대 금지
6. JSON 배열만. 형식:
[{"box_index":0,"score":88,"feedback":"..."}]

허용 role_hint 예: ${labels}
`.trim()
}

function parseScores(text) {
  const cleaned = String(text || '')
    .replace(/```json|```/g, '')
    .trim()
  const parsed = JSON.parse(cleaned)
  if (!Array.isArray(parsed)) return []
  return parsed
    .map((r) => ({
      box_index: Number(r.box_index),
      score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))),
      feedback: String(r.feedback ?? '').trim(),
    }))
    .filter((r) => Number.isFinite(r.box_index))
}

async function callClaude(key, prompt, retry, boxCount) {
  const maxTokens = Math.min(2048, Math.max(400, (boxCount || 4) * 90))
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_HAIKU_MODEL,
      max_tokens: maxTokens,
      system: JUDGE_SLOT_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const raw = await res.text()
  let data
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    throw new Error(friendlyHttpError(res.status, raw))
  }
  if (!res.ok) {
    const msg = data.error?.message || friendlyHttpError(res.status, raw)
    throw new Error(msg)
  }
  const text = data.content?.[0]?.text || '[]'
  try {
    return parseScores(text)
  } catch (e) {
    if (!retry) {
      return callClaude(
        key,
        `${prompt}\n\n이전 응답 JSON 파싱 실패. 유효한 JSON 배열만 다시 출력.`,
        true,
        boxCount,
      )
    }
    console.error('[judge-slot] parse failed', e?.message, text?.slice?.(0, 400))
    throw e
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return json({ error: 'ANTHROPIC_API_KEY missing' }, 500)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const itemId = String(body.item_id ?? '').trim()
  const answers = Array.isArray(body.answers) ? body.answers : []
  const sentenceText = String(body.sentence_text ?? '').trim()
  const hintKo = body.hint_ko != null ? String(body.hint_ko).trim() : ''
  const boxMeta = Array.isArray(body.boxes) ? body.boxes : []

  if (!itemId || !sentenceText || !answers.length) {
    return json({ error: 'item_id, sentence_text, answers 필요' }, 400)
  }

  const byIndex = new Map(boxMeta.map((b) => [Number(b.box_index), b]))
  const boxes = answers.map((a) => {
    const idx = Number(a.box_index)
    const meta = byIndex.get(idx) || {}
    return {
      box_index: idx,
      english: String(meta.english ?? meta.text ?? '').trim(),
      role_hint: String(meta.role_hint ?? '').trim(),
      user_text: String(a.text ?? '').trim(),
    }
  })

  try {
    const scores = await callClaude(
      key,
      buildJudgePrompt({ sentence_text: sentenceText, hint_ko: hintKo, boxes }),
      false,
      boxes.length,
    )
    const scoreByIdx = new Map(scores.map((s) => [s.box_index, s]))
    const merged = boxes.map((b) => {
      const hit = scoreByIdx.get(b.box_index)
      return {
        box_index: b.box_index,
        score: hit?.score ?? 0,
        feedback: hit?.feedback || '채점 결과를 받지 못했습니다.',
      }
    })
    const average =
      merged.length > 0
        ? Math.round((merged.reduce((s, r) => s + r.score, 0) / merged.length) * 10) / 10
        : 0
    const pass = average >= PASS_THRESHOLD
    return json({ scores: merged, average, pass })
  } catch (e) {
    return json({ error: e.message || '채점 실패', scores: [], average: 0, pass: false }, 502)
  }
}
