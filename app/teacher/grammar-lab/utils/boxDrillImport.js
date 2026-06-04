import { parseBoxDrillFromSentence, sentenceTextForBoxMatch } from './boxDrillExcel'
import { GRAMMAR_LAB_CHUNK_SIZE } from './grammarLabBatchSave'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} itemId
 * @param {{ box_index: number, start_char: number, end_char: number }[]} boxes
 */
export async function upsertBoxDrillAnswers(supabase, itemId, boxes) {
  await supabase.from('box_drill_answers').delete().eq('item_id', itemId)
  if (!boxes?.length) return { ok: true, inserted: 0 }
  const rows = boxes.map((b, i) => ({
    item_id: itemId,
    box_index: i,
    start_char: b.start_char,
    end_char: b.end_char,
    chunk_label: b.chunk_label ?? null,
  }))
  const { error } = await supabase.from('box_drill_answers').insert(rows)
  if (error) return { ok: false, error }
  return { ok: true, inserted: rows.length }
}

/**
 * 신규 가져오기: 모든 box_drill_answers 행을 모아 청크 INSERT (문항별 DELETE 없음)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<{ id: string, sentence_text?: string }>} insertedItems
 * @param {Array<{ example_sentence?: string, _boxAnswer?: string | null }>} sourceRows
 * @param {(p: import('./grammarLabBatchSave').GrammarLabSaveProgress) => void} [onProgress]
 */
export async function applyBoxAnswersForImportedRowsBatched(
  supabase,
  insertedItems,
  sourceRows,
  onProgress,
) {
  const n = Math.min(insertedItems.length, sourceRows.length)
  const allBoxes = []
  let fail = 0
  let skipped = 0
  let successItems = 0

  for (let i = 0; i < n; i++) {
    const src = sourceRows[i]
    const item = insertedItems[i]
    const ans = String(src?._boxAnswer ?? '').trim()
    if (!ans) {
      skipped += 1
      continue
    }
    const sentence =
      String(item.sentence_text ?? '').trim() || sentenceTextForBoxMatch(src.example_sentence)
    const boxes = parseBoxDrillFromSentence(sentence, ans)
    if (!boxes) {
      fail += 1
      continue
    }
    successItems += 1
    for (const b of boxes) {
      allBoxes.push({
        item_id: item.id,
        box_index: b.box_index,
        start_char: b.start_char,
        end_char: b.end_char,
        chunk_label: null,
      })
    }
  }

  const total = allBoxes.length
  for (let i = 0; i < total; i += GRAMMAR_LAB_CHUNK_SIZE) {
    const chunk = allBoxes.slice(i, i + GRAMMAR_LAB_CHUNK_SIZE)
    if (chunk.length) {
      const { error } = await supabase.from('box_drill_answers').insert(chunk)
      if (error) throw error
    }
    onProgress?.({
      stage: '박스 정답 등록',
      current: Math.min(i + chunk.length, total),
      total,
    })
  }

  return { success: successItems, fail, skipped, boxRows: total }
}

export function formatBoxImportResultMessage({ success, fail }) {
  if (fail > 0) return `박스 정답 등록 실패: ${fail}개${success > 0 ? ` (성공 ${success}개)` : ''}`
  if (success > 0) return `박스 정답 자동 등록: ${success}개`
  return null
}
