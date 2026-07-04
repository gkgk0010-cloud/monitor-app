import { applyBracketParseToRow } from './readingInterpretBracketParse'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} itemId
 */
export async function deleteInterpretItemBoxes(supabase, itemId) {
  if (!itemId) return
  const { error } = await supabase.from('reading_interpret_boxes').delete().eq('item_id', itemId)
  if (error) throw error
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} itemId
 * @param {object[]} boxes
 */
export async function insertInterpretItemBoxes(supabase, itemId, boxes) {
  if (!itemId || !boxes?.length) return
  const payload = boxes.map((b) => ({
    item_id: itemId,
    box_index: b.box_index,
    start_char: b.start_char,
    end_char: b.end_char,
    chunk_label: b.chunk_label ?? null,
    role_hint: b.role_hint ?? null,
  }))
  const { error } = await supabase.from('reading_interpret_boxes').insert(payload)
  if (error) throw error
}

/**
 * 행 내용 기준 boxed_sentence + reading_interpret_boxes 동기화
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} itemId
 * @param {object} row
 */
export async function syncInterpretItemBoxesFromRow(supabase, itemId, row) {
  const parsed = applyBracketParseToRow(row)
  const { error: upErr } = await supabase
    .from('reading_interpret_items')
    .update({
      sentence_en: parsed.sentence_en,
      boxed_sentence: parsed.boxed_sentence,
    })
    .eq('id', itemId)
  if (upErr) throw upErr
  await deleteInterpretItemBoxes(supabase, itemId)
  if (parsed.boxes.length) {
    await insertInterpretItemBoxes(supabase, itemId, parsed.boxes)
  }
  return parsed
}

/**
 * bulk import: insert된 id 배열 + import rows(boxes 포함)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ id: string }[]} insertedIds
 * @param {object[]} importedRows
 */
export async function syncBoxesAfterBulkInsert(supabase, insertedIds, importedRows) {
  for (let i = 0; i < insertedIds.length; i++) {
    const id = insertedIds[i]?.id
    const row = importedRows[i]
    if (!id || !row?.boxes?.length) continue
    await deleteInterpretItemBoxes(supabase, id)
    await insertInterpretItemBoxes(supabase, id, row.boxes)
    if (row.boxed_sentence) {
      await supabase
        .from('reading_interpret_items')
        .update({
          boxed_sentence: row.boxed_sentence,
          sentence_en: row.sentence_en,
        })
        .eq('id', id)
    }
  }
}
