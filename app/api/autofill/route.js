export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return Response.json({ filled: [], error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  const { words } = await req.json()

  const prompt = `
다음 토익 단어 목록에서 비어있는 필드를 채워줘.
- meaning이 null이면 한글 뜻 채우기
- example_sentence가 null이면 토익 수준 영어 예문 채우기
- 이미 값이 있는 필드는 그대로 유지

단어 목록:
${JSON.stringify(
  (words || []).map((w) => ({
    id: w.id,
    word: w.word,
    meaning: w.meaning || null,
    example_sentence: w.example_sentence || null,
  })),
)}

응답: JSON 배열만. 형식:
[{"id":"...","meaning":"한글뜻","example_sentence":"영어예문"}]
변경된 항목만 포함. 마크다운 없음.
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
      max_tokens: 4000,
      system: 'JSON 배열만 응답. 마크다운 없음. 코드블록 없음.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    let msg = data.error?.message || data.detail || 'Claude 요청 실패'
    if (/credit|balance|billing|insufficient|payment/i.test(String(msg))) {
      msg =
        '[Anthropic/Claude] API 크레딧이 부족합니다. console.anthropic.com → Plans & Billing 을 확인하세요. '
    }
    return Response.json({ filled: [], error: msg }, { status: 502 })
  }

  const text = data.content?.[0]?.text || '[]'

  try {
    const cleaned = text.replace(/```json|```/g, '').trim()
    const filled = JSON.parse(cleaned)
    return Response.json({ filled: Array.isArray(filled) ? filled : [] })
  } catch {
    return Response.json({ filled: [] }, { status: 500 })
  }
}
