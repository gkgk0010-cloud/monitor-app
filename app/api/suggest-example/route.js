export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return Response.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const word = String(body.word || '').trim()
  if (!word) {
    return Response.json({ error: 'word is required' }, { status: 400 })
  }

  const meaning = body.meaning != null ? String(body.meaning).trim() : ''

  const prompt = `
영단어: ${word}
한글 뜻(있으면 참고): ${meaning || '(없음)'}

토익 수준에 맞는 **영어 예문 한 문장**만 작성해.
응답은 JSON 한 줄만: {"example_sentence":"영어 문장만"}
마크다운·설명·따옴표 밖 문장 금지.
`.trim()

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: 'JSON만 응답. 코드블록 없음.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    const msg = data.error?.message || data.detail || 'Claude 요청 실패'
    return Response.json({ error: msg }, { status: 502 })
  }

  const text = data.content?.[0]?.text || ''

  try {
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    const example_sentence = String(parsed.example_sentence || '').trim()
    if (!example_sentence) {
      return Response.json({ error: '빈 예문 응답' }, { status: 502 })
    }
    return Response.json({ example_sentence })
  } catch {
    return Response.json({ error: '예문 파싱 실패' }, { status: 502 })
  }
}
