import { ANTHROPIC_SONNET_MODEL } from '@/utils/anthropicModel'
import { callAnthropicMessages } from '@/utils/callAnthropicMessages'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const OPTIONS_HEADERS = {
  ...CORS_HEADERS,
  'Access-Control-Max-Age': '86400',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: OPTIONS_HEADERS })
}

function jsonResponse(data, status = 200) {
  return Response.json(data, { status, headers: CORS_HEADERS })
}

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY missing' }, 500)
  }

  let body
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const mode = String(body.mode || 'word').trim()
  const user_id = body.user_id

  if (mode === 'grammar_card') {
    const structure = String(body.structure || '').trim()
    const phrase = String(body.phrase || '').trim()
    const phraseType = String(body.phrase_type || 'noun_phrase').trim()
    const phraseSubtype = String(body.phrase_subtype || '').trim()

    if (!structure && !phrase) {
      return jsonResponse({ error: 'structure or phrase required' }, 400)
    }

    const phraseLabels = {
      noun_phrase: '명사구',
      prep_phrase: '전치사구',
      infinitive_phrase: 'to부정사구',
      participle_phrase: '분사구',
    }
    const phraseLabel = phraseLabels[phraseType] || '구'

    let exampleJson =
      '{"examples":[{"en":"the very smart girl","ko":"그 매우 똑똑한 소녀"},{"en":"a really pretty flower","ko":"정말 예쁜 꽃"},{"en":"an incredibly tall boy","ko":"엄청나게 키 큰 소년"}]}'
    let extraHint = ''

    if (phraseType === 'prep_phrase') {
      exampleJson =
        '{"examples":[{"en":"in the room","ko":"그 방 안에"},{"en":"on the smart girl","ko":"그 똑똑한 소녀 위에"},{"en":"at the very pretty desk","ko":"그 아주 예쁜 책상 옆에"}]}'
    } else if (phraseType === 'infinitive_phrase') {
      if (phraseSubtype === 'intransitive') {
        extraHint = '자동사 to부정사구 예시입니다. to+자동사+부사 패턴. '
        exampleJson =
          '{"examples":[{"en":"to run fast","ko":"빨리 달리기"},{"en":"to sleep well","ko":"잘 자기"},{"en":"to arrive very early","ko":"아주 일찍 도착하기"}]}'
      } else {
        extraHint = '타동사 to부정사구 예시입니다. to+타동사+명사구(+부사) 패턴. '
        exampleJson =
          '{"examples":[{"en":"to study English","ko":"영어를 공부하기"},{"en":"to read the book","ko":"그 책을 읽기"},{"en":"to write English hard","ko":"영어를 열심히 쓰기"}]}'
      }
    } else if (phraseType === 'participle_phrase') {
      if (phraseSubtype === 'passive') {
        extraHint = '과거분사구(수동, V-ed) 예시입니다. '
        exampleJson =
          '{"examples":[{"en":"broken yesterday","ko":"어제 깨진"},{"en":"broken by him","ko":"그에 의해 깨진"},{"en":"written carefully by the author","ko":"저자에 의해 조심스럽게 쓰인"}]}'
      } else {
        extraHint = '현재분사구(능동, V-ing) 예시입니다. '
        exampleJson =
          '{"examples":[{"en":"studying English","ko":"영어를 공부하는"},{"en":"reading a book","ko":"책을 읽는"},{"en":"reading the very interesting book","ko":"그 아주 재미있는 책을 읽는"}]}'
      }
    }

    const prompt = `
${extraHint}학생이 영어 ${phraseLabel} 구조를 카드로 조합했어요.

품사 순서: ${structure || '(미지정)'}
조합 예시: ${phrase || '(미지정)'}

위 구조와 같은 패턴의 자연스러운 영어 ${phraseLabel} 예시를 **정확히 3개** 만들어 주세요.
각 예시마다 한국어 뜻을 함께 제공하세요.

응답은 JSON 한 줄만 (마크다운·코드블록 금지):
${exampleJson}
`.trim()

    const { ok, data, text } = await callAnthropicMessages({
      apiKey: key,
      model: ANTHROPIC_SONNET_MODEL,
      feature: 'grammar_card_examples',
      user_id,
      system: 'JSON만 응답. examples 배열에 en, ko 필드 3개.',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
    })

    if (!ok) {
      let msg = data.error?.message || data.detail || 'Claude 요청 실패'
      if (/credit|balance|billing|insufficient|payment/i.test(String(msg))) {
        msg =
          '[Anthropic/Claude] API 크레딧이 부족합니다. console.anthropic.com → Plans & Billing 에서 충전 또는 플랜을 확인하세요. '
      }
      return jsonResponse({ error: msg }, 502)
    }

    try {
      const cleaned = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      const examples = (Array.isArray(parsed.examples) ? parsed.examples : [])
        .map((row) => ({
          en: String(row.en || row.example || '').trim(),
          ko: String(row.ko || row.meaning || '').trim(),
        }))
        .filter((row) => row.en)
        .slice(0, 3)
      if (!examples.length) {
        return jsonResponse({ error: '빈 예시 응답' }, 502)
      }
      return jsonResponse({ examples })
    } catch {
      return jsonResponse({ error: '예시 파싱 실패' }, 502)
    }
  }

  const word = String(body.word || '').trim()
  if (!word) {
    return jsonResponse({ error: 'word is required' }, 400)
  }

  const meaning = body.meaning != null ? String(body.meaning).trim() : ''
  const defaultLang = String(body.default_lang || 'en-US').trim() || 'en-US'

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
    return jsonResponse({ error: msg }, 502)
  }

  try {
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    const example_sentence = String(parsed.example_sentence || '').trim()
    const example_ko = String(parsed.example_ko || '').trim()
    if (!example_sentence) {
      return jsonResponse({ error: '빈 예문 응답' }, 502)
    }
    return jsonResponse({ example_sentence, example_ko })
  } catch {
    return jsonResponse({ error: '예문 파싱 실패' }, 502)
  }
}
