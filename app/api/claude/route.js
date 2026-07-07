import { ANTHROPIC_SONNET_MODEL } from '@/utils/anthropicModel'
import { callAnthropicMessages } from '@/utils/callAnthropicMessages'

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return Response.json({ text: '', error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  const { prompt, system, max_tokens, feature, user_id } = await req.json()

  const { ok, data, text } = await callAnthropicMessages({
    apiKey: key,
    model: ANTHROPIC_SONNET_MODEL,
    feature: feature || 'claude_generic',
    user_id,
    system: system || '',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: max_tokens ?? 8000,
  })

  if (!ok) {
    return Response.json(
      { text: '', error: data.error?.message || data.detail || 'Claude 요청 실패' },
      { status: 502 },
    )
  }

  return Response.json({ text })
}
