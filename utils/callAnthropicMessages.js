import { logAiInteraction } from './logAiInteraction'

/**
 * Anthropic Messages API 호출 + ai_interaction_logs 저장
 * @returns {Promise<{ ok: boolean, status: number, data: object, raw: string, text: string }>}
 */
export async function callAnthropicMessages({
  apiKey,
  model,
  feature,
  user_id = null,
  system = '',
  messages,
  max_tokens = 1024,
  signal,
}) {
  const body = {
    model,
    max_tokens,
    system: system || '',
    messages: messages || [],
  }
  const started = Date.now()

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal,
    })

    const raw = await res.text()
    let data = {}
    try {
      data = raw ? JSON.parse(raw) : {}
    } catch {
      data = { raw: raw.slice(0, 4000) }
    }

    const usage = data.usage || {}
    await logAiInteraction({
      user_id,
      feature,
      model,
      input: body,
      output: res.ok
        ? { content: data.content, stop_reason: data.stop_reason, usage }
        : data,
      latency: Date.now() - started,
      token_input: usage.input_tokens,
      token_output: usage.output_tokens,
      success: res.ok,
      error: res.ok ? null : data.error?.message || data.detail || raw.slice(0, 500),
    })

    const text = data.content?.[0]?.text || ''
    return { ok: res.ok, status: res.status, data, raw, text }
  } catch (e) {
    await logAiInteraction({
      user_id,
      feature,
      model,
      input: body,
      output: null,
      latency: Date.now() - started,
      success: false,
      error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}
