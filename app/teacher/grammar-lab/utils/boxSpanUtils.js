const TRAILING_BOX_PUNCT = /[.,;:!?]+$/

/**
 * 단어 토큰 + 끝 구두점 분리 (improves. → improves + .)
 * Excel 괄호 정답(구두점 제외)과 드래그 선택 범위를 맞추기 위함
 */
export function tokenizeWordsWithSpans(sentence) {
  const text = String(sentence || '')
  const re = /\S+/g
  const out = []
  let idx = 0
  let m
  while ((m = re.exec(text)) !== null) {
    const raw = m[0]
    const baseStart = m.index
    const punctMatch = raw.match(TRAILING_BOX_PUNCT)
    if (punctMatch && punctMatch.index > 0 && /\w$/.test(raw.slice(0, punctMatch.index))) {
      const wordPart = raw.slice(0, punctMatch.index)
      const punctPart = raw.slice(punctMatch.index)
      out.push({ index: idx++, text: wordPart, start: baseStart, end: baseStart + wordPart.length })
      out.push({ index: idx++, text: punctPart, start: baseStart + wordPart.length, end: baseStart + raw.length })
    } else {
      out.push({ index: idx++, text: raw, start: baseStart, end: baseStart + raw.length })
    }
  }
  return out
}

/** 박스 end_char에서 끝 구두점 제거 */
export function normalizeBoxSpan(sentence, start, end) {
  let s = Number(start)
  let e = Number(end)
  const text = String(sentence || '')
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return { start: s, end: e }
  while (e > s && /[.,;:!?]/.test(text[e - 1])) e -= 1
  return { start: s, end: e }
}
