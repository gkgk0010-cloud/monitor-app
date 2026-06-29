import { batchInsertReadingInterpretItems } from './readingInterpretBatchSave'
import { rowToItemInsert } from './readingInterpretRows'

/** 학생앱 fetchInterpretBoxAnswers 와 동일 기준 */
export function normalizeInterpretSentenceKey(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** box_drill hint_ko → 독해해석 correct_translation (첫 줄 = meaning) */
export function translationFromBoxHint(hintKo) {
  const s = String(hintKo ?? '').trim()
  if (!s) return ''
  const line = s.split('\n').map((l) => l.trim()).find(Boolean)
  return line || s
}

/**
 * 문장분석(박스 만들기) 세트 → 독해해석 문항 복사
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   teacherId: string,
 *   interpretSetId: string,
 *   boxSourceSetName: string,
 *   onProgress?: (p: { stage: string, current: number, total: number }) => void,
 * }} opts
 */
export async function copyBoxDrillSetToInterpretSet(supabase, opts) {
  const { teacherId, interpretSetId, boxSourceSetName, onProgress } = opts
  const sourceName = String(boxSourceSetName || '').trim()
  if (!teacherId || !interpretSetId || !sourceName) {
    return { ok: false, error: 'invalid-args', inserted: 0, skippedDup: 0, skippedNoTr: 0, totalSource: 0 }
  }

  const { data: existingRows, error: existErr } = await supabase
    .from('reading_interpret_items')
    .select('sentence_en')
    .eq('set_id', interpretSetId)
  if (existErr) throw existErr

  const existingKeys = new Set(
    (existingRows || []).map((r) => normalizeInterpretSentenceKey(r.sentence_en)).filter(Boolean),
  )

  const { data: boxItems, error: boxErr } = await supabase
    .from('sentence_training_items')
    .select('sentence_text, hint_ko, day, sort_order')
    .eq('teacher_id', teacherId)
    .eq('training_kind', 'box_drill')
    .eq('set_name', sourceName)
    .order('day', { ascending: true })
    .order('sort_order', { ascending: true })
  if (boxErr) throw boxErr

  const { data: orderPeek } = await supabase
    .from('reading_interpret_items')
    .select('order_index')
    .eq('set_id', interpretSetId)
    .order('order_index', { ascending: false })
    .limit(1)

  let nextOrder =
    orderPeek?.[0]?.order_index != null ? Math.floor(Number(orderPeek[0].order_index)) + 1 : 0

  const payload = []
  let skippedDup = 0
  let skippedNoTr = 0

  for (const item of boxItems || []) {
    const en = String(item.sentence_text ?? '').trim()
    if (!en) continue
    const key = normalizeInterpretSentenceKey(en)
    if (existingKeys.has(key)) {
      skippedDup += 1
      continue
    }
    const tr = translationFromBoxHint(item.hint_ko)
    if (!tr) {
      skippedNoTr += 1
      continue
    }
    existingKeys.add(key)
    const dayRaw = item.day != null ? Math.floor(Number(item.day)) : null
    const day = dayRaw != null && dayRaw >= 1 && dayRaw <= 30 ? dayRaw : null
    payload.push(
      rowToItemInsert(
        {
          sentence_en: en,
          correct_translation: tr,
          key_words: [],
          hint: '',
          awkward_patterns: '',
          critical_phrases: '',
          day,
        },
        interpretSetId,
        nextOrder,
      ),
    )
    nextOrder += 1
  }

  const totalSource = (boxItems || []).filter((r) => String(r.sentence_text ?? '').trim()).length

  if (!payload.length) {
    return { ok: true, inserted: 0, skippedDup, skippedNoTr, totalSource }
  }

  await batchInsertReadingInterpretItems(supabase, payload, onProgress)
  return { ok: true, inserted: payload.length, skippedDup, skippedNoTr, totalSource }
}

export function formatCopyFromBoxResult(result) {
  const { inserted = 0, skippedDup = 0, skippedNoTr = 0, totalSource = 0 } = result || {}
  if (inserted > 0) {
    const parts = [`해석 문항 ${inserted}개 복사 완료`]
    if (skippedDup) parts.push(`중복 ${skippedDup}개 건너뜀`)
    if (skippedNoTr) parts.push(`의역(힌트) 없음 ${skippedNoTr}개 제외`)
    return parts.join(' · ')
  }
  if (!totalSource) return '출처 세트에 복사할 문장이 없습니다.'
  if (skippedDup && !skippedNoTr) return `가져올 새 문항 없음 (영문 ${skippedDup}개 이미 등록됨)`
  if (skippedNoTr && !skippedDup) return `복사 가능 문항 없음 (의역/힌트 없음 ${skippedNoTr}개)`
  return `복사할 문항 없음 (중복 ${skippedDup} · 의역 없음 ${skippedNoTr})`
}
