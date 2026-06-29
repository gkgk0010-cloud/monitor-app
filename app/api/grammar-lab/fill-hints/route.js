const BATCH_SYSTEM =
  'JSON 배열만 응답. 마크다운·코드블록·설명 없음. 각 id마다 hint_ko는 반드시 비어 있지 않은 한국어 문자열.'

function buildFillHintsPrompt(items) {
  return `
다음 영어 문장(토익·구문 학습용)마다 한국어 hint_ko(해석·끊어읽기 힌트)를 채워줘.

규칙:
1. 평서문·의문문(Wh-/Yes-No) 모두 자연스러운 한국어 해석 또는 끊어읽기 힌트를 작성한다.
2. 의문문은 영어 어순 그대로 질문체("~했나요?")로 풀지 말고, 의미 단위·명사화 힌트를 우선한다.
3. 이미 hint_ko가 있으면 그대로 유지한다.
4. 물음표(?), 따옴표, 슬래시 등 특수문자는 JSON 문자열 안에서 올바르게 이스케이프한다.

예시:
- "Who approved the budget?" → "승인한 사람은? / 예산을?"
- "Did the manager approve the budget?" → "관리자가 / 예산을 / 승인했나?"
- "The new policy will take effect from next month." → "그 새 정책은 / 시행된다 / 다음 달부터"

입력:
${JSON.stringify(
    (items || []).map((it) => ({
      id: it.id,
      sentence_text: String(it.sentence_text || '').trim(),
      hint_ko: it.hint_ko ? String(it.hint_ko).trim() : null,
    })),
  )}

응답 형식 (변경·신규 항목만):
[{"id":"...","hint_ko":"한국어 힌트"}]
`.trim()
}

function parseFilledArray(text) {
  const cleaned = String(text || '')
    .replace(/```json|```/g, '')
    .trim()
  const parsed = JSON.parse(cleaned)
  if (!Array.isArray(parsed)) return []
  return parsed
    .map((row) => ({
      id: String(row?.id ?? ''),
      hint_ko: String(row?.hint_ko ?? '').trim(),
    }))
    .filter((row) => row.id && row.hint_ko)
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: system || BATCH_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    let msg = data.error?.message || data.detail || 'Claude 요청 실패'
    if (/credit|balance|billing|insufficient|payment/i.test(String(msg))) {
      msg =
        '[Anthropic/Claude] API 크레딧이 부족합니다. console.anthropic.com → Plans & Billing 을 확인하세요.'
    }
    const err = new Error(msg)
    err.status = 502
    throw err
  }
  return data.content?.[0]?.text || '[]'
}

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return Response.json({ filled: [], error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ filled: [], error: 'Invalid JSON' }, { status: 400 })
  }

  const items = (body.items || [])
    .map((it) => ({
      id: String(it.id ?? ''),
      sentence_text: String(it.sentence_text ?? '').trim(),
      hint_ko: it.hint_ko != null ? String(it.hint_ko).trim() : '',
    }))
    .filter((it) => it.id && it.sentence_text)

  if (!items.length) {
    return Response.json({ filled: [], error: 'items가 비어 있습니다.' }, { status: 400 })
  }

  const needFill = items.filter((it) => !it.hint_ko)
  if (!needFill.length) {
    return Response.json({ filled: [] })
  }

  const prompt = buildFillHintsPrompt(needFill)

  try {
    let text = await callClaude(key, prompt, BATCH_SYSTEM)
    let filled
    try {
      filled = parseFilledArray(text)
    } catch (parseErr) {
      console.error('[fill-hints] JSON parse failed, retrying once', parseErr?.message, text?.slice?.(0, 400))
      text = await callClaude(
        key,
        `${prompt}\n\n이전 응답이 JSON 파싱에 실패했습니다. 유효한 JSON 배열만 다시 출력하세요.`,
        `${BATCH_SYSTEM} 반드시 유효한 JSON 배열만.`,
      )
      try {
        filled = parseFilledArray(text)
      } catch (retryErr) {
        console.error('[fill-hints] JSON parse failed after retry', retryErr?.message, text?.slice?.(0, 400))
        return Response.json(
          { filled: [], error: 'hint_ko 응답 파싱 실패. 잠시 후 재시도해 주세요.', parseError: true },
          { status: 502 },
        )
      }
    }

    const byId = new Map(filled.map((f) => [f.id, f.hint_ko]))
    const merged = needFill
      .map((it) => {
        const hint_ko = byId.get(it.id) || ''
        return hint_ko ? { id: it.id, hint_ko } : null
      })
      .filter(Boolean)

    const missing = needFill.filter((it) => !byId.has(it.id)).map((it) => it.id)
    return Response.json({
      filled: merged,
      missingIds: missing,
    })
  } catch (e) {
    const status = e.status || 502
    return Response.json({ filled: [], error: e.message || 'Claude 요청 실패' }, { status })
  }
}
