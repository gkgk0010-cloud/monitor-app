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

export function emptyInterpretRow(orderIndex = 0) {
  return {
    id: nextTempId(),
    order_index: orderIndex,
    sentence_en: '',
    correct_translation: '',
    key_words: [emptyKeyWordRow()],
    hint: '',
    _expanded: true,
  }
}

/** @param {object} item */
export function itemToRow(item, index = 0) {
  const kws = Array.isArray(item.key_words) ? item.key_words : []
  return {
    id: item.id,
    order_index: item.order_index ?? index,
    sentence_en: String(item.sentence_en ?? ''),
    correct_translation: String(item.correct_translation ?? ''),
    key_words: kws.length ? kws.map((k) => ({ word: String(k.word ?? ''), meaning: String(k.meaning ?? '') })) : [emptyKeyWordRow()],
    hint: String(item.hint ?? ''),
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
  return {
    set_id: setId,
    order_index: orderIndex,
    sentence_en: String(row.sentence_en).trim(),
    correct_translation: String(row.correct_translation).trim(),
    key_words: trimKeyWords(row.key_words),
    hint: String(row.hint ?? '').trim() || null,
  }
}

/** @param {object} row */
export function rowToItemUpdate(row) {
  return {
    order_index: row.order_index,
    sentence_en: String(row.sentence_en).trim(),
    correct_translation: String(row.correct_translation).trim(),
    key_words: trimKeyWords(row.key_words),
    hint: String(row.hint ?? '').trim() || null,
  }
}

/** @param {string[][]} rows — 엑셀 A~D (헤더 제외) */
export function parseInterpretExcelRows(rows) {
  const parsed = []
  for (const cells of rows) {
    const sentence = String(cells[0] ?? '').trim()
    const translation = String(cells[1] ?? '').trim()
    if (!sentence || !translation) continue
    parsed.push({
      sentence_en: sentence,
      correct_translation: translation,
      key_words: parseKeyWordsCell(cells[2]),
      hint: String(cells[3] ?? '').trim(),
    })
  }
  return parsed
}
