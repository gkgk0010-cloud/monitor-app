import { ROLE_HINT_SUGGESTIONS } from '../../../teacher/grammar-lab/utils/slotDrillMode'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const PASS_THRESHOLD = 75

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
2. role_hint(역할)에 맞는 의미 단위인지 평가 (예: 주절·시간·목적)
3. 의문문·구어체·동의어 허용 (예: 고치다=수정하다)
4. JSON 배열만. 형식:
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

async function callClaude(key, prompt, retry) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: 'JSON 배열만. 마크다운 없음.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data.error?.message || 'Claude 요청 실패'
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
