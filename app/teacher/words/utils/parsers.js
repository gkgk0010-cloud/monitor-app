/**
 * 입력 텍스트를 자동 감지해서 [{word, meaning, example_sentence}] 배열로 변환
 * 지원 형식:
 *   - 탭 구분 (엑셀 Ctrl+C): 따옴표 안 줄바꿈·탭 허용 (RFC 스타일)
 *   - CSV: 쉼표 + 따옴표 멀티라인
 *   - 번호 목록: "1. apple 사과"
 *   - 공백 구분: "apple 사과"
 */

/**
 * 구분자(delimiter)가 탭 또는 쉼표. 따옴표(")로 감싼 필드 안에서는 줄바꿈·구분자가 필드에 포함됨.
 */
export function parseDelimitedTable(text, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let i = 0
  let inQuotes = false
  const len = text.length

  while (i < len) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      if (c === '\r') {
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === delimiter) {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      field = ''
      if (row.some((x) => String(x).trim())) rows.push(row)
      row = []
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    field += c
    i++
  }
  row.push(field)
  if (row.some((x) => String(x).trim())) rows.push(row)
  return rows
}

function rowsToWordRecords(rows) {
  if (rows.length === 0) return []
  let start = 0
  const first0 = String(rows[0][0] ?? '').trim()
  if (/^(word|단어|영어)/i.test(first0)) start = 1
  return rows
    .slice(start)
    .map((cols, i) => ({
      id: String(i),
      word: String(cols[0] ?? '').trim(),
      meaning: String(cols[1] ?? '').trim(),
      example_sentence: String(cols[2] ?? '').trim(),
    }))
    .filter((r) => r.word)
}

export function parseWordText(raw) {
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!text.trim()) return []

  if (text.includes('\t')) {
    const rows = parseDelimitedTable(text, '\t')
    return rowsToWordRecords(rows)
  }

  const lines = text.split('\n')
  const firstLine = lines[0] || ''
  if (firstLine.includes(',') && !firstLine.includes('\t')) {
    const rows = parseDelimitedTable(text, ',')
    return rowsToWordRecords(rows)
  }

  return parseListFormat(lines.filter(Boolean))
}

function parseListFormat(lines) {
  return lines
    .map((line, i) => {
      const clean = line.replace(/^[\d]+[.)]\s*|^[•\-·]\s*/, '').trim()

      const doubleSpace = clean.match(/^(.+?)\s{2,}(.+)$/)
      if (doubleSpace) {
        return {
          id: String(i),
          word: doubleSpace[1].trim(),
          meaning: doubleSpace[2].trim(),
          example_sentence: '',
        }
      }
      const firstSpace = clean.match(/^(\S{1,25})\s+(.+)$/)
      if (firstSpace) {
        return { id: String(i), word: firstSpace[1], meaning: firstSpace[2], example_sentence: '' }
      }
      return { id: String(i), word: clean, meaning: '', example_sentence: '' }
    })
    .filter((r) => r.word)
}

/** DB words_difficulty_check (일반적으로 1~5) — 0·null 은 CHECK 위반 */
export const WORD_DIFFICULTY_MIN = 1
export const WORD_DIFFICULTY_MAX = 5

export function normalizeWordDifficulty(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return WORD_DIFFICULTY_MIN
  const k = Math.floor(n)
  return Math.min(WORD_DIFFICULTY_MAX, Math.max(WORD_DIFFICULTY_MIN, k))
}
