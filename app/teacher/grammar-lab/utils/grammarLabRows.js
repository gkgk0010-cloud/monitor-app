import { normalizeWordDifficulty } from '../../words/utils/parsers'

/** WordTable/BulkImport 행 ↔ sentence_training_items 변환 */

/** 문법 해부실(박스 만들기·어순 배열): 기본 Day — 엑셀 day 컬럼 또는 행 day 값이 있으면 그 값 사용 */
export const GRAMMAR_LAB_FIXED_DAY = 1

export function resolveGrammarRowDay(row, fallback = GRAMMAR_LAB_FIXED_DAY) {
  const d = parseInt(String(row?.day ?? ''), 10)
  if (Number.isFinite(d) && d >= 1) return d
  return fallback
}

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
    const { sentence_text } = parseBracketBoxMarkers(parts[0] || '')
    return { sentence_text, example_ko: '' }
  }
  const { sentence_text } = parseBracketBoxMarkers(parts[0])
  return { sentence_text, example_ko: parts.slice(1).join('\n') }
}

/**
 * 엑셀 예문의 [박스] 표시 → 괄호 제거 sentence_text + box_drill_answers용 char 범위
 * @returns {{ sentence_text: string, boxes: { box_index: number, start_char: number, end_char: number }[] }}
 */
export function parseBracketBoxMarkers(raw) {
  const text = String(raw ?? '')
  if (!text.includes('[')) {
    return { sentence_text: text.trim(), boxes: [] }
  }
  let clean = ''
  const boxes = []
  let i = 0
  while (i < text.length) {
    if (text[i] === '[') {
      const close = text.indexOf(']', i + 1)
      if (close === -1) {
        clean += text[i]
        i += 1
        continue
      }
      const inner = text.slice(i + 1, close)
      const start = clean.length
      clean += inner
      const end = clean.length
      if (inner.trim()) {
        boxes.push({ box_index: boxes.length, start_char: start, end_char: end })
      }
      i = close + 1
      continue
    }
    clean += text[i]
    i += 1
  }
  return { sentence_text: clean.trim(), boxes }
}

/**
 * meaning 컬럼 "(박스타입) 한국어 / …" → hint_ko용 한국어만 (타입 라벨 제거)
 */
export function normalizeMeaningForHintKo(meaning) {
  const m = String(meaning ?? '').trim()
  if (!m) return ''
  if (/\([^)]+\)/.test(m) && m.includes('/')) {
    const parts = m
      .split(/\s*\/\s*/)
      .map((seg) => seg.replace(/^\([^)]*\)\s*/, '').trim())
      .filter(Boolean)
    if (parts.length) return parts.join(' / ')
  }
  return m
}

/** meaning + example_ko → hint_ko (\n merge) */
export function buildHintKo(meaning, exampleKo, exampleSentence) {
  const m = normalizeMeaningForHintKo(meaning)
  let ko = String(exampleKo ?? '').trim()
  if (!ko && String(exampleSentence || '').includes('\n')) {
    ko = splitExampleSentence(exampleSentence).example_ko
  }
  if (m && ko) return `${m}\n${ko}`
  return m || ko || null
}

/** WordTable 행 example_sentence에 [ ]가 있으면 표시용·저장용 문장 정리 + 박스 메타 */
export function normalizeGrammarExampleRow(row) {
  const ex = String(row.example_sentence ?? '').trim()
  if (!ex.includes('[')) return row
  const firstLine = ex.split('\n')[0]
  const rest = ex.includes('\n') ? ex.slice(ex.indexOf('\n')) : ''
  const { sentence_text, boxes } = parseBracketBoxMarkers(firstLine)
  const merged = rest ? `${sentence_text}${rest}` : sentence_text
  return {
    ...row,
    example_sentence: merged,
    _bracketBoxes: boxes.length ? boxes : row._bracketBoxes ?? null,
  }
}

export function rowToStiInsert(row, teacherId, trainingKind, sortOrder) {
  const ex = String(row.example_sentence || '').trim()
  const { sentence_text, example_ko } = splitExampleSentence(ex)
  const text = sentence_text || ex
  if (!text) return null
  return {
    teacher_id: teacherId,
    set_name: String(row.set_name || '').trim(),
    day: resolveGrammarRowDay(row),
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
    day: resolveGrammarRowDay(row),
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
