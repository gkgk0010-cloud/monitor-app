export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return Response.json({ text: '', error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  const { prompt, system, max_tokens } = await req.json()

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: max_tokens ?? 8000,
      system: system || '',
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await res.json()
  return Response.json({ text: data.content?.[0]?.text || '' })
}
