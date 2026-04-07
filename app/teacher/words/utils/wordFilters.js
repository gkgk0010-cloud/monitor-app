/** 단어 관리 화면과 동일한 필터 (검색·set·빈 필드만) */
export function filterWordRows(words, { search, setFilter, emptyOnly }) {
  let list = words
  const q = search.trim().toLowerCase()
  if (q) {
    list = list.filter((w) => {
      const word = String(w.word || '').toLowerCase()
      const meaning = String(w.meaning || '').toLowerCase()
      return word.includes(q) || meaning.includes(q)
    })
  }
  if (setFilter.trim()) {
    list = list.filter((w) => String(w.set_name || '') === setFilter)
  }
  if (emptyOnly) {
    list = list.filter((w) => {
      const m = w.meaning != null ? String(w.meaning).trim() : ''
      const ex = w.example_sentence != null ? String(w.example_sentence).trim() : ''
      const im = w.image_url != null ? String(w.image_url).trim() : ''
      return !m || !ex || !im
    })
  }
  return list
}
