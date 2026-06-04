import { parseBoxDrillFromSentence, sentenceTextForBoxMatch } from './boxDrillExcel'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} itemId
 * @param {{ box_index: number, start_char: number, end_char: number }[]} boxes
 */
export async function upsertBoxDrillAnswers(supabase, itemId, boxes) {
  await supabase.from('box_drill_answers').delete().eq('item_id', itemId)
  if (!boxes?.length) return { ok: true, inserted: 0 }
  const rows = boxes.map((b) => ({
    item_id: itemId,
    box_index: b.box_index,
    start_char: b.start_char,
    end_char: b.end_char,
    chunk_label: null,
  }))
  const { error } = await supabase.from('box_drill_answers').insert(rows)
  if (error) return { ok: false, error }
  return { ok: true, inserted: rows.length }
}

/**
 * sentence_training_items INSERT 직후, 소스 행의 _boxAnswer 로 box_drill_answers 등록
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<{ id: string, sentence_text?: string }>} insertedItems payload 순서와 동일
 * @param {Array<{ example_sentence?: string, _boxAnswer?: string | null }>} sourceRows
 */
export async function applyBoxAnswersForImportedRows(supabase, insertedItems, sourceRows) {
  let success = 0
  let fail = 0
  let skipped = 0
  const n = Math.min(insertedItems.length, sourceRows.length)
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
    const res = await upsertBoxDrillAnswers(supabase, item.id, boxes)
    if (!res.ok) fail += 1
    else success += 1
  }
  return { success, fail, skipped }
}

export function formatBoxImportResultMessage({ success, fail }) {
  if (fail > 0) return `박스 정답 등록 실패: ${fail}개${success > 0 ? ` (성공 ${success}개)` : ''}`
  if (success > 0) return `박스 정답 자동 등록: ${success}개`
  return null
}
