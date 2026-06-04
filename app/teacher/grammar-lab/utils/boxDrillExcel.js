import { splitExampleSentence } from './grammarLabRows'

/** C 컬럼 박스 구분자: 앞뒤 공백 1칸 + 슬래시 + 공백 1칸 */
export const BOX_ANSWER_DELIMITER = ' / '

/**
 * @param {string} answerCol C 컬럼(정답) 원문
 * @returns {string[] | null} 비어 있으면 null
 */
export function splitBoxAnswerColumn(answerCol) {
  const raw = String(answerCol ?? '').trim()
  if (!raw) return null
  const pieces = raw.split(BOX_ANSWER_DELIMITER).map((s) => s.trim())
  const filtered = pieces.filter(Boolean)
  return filtered.length ? filtered : null
}

/**
 * @param {string} original A 컬럼(예문) — 박스 위치 매칭 기준
 * @param {string[]} pieces C 컬럼 split 결과
 * @returns {{ box_index: number, start_char: number, end_char: number }[] | null}
 */
export function computeBoxCharRanges(original, pieces) {
  const text = String(original ?? '')
  const boxes = []
  let cursor = 0
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]
    const start = text.indexOf(piece, cursor)
    if (start === -1) {
      console.warn(`박스 "${piece}" 위치 찾기 실패 (문장: ${text})`)
      return null
    }
    const end = start + piece.length
    boxes.push({ box_index: i, start_char: start, end_char: end })
    cursor = end
  }
  return boxes
}

/** WordTable example_sentence → sentence_training_items.sentence_text 와 동일 기준 */
export function sentenceTextForBoxMatch(exampleSentence) {
  const ex = String(exampleSentence ?? '').trim()
  const { sentence_text } = splitExampleSentence(ex)
  return sentence_text || ex
}

/**
 * @param {string} exampleSentence A 컬럼(예문) — 테이블/행 필드
 * @param {string} boxAnswerColumn C 컬럼(정답)
 * @returns {{ box_index: number, start_char: number, end_char: number }[] | null}
 */
export function parseBoxDrillFromSentence(exampleSentence, boxAnswerColumn) {
  const pieces = splitBoxAnswerColumn(boxAnswerColumn)
  if (!pieces) return null
  const original = sentenceTextForBoxMatch(exampleSentence)
  if (!original) return null
  return computeBoxCharRanges(original, pieces)
}
