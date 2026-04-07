/**
 * 입력 텍스트를 자동 감지해서 [{word, meaning, example_sentence}] 배열로 변환
 * 지원 형식:
 *   - 탭 구분 (엑셀 Ctrl+C): "apple\t사과\t예문"
 *   - CSV: "apple,사과,예문"
 *   - 번호 목록: "1. apple 사과" / "• apple 사과"
 *   - 공백 구분: "apple 사과"
 */
export function parseWordText(raw) {
  const lines = raw.trim().split('\n').filter(Boolean)
  if (!lines.length) return []

  if (lines[0].includes('\t')) return parseTabDelimited(lines)
  if (lines[0].split(',').length >= 2) return parseCSV(lines)
  return parseListFormat(lines)
}

function parseTabDelimited(lines) {
  return lines
    .map((line, i) => {
      const cols = line.split('\t').map((c) => c.trim())
      return {
        id: String(i),
        word: cols[0] || '',
        meaning: cols[1] || '',
        example_sentence: cols[2] || '',
      }
    })
    .filter((r) => r.word)
}

function parseCSV(lines) {
  const start = /^(word|단어|영어)/i.test(lines[0]) ? 1 : 0
  return lines
    .slice(start)
    .map((line, i) => {
      const cols = (line.match(/(".*?"|[^,]+)/g) || []).map((c) => c.trim().replace(/^"|"$/g, ''))
      return {
        id: String(i),
        word: cols[0] || '',
        meaning: cols[1] || '',
        example_sentence: cols[2] || '',
      }
    })
    .filter((r) => r.word)
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
