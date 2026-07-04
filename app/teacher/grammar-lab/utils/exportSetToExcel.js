import * as XLSX from 'xlsx'
import { GRAMMAR_LAB_CHUNK_SIZE } from './grammarLabBatchSave'
import { BOX_ANSWER_DELIMITER } from './boxDrillExcel'
import { isGrammarRowValid, stiToTableRow } from './grammarLabRows'
import { fetchBoxDrillAnswersMap } from './boxDrillQuery'
import { itemToRow, sortInterpretRowsByDay } from './readingInterpretRows'

const BOX_DRILL_B_COLS = [{ wch: 72 }, { wch: 36 }, { wch: 6 }, { wch: 24 }, { wch: 28 }]
const WORD_ORDER_COLS = [{ wch: 36 }, { wch: 22 }, { wch: 24 }, { wch: 28 }]
const INTERPRET_COLS = [{ wch: 48 }, { wch: 36 }, { wch: 10 }]

/** @param {string} name */
export function sanitizeExcelFileName(name) {
  return (
    String(name || '세트')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 180) || '세트'
  )
}

/**
 * @param {string} sentenceText
 * @param {{ box_index?: number, start_char: number, end_char: number }[]} boxes
 */
export function reconstructBracketExampleSentence(sentenceText, boxes) {
  const text = String(sentenceText || '')
  if (!text || !boxes?.length) return text
  const sorted = [...boxes].sort((a, b) => Number(b.start_char) - Number(a.start_char))
  let out = text
  for (const b of sorted) {
    const start = Number(b.start_char)
    const end = Number(b.end_char)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > text.length) {
      return text
    }
    const segment = text.slice(start, end)
    out = out.slice(0, start) + '[' + segment + ']' + out.slice(end)
  }
  return out
}

/**
 * @param {string} sentenceText
 * @param {{ start_char: number, end_char: number, box_index?: number }[]} boxes
 */
export function boxAnswerSlashFromRanges(sentenceText, boxes) {
  const text = String(sentenceText || '')
  if (!text || !boxes?.length) return ''
  return [...boxes]
    .sort((a, b) => Number(a.box_index) - Number(b.box_index))
    .map((b) => text.slice(Number(b.start_char), Number(b.end_char)))
    .filter(Boolean)
    .join(BOX_ANSWER_DELIMITER)
}

function optionalCell(value) {
  const s = String(value ?? '').trim()
  return s || ''
}

function dayCell(day) {
  if (day == null || day === '') return ''
  const n = parseInt(String(day), 10)
  return Number.isFinite(n) && n >= 1 ? String(n) : ''
}

function writeWorkbook(fileName, sheets) {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.aoa)
    if (sheet.cols) ws['!cols'] = sheet.cols
    XLSX.utils.book_append_sheet(wb, ws, sheet.name)
  }
  XLSX.writeFile(wb, `${sanitizeExcelFileName(fileName)}.xlsx`)
}

/**
 * @param {object} row
 * @param {Record<string, { start_char: number, end_char: number, box_index?: number }[]>} boxAnswersMap
 */
function boxDrillExampleSentenceForExport(row, boxAnswersMap) {
  const ex = String(row.example_sentence || '').trim()
  const firstLine = ex.split('\n')[0] || ex
  if (Array.isArray(row._bracketBoxes) && row._bracketBoxes.length) {
    return reconstructBracketExampleSentence(firstLine, row._bracketBoxes)
  }
  const boxes = boxAnswersMap?.[row.id]
  if (boxes?.length) {
    return reconstructBracketExampleSentence(firstLine, boxes)
  }
  return firstLine
}

/** @param {object[]} rows @param {Record<string, object[]>} [boxAnswersMap] */
export function buildWordOrderExportAoa(rows) {
  const header = ['example_sentence', 'meaning', 'image_url', 'youtube_url']
  const dataRows = (rows || [])
    .filter(isGrammarRowValid)
    .map((row) => [
      String(row.example_sentence || '').trim(),
      String(row.meaning || '').trim(),
      optionalCell(row.image_url),
      optionalCell(row.youtube_url),
    ])
  return [header, ...dataRows]
}

/** @param {object[]} rows @param {Record<string, object[]>} [boxAnswersMap] */
export function buildBoxDrillExportAoa(rows, boxAnswersMap = {}) {
  const header = ['example_sentence', 'meaning', 'day', 'image_url', 'youtube_url']
  const dataRows = (rows || [])
    .filter(isGrammarRowValid)
    .map((row) => [
      boxDrillExampleSentenceForExport(row, boxAnswersMap),
      String(row.meaning || '').trim(),
      dayCell(row.day) || '1',
      optionalCell(row.image_url),
      optionalCell(row.youtube_url),
    ])
  return [header, ...dataRows]
}

