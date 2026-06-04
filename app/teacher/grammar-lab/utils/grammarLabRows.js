import { normalizeWordDifficulty } from '../../words/utils/parsers'

/** WordTable/BulkImport 행 ↔ sentence_training_items 변환 */

/** 문법 해부실(박스 만들기·어순 배열): 학습 흐름상 Day 미사용, DB에는 항상 1 */
export const GRAMMAR_LAB_FIXED_DAY = 1

export function emptyGrammarRow(setName) {
  return {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    word: '',
    meaning: '',
    example_sentence: '',
    set_name: setName,
    day: GRAMMAR_LAB_FIXED_DAY,
    difficulty: 3,
    image_url: null,
    image_source: 'none',
    youtube_url: null,
  }
}

export function splitExampleSentence(ex) {
  const parts = String(ex || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length <= 1) {
    return { sentence_text: parts[0] || '', example_ko: '' }
  }
  return { sentence_text: parts[0], example_ko: parts.slice(1).join('\n') }
}

/** meaning + example_ko → hint_ko (\n merge) */
export function buildHintKo(meaning, exampleKo, exampleSentence) {
  const m = String(meaning ?? '').trim()
  let ko = String(exampleKo ?? '').trim()
  if (!ko && String(exampleSentence || '').includes('\n')) {
    ko = splitExampleSentence(exampleSentence).example_ko
  }
  if (m && ko) return `${m}\n${ko}`
  return m || ko || null
}

export function rowToStiInsert(row, teacherId, trainingKind, sortOrder) {
  const ex = String(row.example_sentence || '').trim()
  const { sentence_text, example_ko } = splitExampleSentence(ex)
  const text = sentence_text || ex
  if (!text) return null
  return {
    teacher_id: teacherId,
    set_name: String(row.set_name || '').trim(),
    day: GRAMMAR_LAB_FIXED_DAY,
    sentence_text: text,
    hint_ko: buildHintKo(row.meaning, example_ko, ex),
    youtube_url: row.youtube_url ? String(row.youtube_url).trim() : null,
    image_url: row.image_url ? String(row.image_url).trim() : null,
    difficulty: normalizeWordDifficulty(row.difficulty) || 3,
    training_kind: trainingKind,
    sort_order: sortOrder,
    is_published: true,
  }
}

export function rowToStiUpdate(row, trainingKind) {
  const ex = String(row.example_sentence || '').trim()
  const { sentence_text, example_ko } = splitExampleSentence(ex)
  const text = sentence_text || ex
  return {
    sentence_text: text,
    hint_ko: buildHintKo(row.meaning, example_ko, ex),
    day: GRAMMAR_LAB_FIXED_DAY,
    youtube_url: row.youtube_url ? String(row.youtube_url).trim() : null,
    image_url: row.image_url ? String(row.image_url).trim() : null,
    difficulty: normalizeWordDifficulty(row.difficulty) || 3,
    training_kind: trainingKind,
    sort_order: row.sort_order != null ? parseInt(String(row.sort_order), 10) || 0 : undefined,
  }
}

export function stiToTableRow(item, boxCount = 0) {
  return {
    id: item.id,
    word: '',
    meaning: item.hint_ko != null ? String(item.hint_ko) : '',
    example_sentence: item.sentence_text != null ? String(item.sentence_text) : '',
    set_name: item.set_name,
    day: item.day ?? 1,
    difficulty: item.difficulty ?? 3,
    image_url: item.image_url,
    image_source: item.image_url ? 'upload' : 'none',
    youtube_url: item.youtube_url,
    sort_order: item.sort_order ?? 0,
    _boxCount: boxCount,
  }
}

export function isGrammarRowValid(r) {
  const ex = String(r.example_sentence || '').trim()
  const m = String(r.meaning || '').trim()
  return Boolean(ex) && Boolean(m)
}

export function rowDayNumber(r) {
  const d = parseInt(String(r.day ?? ''), 10)
  return Number.isFinite(d) ? d : 0
}

export const TRAINING_KIND_LABELS = {
  word_order: '어순 배열',
  box_drill: '박스 만들기',
}
