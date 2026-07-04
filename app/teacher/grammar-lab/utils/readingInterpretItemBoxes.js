import { applyBracketParseToRow } from './readingInterpretBracketParse'
import { READING_INTERPRET_CHUNK_SIZE } from './readingInterpretRows'

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
 * @param {(p: { stage: string, current: number, total: number }) => void} [onProgress]
 */
export async function syncBoxesAfterBulkInsert(supabase, insertedIds, importedRows, onProgress) {
  /** @type {{ id: string, row: object }[]} */
  const pairs = []
  for (let i = 0; i < insertedIds.length; i++) {
    const id = insertedIds[i]?.id
    const row = importedRows[i]
    if (!id || !row?.boxes?.length) continue
    pairs.push({ id, row })
  }

  const total = pairs.length
  if (!total) {
    onProgress?.({ stage: '박스 정보 저장', current: 0, total: 0 })
    return
  }

  let current = 0
  for (let i = 0; i < pairs.length; i += READING_INTERPRET_CHUNK_SIZE) {
    const chunk = pairs.slice(i, i + READING_INTERPRET_CHUNK_SIZE)
    const itemIds = chunk.map((p) => p.id)

    const { error: delErr } = await supabase.from('reading_interpret_boxes').delete().in('item_id', itemIds)
    if (delErr) throw delErr

    const boxPayload = []
    for (const { id, row } of chunk) {
      for (const b of row.boxes) {
        boxPayload.push({
          item_id: id,
          box_index: b.box_index,
          start_char: b.start_char,
          end_char: b.end_char,
          chunk_label: b.chunk_label ?? null,
          role_hint: b.role_hint ?? null,
        })
      }
    }
    if (boxPayload.length) {
      const { error: insErr } = await supabase.from('reading_interpret_boxes').insert(boxPayload)
      if (insErr) throw insErr
    }

    current = Math.min(i + chunk.length, total)
    onProgress?.({ stage: '박스 정보 저장', current, total })
  }
}
