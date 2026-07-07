import { ANTHROPIC_SONNET_MODEL } from '@/utils/anthropicModel'
import { callAnthropicMessages } from '@/utils/callAnthropicMessages'

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
  const defaultLang = String(body.default_lang || 'en-US').trim() || 'en-US'
  const user_id = body.user_id

  const LANG_LABEL = {
    'en-US': 'English',
    'ko-KR': 'Korean',
    'ja-JP': 'Japanese',
    'zh-CN': 'Chinese (Simplified, zh-CN)',
    'es-ES': 'Spanish',
    'vi-VN': 'Vietnamese',
    'de-DE': 'German',
  }
  const langHuman = LANG_LABEL[defaultLang] || defaultLang

  const prompt = `
단어/표현: ${word}
참고 뜻·설명(있으면): ${meaning || '(없음)'}

예문을 작성할 **학습 언어**(BCP-47): ${defaultLang}
언어 이름: ${langHuman}

규칙:
1. 위 학습 언어로만 **자연스러운 예문 한 문장**을 작성한다.
2. 반드시 단어/표현 「${word}」를 문장 안에서 적절히 사용한다.
3. 선생님 검토용으로 **한국어 번역 또는 짧은 한글 해설**을 함께 제공한다 (\`example_ko\`).

응답은 JSON 한 줄만 출력한다 (설명·마크다운·코드펜스 금지):
{"example_sentence":"<학습 언어 예문 한 문장>","example_ko":"<한국어 번역 또는 해설>"}
`.trim()

  const { ok, data, text } = await callAnthropicMessages({
    apiKey: key,
    model: ANTHROPIC_SONNET_MODEL,
    feature: 'grammar_card_examples',
    user_id,
    system: 'JSON만 응답. 코드블록 없음.',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 400,
  })

  if (!ok) {
    let msg = data.error?.message || data.detail || 'Claude 요청 실패'
    if (/credit|balance|billing|insufficient|payment/i.test(String(msg))) {
      msg =
        '[Anthropic/Claude] API 크레딧이 부족합니다. console.anthropic.com → Plans & Billing 에서 충전 또는 플랜을 확인하세요. '
    }
    return Response.json({ error: msg }, { status: 502 })
  }

  try {
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    const example_sentence = String(parsed.example_sentence || '').trim()
    const example_ko = String(parsed.example_ko || '').trim()
    if (!example_sentence) {
      return Response.json({ error: '빈 예문 응답' }, { status: 502 })
    }
    return Response.json({ example_sentence, example_ko })
  } catch {
    return Response.json({ error: '예문 파싱 실패' }, { status: 502 })
  }
}
