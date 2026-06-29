import { parseBracketBoxMarkers, splitExampleSentence } from './grammarLabRows'

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

/**
 * 엑셀 한 행 → 양식 B([ ]) 우선, 없으면 양식 A(정답 / ) 파싱
 * @returns {{ cleanExample: string, boxes: { box_index: number, start_char: number, end_char: number }[] | null, format: 'bracket' | 'slash' | null, boxAnswer: string | null }}
 */
export function parseBoxDrillExcelRow(exampleSentence, boxAnswerColumn) {
  const ex = String(exampleSentence ?? '').trim()
  const ans = String(boxAnswerColumn ?? '').trim()
  const { sentence_text, boxes: bracketBoxes } = parseBracketBoxMarkers(ex)
  if (bracketBoxes.length) {
    return {
      cleanExample: sentence_text,
      boxes: bracketBoxes,
      format: 'bracket',
      boxAnswer: null,
    }
  }
  if (ans) {
    const slashBoxes = parseBoxDrillFromSentence(ex, ans)
    if (slashBoxes?.length) {
      return {
        cleanExample: sentenceTextForBoxMatch(ex),
        boxes: slashBoxes,
        format: 'slash',
        boxAnswer: ans,
      }
    }
  }
  return {
    cleanExample: sentenceTextForBoxMatch(ex) || ex,
    boxes: null,
    format: null,
    boxAnswer: ans || null,
  }
}

/** 가져오기 행에 자동 박스 데이터가 있는지 */
export function rowHasImportBoxes(row) {
  if (Array.isArray(row?._bracketBoxes) && row._bracketBoxes.length) return true
  if (String(row?._boxAnswer ?? '').trim()) return true
  const ex = String(row?.example_sentence ?? '')
  if (ex.includes('[') && ex.includes(']')) {
    const { boxes } = parseBracketBoxMarkers(ex.split('\n')[0])
    if (boxes.length) return true
  }
  return false
}

export function estimateImportBoxCount(row) {
  if (Array.isArray(row?._bracketBoxes) && row._bracketBoxes.length) {
    return row._bracketBoxes.length
  }
  const ans = String(row?._boxAnswer ?? '').trim()
  if (ans) {
    const pieces = splitBoxAnswerColumn(ans)
    if (pieces?.length) return pieces.length
  }
  return 1
}