/** @param {object[]} rows — 엑셀 3컬럼 export용 (sentence + correct_translation) */
export function buildReadingInterpretExportAoa(rows) {
  const header = ['영어 문장', '정답 의역', 'Day (1~30)']
  const dataRows = (rows || [])
    .filter((row) => {
      const boxed = String(row.boxed_sentence || '').trim()
      const sentence = boxed || String(row.sentence_en || '').trim()
      return Boolean(sentence)
    })
    .map((row) => {
      const boxed = String(row.boxed_sentence || '').trim()
      const sentence = boxed || String(row.sentence_en || '').trim()
      return [sentence, String(row.correct_translation || '').trim(), dayCell(row.day)]
    })
  return [header, ...dataRows]
}

/** @param {string} setName @param {object[]} rows */
export function exportWordOrderRowsToExcel(setName, rows) {
  writeWorkbook(setName, [
    {
      name: 'words',
      aoa: buildWordOrderExportAoa(rows),
      cols: WORD_ORDER_COLS,
    },
  ])
}

/** @param {string} setName @param {object[]} rows @param {Record<string, object[]>} [boxAnswersMap] */
export function exportBoxDrillRowsToExcel(setName, rows, boxAnswersMap = {}) {
  writeWorkbook(setName, [
    {
      name: '양식B_괄호',
      aoa: buildBoxDrillExportAoa(rows, boxAnswersMap),
      cols: BOX_DRILL_B_COLS,
    },
  ])
}

/** @param {string} setName @param {object[]} rows */
export function exportReadingInterpretRowsToExcel(setName, rows) {
  writeWorkbook(setName, [
    {
      name: '독해해석',
      aoa: buildReadingInterpretExportAoa(rows),
      cols: INTERPRET_COLS,
    },
  ])
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} teacherId
 * @param {string} setName
 * @param {'word_order' | 'box_drill'} trainingKind
 */
export async function exportGrammarLabSetFromSupabase(supabase, teacherId, setName, trainingKind) {
  const { data, error } = await supabase
    .from('sentence_training_items')
    .select('id, sentence_text, hint_ko, set_name, day, sort_order, difficulty, image_url, youtube_url, training_kind')
    .eq('teacher_id', teacherId)
    .eq('set_name', setName)
    .eq('training_kind', trainingKind)
    .order('day')
    .order('sort_order')
  if (error) throw error

  const items = data || []
  const ids = items.map((d) => d.id).filter(Boolean)
  let boxAnswersMap = {}
  if (trainingKind === 'box_drill' && ids.length) {
    boxAnswersMap = await fetchBoxDrillAnswersMap(supabase, ids)
  }

  const rows = items.map((item) => stiToTableRow(item, boxAnswersMap[item.id]?.length || 0))
  if (trainingKind === 'box_drill') {
    exportBoxDrillRowsToExcel(setName, rows, boxAnswersMap)
  } else {
    exportWordOrderRowsToExcel(setName, rows)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} setId
 * @param {string} setName
 */
export async function exportReadingInterpretSetFromSupabase(supabase, setId, setName) {
  const { data, error } = await supabase
    .from('reading_interpret_items')
    .select('id, set_id, order_index, day, sentence_en, boxed_sentence, correct_translation, key_words, hint, awkward_patterns, critical_phrases')
    .eq('set_id', setId)
    .order('day', { ascending: true, nullsFirst: false })
    .order('order_index', { ascending: true })
  if (error) throw error

  const rows = sortInterpretRowsByDay((data || []).map((item, i) => itemToRow(item, i)))
  exportReadingInterpretRowsToExcel(setName, rows)
}

/**
 * 상세 페이지 — 메모리 rows + DB 박스 좌표
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} setName
 * @param {'word_order' | 'box_drill'} trainingKind
 * @param {object[]} rows
 */
export async function exportGrammarLabRowsFromDetail(supabase, setName, trainingKind, rows) {
  if (trainingKind === 'box_drill') {
    const ids = (rows || []).map((r) => r.id).filter((id) => id && !String(id).startsWith('temp-'))
    const boxAnswersMap = ids.length ? await fetchBoxDrillAnswersMap(supabase, ids) : {}
    exportBoxDrillRowsToExcel(setName, rows, boxAnswersMap)
    return
  }
  exportWordOrderRowsToExcel(setName, rows)
}
