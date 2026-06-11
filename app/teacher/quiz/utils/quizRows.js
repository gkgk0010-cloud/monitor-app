import {
  DEFAULT_OPTION_COUNT,
  MAX_OPTIONS,
  MIN_OPTIONS,
} from './quizCategories'

let tempIdCounter = 0

export function nextTempId() {
  tempIdCounter += 1
  return `temp-${Date.now()}-${tempIdCounter}`
}

export function emptyOptions(count = DEFAULT_OPTION_COUNT) {
  return Array.from({ length: count }, () => '')
}

/** @param {object} item */
export function itemToRow(item, index = 0) {
  const opts = Array.isArray(item.options) ? [...item.options] : emptyOptions()
  while (opts.length < MIN_OPTIONS) opts.push('')
  return {
    id: item.id,
    order_index: item.order_index ?? index,
    question_text: String(item.question_text ?? ''),
    options: opts.slice(0, MAX_OPTIONS),
    correct_index: Number.isFinite(item.correct_index) ? item.correct_index : 0,
    explanation: String(item.explanation ?? ''),
    _expanded: false,
  }
}

export function emptyQuizRow(orderIndex = 0) {
  return {
    id: nextTempId(),
    order_index: orderIndex,
    question_text: '',
    options: emptyOptions(),
    correct_index: 0,
    explanation: '',
    _expanded: true,
  }
}

export function trimOptions(options) {
  return (options || [])
    .map((o) => String(o ?? '').trim())
    .filter(Boolean)
}

export function isQuizRowValid(row) {
  const question = String(row.question_text ?? '').trim()
  if (!question) return false
  const opts = trimOptions(row.options)
  if (opts.length < MIN_OPTIONS) return false
  const ci = Number(row.correct_index)
  if (!Number.isFinite(ci) || ci < 0 || ci >= opts.length) return false
  return true
}

export function rowPreviewQuestion(text) {
  const t = String(text ?? '').trim()
  if (!t) return '(문제 없음)'
  const line = t.split('\n')[0]
  return line.length > 80 ? `${line.slice(0, 80)}…` : line
}

export function rowPreviewOptions(options) {
  const opts = trimOptions(options)
  if (!opts.length) return '(선택지 없음)'
  const joined = opts.join(' / ')
  return joined.length > 100 ? `${joined.slice(0, 100)}…` : joined
}

export function formatAnswerLabel(correctIndex, options) {
  const opts = trimOptions(options)
  const ci = Number(correctIndex)
  if (!opts.length || !Number.isFinite(ci) || ci < 0 || ci >= opts.length) return '-'
  return `${ci + 1}번`
}

/** @param {object} row @param {string} setId */
export function rowToItemInsert(row, setId, orderIndex) {
  const opts = trimOptions(row.options)
  return {
    set_id: setId,
    order_index: orderIndex,
    question_text: String(row.question_text).trim(),
    options: opts,
    correct_index: Number(row.correct_index),
    explanation: String(row.explanation ?? '').trim() || null,
  }
}

/** @param {object} row */
export function rowToItemUpdate(row) {
  const opts = trimOptions(row.options)
  return {
    order_index: row.order_index,
    question_text: String(row.question_text).trim(),
    options: opts,
    correct_index: Number(row.correct_index),
    explanation: String(row.explanation ?? '').trim() || null,
  }
}

/** @param {string[][]} rows — 엑셀 A~I */
export function parseQuizExcelRows(rows) {
  const parsed = []
  for (let i = 0; i < rows.length; i += 1) {
    const cells = rows[i] || []
    const question = String(cells[0] ?? '').trim()
    if (!question) continue
    const rawOptions = []
    for (let c = 1; c <= 6; c += 1) {
      const v = String(cells[c] ?? '').trim()
      if (v) rawOptions.push(v)
    }
    if (rawOptions.length < MIN_OPTIONS) continue
    const answerNum = parseInt(String(cells[7] ?? '').trim(), 10)
    if (!Number.isFinite(answerNum) || answerNum < 1 || answerNum > rawOptions.length) continue
    const explanation = String(cells[8] ?? '').trim()
    parsed.push({
      question_text: question,
      options: rawOptions,
      correct_index: answerNum - 1,
      explanation,
    })
  }
  return parsed
}
