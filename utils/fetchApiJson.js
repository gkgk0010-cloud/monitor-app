/**
 * fetch 응답을 text → JSON 으로 안전하게 파싱 (Vercel HTML 오류 페이지 등)
 */
export function friendlyHttpError(status, rawSnippet = '') {
  const snippet = String(rawSnippet || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)

  if (status === 504 || /timeout|timed out/i.test(snippet)) {
    return '요청 시간이 초과됐습니다. 다시 누르면 남은 박스만 이어서 채웁니다.'
  }
  if (status === 429 || /rate limit|too many/i.test(snippet)) {
    return 'API 요청이 너무 많습니다. 1~2분 후 다시 시도해 주세요.'
  }
  if (status >= 500 || /an error occurred|internal server error/i.test(snippet)) {
    return '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  }
  if (snippet) {
    return `서버 응답 오류 (${status || '?'}). 잠시 후 다시 시도해 주세요.`
  }
  return '서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

/**
 * @returns {Promise<{ json: object, raw: string, parseError?: boolean, friendlyError?: string }>}
 */
export async function readFetchJson(res) {
  const raw = await res.text()
  if (!raw) return { json: {}, raw }
  try {
    return { json: JSON.parse(raw), raw }
  } catch {
    return {
      json: {},
      raw,
      parseError: true,
      friendlyError: friendlyHttpError(res.status, raw),
    }
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
