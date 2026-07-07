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

const BOOST_MODEL = 'claude-haiku-4-5-20251001'

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: OPTIONS_HEADERS,
  })
}

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return Response.json(
      { text: '', error: 'ANTHROPIC_API_KEY missing' },
      { status: 500, headers: CORS_HEADERS },
    )
  }

  const body = await req.json()
  const { totalQuestions, correctCount, wrongWords, stageDistribution, user_id } = body

  const prompt = `학생이 별표 친 단어를 복습하는 "똑부스터" 세션 결과를 받았어.
따뜻하고 구체적인 2~3문장 피드백을 만들어줘.

- 정답률: ${correctCount}/${totalQuestions}
- 틀린 단어: ${JSON.stringify(wrongWords ?? [])}
- 복습 단계 분포: ${JSON.stringify(stageDistribution ?? {})}

잘한 점부터 인정하고, 틀린 단어가 있으면 오답노트에도 
등록됐다는 걸 자연스럽게 언급해. "AI가 분석한" 같은 
메타 표현은 쓰지 마. 학생한테 직접 얘기하는 말투로.`

  const { ok, data, text } = await callAnthropicMessages({
    apiKey: key,
    model: BOOST_MODEL,
    feature: 'vocab_boost_feedback',
    user_id,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
  })

  return Response.json(
    { text: ok ? text : '' },
    { headers: CORS_HEADERS },
  )
}
