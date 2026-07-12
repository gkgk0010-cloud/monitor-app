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
    const connectorKey = String(body.connector_key || '').trim()

    if (!structure && !phrase) {
      return jsonResponse({ error: 'structure or phrase required' }, 400)
    }

    const phraseLabels = {
      noun_phrase: '명사구',
      prep_phrase: '전치사구',
      infinitive_phrase: 'to부정사구',
      participle_phrase: '분사구',
      gerund_phrase: '동명사구',
      noun_clause: '명사절',
      adj_clause: '형용사절',
      adv_clause: '부사절',
      verb_phrase: '동사구',
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
    } else if (phraseType === 'gerund_phrase') {
      extraHint =
        '동명사구(V-ing) 예시입니다. V-ing가 명사 역할(주어·목적어)을 합니다. 한국어 뜻도 동명사(~하는 것, ~하기)로 써 주세요. '
      exampleJson =
        '{"examples":[{"en":"studying hard","ko":"열심히 공부하는 것"},{"en":"reading books","ko":"책 읽기"},{"en":"studying English","ko":"영어 공부하기"}]}'
    } else if (phraseType === 'participle_phrase') {
      if (phraseSubtype === 'passive') {
        extraHint = '수동분사구(V-ed) 예시입니다. '
        exampleJson =
          '{"examples":[{"en":"broken yesterday","ko":"어제 깨진"},{"en":"broken in the room","ko":"그 방 안에서 깨진"},{"en":"carefully broken in the dark","ko":"어둠 속에서 조심스럽게 깨진"}]}'
      } else {
        extraHint = '능동분사구(V-ing) 예시입니다. '
        exampleJson =
          '{"examples":[{"en":"studying English","ko":"영어를 공부하는"},{"en":"reading a book","ko":"책을 읽는"},{"en":"reading the very interesting book","ko":"그 아주 재미있는 책을 읽는"}]}'
      }
    } else if (phraseType === 'noun_clause') {
      extraHint =
        '명사절 예시입니다. 접속사/의문사 ' +
        (connectorKey || 'that') +
        ' + 학생 배치 구조. '
      if (phraseSubtype === 'intransitive') {
        exampleJson =
          '{"examples":[{"en":"that he runs fast","ko":"그가 빨리 뛴다는 것"},{"en":"that she sleeps well","ko":"그녀가 잘 잔다는 것"},{"en":"that the smart girl runs very fast","ko":"그 똑똑한 소녀가 아주 빨리 뛴다는 것"}]}'
      } else if (phraseSubtype === 'transitive') {
        exampleJson =
          '{"examples":[{"en":"that she studies English","ko":"그녀가 영어를 공부한다는 것"},{"en":"that he reads the book","ko":"그가 그 책을 읽는다는 것"},{"en":"that the smart girl studies the interesting book hard","ko":"그 똑똑한 소녀가 그 재미있는 책을 열심히 공부한다는 것"}]}'
      } else {
        exampleJson =
          '{"examples":[{"en":"that he runs","ko":"그가 뛴다는 것"},{"en":"that she studies English","ko":"그녀가 영어를 공부한다는 것"},{"en":"that the smart girl runs fast","ko":"그 똑똑한 소녀가 빨리 뛴다는 것"}]}'
      }
    } else if (phraseType === 'adj_clause') {
      extraHint =
        '형용사절(관계사 ' +
        (connectorKey || 'who') +
        ') 예시입니다. 명사를 꾸미는 형태로 작성하세요. '
      if (phraseSubtype === 'intransitive') {
        exampleJson =
          '{"examples":[{"en":"the boy who runs fast","ko":"빨리 뛰는 소년"},{"en":"the girl who sleeps well","ko":"잘 자는 소녀"},{"en":"the student who arrives very early","ko":"아주 일찍 도착하는 학생"}]}'
      } else {
        exampleJson =
          '{"examples":[{"en":"the girl who studies English","ko":"영어를 공부하는 소녀"},{"en":"the boy who reads the book","ko":"그 책을 읽는 소년"},{"en":"the teacher who teaches the smart student hard","ko":"그 똑똑한 학생을 열심히 가르치는 선생님"}]}'
      }
    } else if (phraseType === 'adv_clause') {
      extraHint =
        '부사절 예시입니다. 접속사 ' +
        (connectorKey || 'when') +
        ' + 완전한 문장. '
      if (phraseSubtype === 'intransitive') {
        exampleJson =
          '{"examples":[{"en":"when he runs fast","ko":"그가 빨리 뛸 때"},{"en":"when she sleeps well","ko":"그녀가 잘 잘 때"},{"en":"when the smart girl runs very fast","ko":"그 똑똑한 소녀가 아주 빨리 뛸 때"}]}'
      } else {
        exampleJson =
          '{"examples":[{"en":"when she studies English","ko":"그녀가 영어를 공부할 때"},{"en":"when he reads the book","ko":"그가 그 책을 읽을 때"},{"en":"when the smart girl studies the interesting book hard","ko":"그 똑똑한 소녀가 그 재미있는 책을 열심히 공부할 때"}]}'
      }
    } else if (phraseType === 'verb_phrase') {
      const formLabels = {
        sv: '1형식(주어+자동사+부사)',
        svc: '2형식(주어+be동사+보어)',
        svo: '3형식(주어+타동사+목적어)',
        svoo: '4형식(주어+타동사+간접목적어+직접목적어)',
        svoc: '5형식(주어+타동사+목적어+목적격보어)',
      }
      extraHint = (formLabels[phraseSubtype] || '동사구') + ' 문장 예시입니다. '
      if (phraseSubtype === 'sv') {
        exampleJson =
          '{"examples":[{"en":"He runs","ko":"그는 달린다"},{"en":"She sleeps well","ko":"그녀는 잘 잔다"},{"en":"The smart girl runs fast","ko":"그 똑똑한 소녀는 빨리 달린다"}]}'
      } else if (phraseSubtype === 'svc') {
        exampleJson =
          '{"examples":[{"en":"She is smart","ko":"그녀는 똑똑하다"},{"en":"He is a doctor","ko":"그는 의사이다"},{"en":"The girl is very pretty","ko":"그 소녀는 아주 예쁘다"}]}'
      } else if (phraseSubtype === 'svc_progressive') {
        extraHint = '2형식 be + V-ing 현재진행 예시입니다. 한국어 뜻도 진행형(~하고 있다)으로 작성하세요. '
        exampleJson =
          '{"examples":[{"en":"She is studying","ko":"그녀는 공부하고 있다"},{"en":"He is studying English","ko":"그는 영어를 공부하고 있다"},{"en":"The smart girl is reading a book","ko":"그 똑똑한 소녀는 책을 읽고 있다"}]}'
      } else if (phraseSubtype === 'svc_passive') {
        extraHint = '2형식 be + V-ed 수동태 예시입니다. 한국어 뜻도 수동(~되어 있다)으로 작성하세요. '
        exampleJson =
          '{"examples":[{"en":"The window is broken","ko":"창문이 깨져 있다"},{"en":"The door is broken by him","ko":"문이 그에 의해 깨져 있다"},{"en":"The book is written in English","ko":"그 책은 영어로 쓰여 있다"}]}'
      } else if (phraseSubtype === 'svo') {
        exampleJson =
          '{"examples":[{"en":"I love her","ko":"나는 그녀를 사랑한다"},{"en":"She studies English","ko":"그녀는 영어를 공부한다"},{"en":"The smart girl reads a book","ko":"그 똑똑한 소녀는 책을 읽는다"}]}'
      } else if (phraseSubtype === 'svoo') {
        exampleJson =
          '{"examples":[{"en":"I gave him a book","ko":"나는 그에게 책을 주었다"},{"en":"She told me the truth","ko":"그녀는 나에게 진실을 말했다"},{"en":"He made his mother a cake","ko":"그는 어머니께 케이크를 만들어 드렸다"}]}'
      } else if (phraseSubtype === 'svoc') {
        exampleJson =
          '{"examples":[{"en":"I made her happy","ko":"나는 그녀를 행복하게 만들었다"},{"en":"She calls me a genius","ko":"그녀는 나를 천재라고 부른다"},{"en":"He found the movie interesting","ko":"그는 그 영화가 재미있다고 생각했다"}]}'
      } else {
        exampleJson =
          '{"examples":[{"en":"He runs","ko":"그는 달린다"},{"en":"She is smart","ko":"그녀는 똑똑하다"},{"en":"I love her","ko":"나는 그녀를 사랑한다"}]}'
      }
    }

    const prompt = `
${extraHint}학생이 영어 ${phraseLabel} 구조를 카드로 조합했어요.

품사 순서: ${structure || '(미지정)'}
조합 예시(카드 표시 단어): ${phrase || '(미지정)'}

위 **품사 순서(구조 패턴)** 와 같은 형태의 자연스러운 영어 ${phraseLabel} 예시를 **정확히 3개** 만들어 주세요.
카드에 표시된 예시 단어에 얽매이지 말고, **같은 구조라도 서로 다른 단어**로 다양하게 작성하세요.
(예: the smart girl → a pretty flower, an incredibly tall boy)
각 예시마다 한국어 뜻을 함께 제공하세요.

응답은 JSON 한 줄만 (마크다운·코드블록 금지):
${exampleJson}
`.trim()

    const { ok, data, text } = await callAnthropicMessages({
      apiKey: key,
      model: ANTHROPIC_SONNET_MODEL,
      feature: 'grammar_card_examples',
      user_id,
      system: 'JSON만 응답. examples 배열에 en, ko 필드 3개. 같은 구조 패턴이면 카드 예시 단어와 다른 어휘로 다양하게 작성.',
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
