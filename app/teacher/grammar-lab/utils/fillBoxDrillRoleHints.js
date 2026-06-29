/**
 * 출처 문장분석 세트 box_drill_answers.role_hint AI 일괄 채우기
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} itemIds
 */
export async function countMissingBoxRoleHints(supabase, itemIds) {
  const ids = (itemIds || []).filter(Boolean)
  if (!ids.length) return { total: 0, missing: 0 }
  const { data, error } = await supabase
    .from('box_drill_answers')
    .select('id, role_hint')
    .in('item_id', ids)
  if (error) throw error
  const rows = data || []
  const missing = rows.filter((r) => !String(r.role_hint ?? '').trim()).length
  return { total: rows.length, missing }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ teacherId: string, boxSourceSetName: string }} opts
 */
export async function fillBoxDrillRoleHintsForSet(supabase, { teacherId, boxSourceSetName }) {
  const setName = String(boxSourceSetName || '').trim()
  if (!teacherId || !setName) {
    return { ok: false, error: 'invalid-args', updated: 0 }
  }

  const { data: items, error: itemErr } = await supabase
    .from('sentence_training_items')
    .select('id, sentence_text')
    .eq('teacher_id', teacherId)
    .eq('set_name', setName)
    .eq('training_kind', 'box_drill')
  if (itemErr) throw itemErr

  const itemIds = (items || []).map((r) => r.id).filter(Boolean)
  if (!itemIds.length) {
    return { ok: false, error: 'no-items', updated: 0 }
  }

  const { data: boxes, error: boxErr } = await supabase
    .from('box_drill_answers')
    .select('id, item_id, box_index, start_char, end_char, role_hint')
    .in('item_id', itemIds)
    .order('box_index')
  if (boxErr) throw boxErr

  const byItem = new Map()
  for (const it of items || []) {
    byItem.set(it.id, { item_id: it.id, sentence_text: it.sentence_text, boxes: [] })
  }
  for (const b of boxes || []) {
    const row = byItem.get(b.item_id)
    if (!row) continue
    const text = String(row.sentence_text || '').slice(b.start_char, b.end_char)
    row.boxes.push({
      box_index: b.box_index,
      english: text,
      role_hint: b.role_hint,
      answer_id: b.id,
    })
  }

  const payload = [...byItem.values()].filter((x) => x.boxes.length)
  if (!payload.length) {
    return { ok: false, error: 'no-boxes', updated: 0 }
  }

  const res = await fetch('/api/grammar-lab/fill-role-hints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: payload }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'AI 채우기 실패')

  let updated = 0
  for (const f of json.filled || []) {
    const parent = byItem.get(f.item_id)
    const box = parent?.boxes?.find((x) => Number(x.box_index) === Number(f.box_index))
    if (!box?.answer_id || !f.role_hint) continue
    const { error: upErr } = await supabase
      .from('box_drill_answers')
      .update({ role_hint: f.role_hint })
      .eq('id', box.answer_id)
    if (!upErr) updated += 1
  }

  return { ok: true, updated, setName }
}
