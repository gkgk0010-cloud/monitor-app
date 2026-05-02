/**
 * 단어 뜻(meaning) 저장 전 검증 — DB/객체가 문자열로 깨져 "[object Object]" 등으로 들어가는 경우 차단
 */

export function meaningIsMissing(raw) {
  if (raw == null) return true
  if (typeof raw === 'object') return true
  const s = String(raw).trim()
  if (!s) return true
  if (s === '[object Object]') return true
  return false
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ sentenceStyle?: boolean }} opts
 */
export function wordLabelForMeaningAlert(row, opts = {}) {
  const sentenceStyle = opts.sentenceStyle === true
  if (sentenceStyle) {
    const ex = String(row.example_sentence ?? '').trim()
    if (ex) return ex.length > 36 ? `${ex.slice(0, 36)}…` : ex
    return '(예문 없음)'
  }
  const w = String(row.word ?? '').trim()
  if (w) return w.length > 36 ? `${w.slice(0, 36)}…` : w
  return '(단어 없음)'
}

/**
 * @param {{ row: number, label: string }[]} lines
 */
export function formatEmptyMeaningAlert(lines, { maxLines = 12 } = {}) {
  const n = lines.length
  const head = lines.slice(0, maxLines)
  const bullets = head.map((x) => `- row ${x.row}: ${x.label}`).join('\n')
  const more = n > maxLines ? `\n… 외 ${n - maxLines}개` : ''
  return `뜻이 비어 있거나 올바르지 않은 행이 ${n}개 있어요:\n\n${bullets}${more}\n\n뜻을 채운 후 다시 저장해 주세요.`
}

/** Supabase / upsert 오류를 사용자에게 문자열로 */
export function formatSupabaseWordsSaveError(err) {
  if (err == null) return '저장에 실패했습니다.'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message || '저장에 실패했습니다.'
  const msg = err.message || err.error_description || err.details || err.hint
  if (typeof msg === 'string' && msg.trim()) return msg.trim()
  try {
    const j = JSON.stringify(err)
    if (j && j !== '{}') return `저장에 실패했습니다. (${j.slice(0, 240)})`
  } catch (_) {
    /* ignore */
  }
  return '저장에 실패했습니다. (자세한 내용을 확인할 수 없습니다.)'
}
