import { applyBracketParseToRow, parseBracketBoxSegments } from './readingInterpretBracketParse'

export const READING_INTERPRET_CHUNK_SIZE = 100

let tempIdCounter = 0

export function nextTempId() {
  tempIdCounter += 1
  return `temp-${Date.now()}-${tempIdCounter}`
}

/** @param {string} cell — "word:meaning,word2:meaning2" */
export function parseKeyWordsCell(cell) {
  const s = String(cell ?? '').trim()
  if (!s) return []
  return s
    .split(',')
    .map((pair) => {
      const idx = pair.indexOf(':')
      if (idx < 0) {
        const word = pair.trim()
        return word ? { word, meaning: '' } : null
      }
      const word = pair.slice(0, idx).trim()
      const meaning = pair.slice(idx + 1).trim()
      if (!word) return null
      return { word, meaning }
    })
    .filter(Boolean)
}

export function formatKeyWordsForExcel(keyWords) {
  return (keyWords || [])
    .map((kw) => `${String(kw.word || '').trim()}:${String(kw.meaning || '').trim()}`)
    .filter((s) => s !== ':')
    .join(',')
}

export function emptyKeyWordRow() {
  return { word: '', meaning: '' }
}

/** @param {unknown} raw — 1~30 또는 빈 값(NULL) */
export function parseInterpretDayCell(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const n = parseInt(s, 10)
  if (!Number.isFinite(n) || n < 1 || n > 30) return null
  return n
}

export function emptyInterpretRow(orderIndex = 0) {
  return {
    id: nextTempId(),
    order_index: orderIndex,
    day: null,
    sentence_en: '',
    boxed_sentence: '',
    box_count: 0,
    correct_translation: '',
    key_words: [emptyKeyWordRow()],
    hint: '',
    awkward_patterns: '',
    critical_phrases: '',
    _expanded: true,
  }
}

/** @param {object} item */
export function itemToRow(item, index = 0) {
  const kws = Array.isArray(item.key_words) ? item.key_words : []
  return {
    id: item.id,
    order_index: item.order_index ?? index,
    day: item.day != null && Number.isFinite(Number(item.day)) ? Math.floor(Number(item.day)) : null,
    sentence_en: String(item.sentence_en ?? ''),
    boxed_sentence: String(item.boxed_sentence ?? ''),
    box_count: Number(item.box_count) || 0,
    correct_translation: String(item.correct_translation ?? ''),
    key_words: kws.length ? kws.map((k) => ({ word: String(k.word ?? ''), meaning: String(k.meaning ?? '') })) : [emptyKeyWordRow()],
    hint: String(item.hint ?? ''),
    awkward_patterns: String(item.awkward_patterns ?? ''),
    critical_phrases: String(item.critical_phrases ?? ''),
    _expanded: false,
  }
}

export function trimKeyWords(keyWords) {
  return (keyWords || [])
    .map((k) => ({ word: String(k.word ?? '').trim(), meaning: String(k.meaning ?? '').trim() }))
    .filter((k) => k.word)
}

export function isInterpretRowValid(row) {
  const en = String(row.sentence_en ?? '').trim()
  const tr = String(row.correct_translation ?? '').trim()
  return Boolean(en) && Boolean(tr)
}

export function rowPreviewSentence(text) {
  const t = String(text ?? '').trim()
  if (!t) return '(문장 없음)'
  return t.length > 80 ? `${t.slice(0, 80)}…` : t
}

export function rowPreviewTranslation(text) {
  const t = String(text ?? '').trim()
  if (!t) return '(의역 없음)'
  return t.length > 60 ? `${t.slice(0, 60)}…` : t
}

export function rowPreviewKeyWords(keyWords) {
  const kws = trimKeyWords(keyWords)
  if (!kws.length) return '-'
  const joined = kws.map((k) => `${k.word}: ${k.meaning || '?'}`).join(', ')
  return joined.length > 80 ? `${joined.slice(0, 80)}…` : joined
}

/** @param {object} row @param {string} setId */
export function rowToItemInsert(row, setId, orderIndex) {
  const parsed = applyBracketParseToRow(row)
  return {
    set_id: setId,
    order_index: orderIndex,
    day: parseInterpretDayCell(row.day),
    sentence_en: parsed.sentence_en,
    boxed_sentence: parsed.boxed_sentence,
    correct_translation: String(row.correct_translation).trim(),
    key_words: trimKeyWords(row.key_words),
    hint: String(row.hint ?? '').trim() || null,
    awkward_patterns: String(row.awkward_patterns ?? '').trim() || null,
    critical_phrases: String(row.critical_phrases ?? '').trim() || null,
  }
}

/** @param {object} row */
export function rowToItemUpdate(row) {
  const parsed = applyBracketParseToRow(row)
  return {
    order_index: row.order_index,
    day: parseInterpretDayCell(row.day),
    sentence_en: parsed.sentence_en,
    boxed_sentence: parsed.boxed_sentence,
    correct_translation: String(row.correct_translation).trim(),
    key_words: trimKeyWords(row.key_words),
    hint: String(row.hint ?? '').trim() || null,
    awkward_patterns: String(row.awkward_patterns ?? '').trim() || null,
    critical_phrases: String(row.critical_phrases ?? '').trim() || null,
  }
}

/** day 오름차순, day NULL은 마지막 */
export function sortInterpretRowsByDay(rows) {
  return [...rows].sort((a, b) => {
    const ad = a.day == null || a.day === '' ? Number.POSITIVE_INFINITY : Number(a.day)
    const bd = b.day == null || b.day === '' ? Number.POSITIVE_INFINITY : Number(b.day)
    if (ad !== bd) return ad - bd
    return (Number(a.order_index) || 0) - (Number(b.order_index) || 0)
  })
}

/** @param {string[][]} rows — 엑셀 A~C (헤더 제외): A 영어([ ] 포함 가능), B 정답 의역(correct_translation, / 구분), C Day */
export function parseInterpretExcelRows(rows) {
  const parsed = []
  for (const cells of rows) {
    const rawSentence = String(cells[0] ?? '').trim()
    const translation = String(cells[1] ?? '').trim()
    if (!rawSentence || !translation) continue
    const bracket = parseBracketBoxSegments(rawSentence)
    parsed.push({
      sentence_en: bracket.sentence_en,
      boxed_sentence: bracket.boxed_sentence,
      boxes: bracket.boxes,
      box_count: bracket.boxes.length,
      correct_translation: translation,
      key_words: [],
      hint: '',
      awkward_patterns: '',
      critical_phrases: '',
      day: parseInterpretDayCell(cells[2]),
    })
  }
  return parsed
}
