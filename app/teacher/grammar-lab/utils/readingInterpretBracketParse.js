/**
 * 독해해석 example_sentence / sentence_en 내 [ ] 박스 파싱 (B 방식)
 * @returns {{ boxed_sentence: string|null, sentence_en: string, boxes: { box_index: number, start_char: number, end_char: number, chunk_label: string|null, role_hint: string|null }[] }}
 */
export function parseBracketBoxSegments(raw) {
  const text = String(raw ?? '').trim()
  if (!text || text.indexOf('[') < 0) {
    return { boxed_sentence: null, sentence_en: text, boxes: [] }
  }

  let plain = ''
  const boxes = []
  let i = 0
  let boxIndex = 0

  while (i < text.length) {
    if (text[i] === '[') {
      const close = text.indexOf(']', i + 1)
      if (close < 0) {
        plain += text.slice(i)
        break
      }
      const content = text.slice(i + 1, close)
      const start = plain.length
      plain += content
      const end = plain.length
      boxes.push({
        box_index: boxIndex,
        start_char: start,
        end_char: end,
        chunk_label: null,
        role_hint: null,
      })
      boxIndex += 1
      i = close + 1
      continue
    }
    plain += text[i]
    i += 1
  }

  const sentence_en = plain.replace(/\s+/g, ' ').trim()
  if (!boxes.length) {
    return { boxed_sentence: null, sentence_en: text, boxes: [] }
  }

  return {
    boxed_sentence: text,
    sentence_en,
    boxes,
  }
}

/** 행 저장용 — sentence_en에 [ ]가 있으면 파싱, 없으면 기존 boxed_sentence 유지 */
export function applyBracketParseToRow(row) {
  const raw = String(row?.sentence_en ?? '').trim()
  const parsed = parseBracketBoxSegments(raw)
  if (parsed.boxes.length) {
    return {
      sentence_en: parsed.sentence_en,
      boxed_sentence: parsed.boxed_sentence,
      boxes: parsed.boxes,
    }
  }
  const existingBoxed = String(row?.boxed_sentence ?? '').trim()
  if (existingBoxed && existingBoxed.indexOf('[') >= 0) {
    const fromStored = parseBracketBoxSegments(existingBoxed)
    if (fromStored.boxes.length) {
      return {
        sentence_en: fromStored.sentence_en,
        boxed_sentence: fromStored.boxed_sentence,
        boxes: fromStored.boxes,
      }
    }
  }
  return {
    sentence_en: raw,
    boxed_sentence: null,
    boxes: [],
  }
}
