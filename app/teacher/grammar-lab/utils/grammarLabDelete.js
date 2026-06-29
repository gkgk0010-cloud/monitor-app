import { deleteGrammarLabSetMeta } from './grammarLabSetMeta'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ teacherId: string, setName: string, trainingKind: 'word_order' | 'box_drill' }} opts
 */
export async function deleteGrammarLabSet(supabase, { teacherId, setName, trainingKind }) {
  const sn = String(setName || '').trim()
  const kind = trainingKind
  if (!teacherId || !sn || !kind) {
    return { ok: false, error: 'invalid-args', deletedItems: 0 }
  }

  const { data: items, error: listErr } = await supabase
    .from('sentence_training_items')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('set_name', sn)
    .eq('training_kind', kind)

  if (listErr) {
    return { ok: false, error: listErr.message, deletedItems: 0 }
  }

  const itemIds = (items || []).map((r) => r.id).filter(Boolean)
  const expected = itemIds.length

  if (itemIds.length > 0) {
    await supabase.from('grammar_lab_hint_events').delete().in('item_id', itemIds)
  }

  await supabase
    .from('grammar_lab_wrong_dismissed')
    .delete()
    .eq('set_name', sn)
    .eq('training_type', kind)

  await supabase
    .from('grammar_lab_session_completions')
    .delete()
    .eq('set_name', sn)
    .eq('training_type', kind)

  await supabase
    .from('training_solve_history')
    .delete()
    .eq('set_name', sn)
    .eq('training_type', kind)

  const { data: deleted, error: delErr } = await supabase
    .from('sentence_training_items')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('set_name', sn)
    .eq('training_kind', kind)
    .select('id')

  if (delErr) {
    return { ok: false, error: delErr.message, deletedItems: 0, expected }
  }

  await deleteGrammarLabSetMeta(supabase, { teacherId, setName: sn, trainingKind: kind })

  const deletedItems = deleted?.length ?? 0
  if (deletedItems === 0 && expected > 0) {
    return {
      ok: false,
      error: '삭제된 구문이 0건입니다. 로그인·권한(RLS)을 확인하세요.',
      deletedItems: 0,
      expected,
    }
  }

  return { ok: true, deletedItems, expected }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ teacherId: string, itemId: string }} opts
 */
export async function deleteGrammarLabItem(supabase, { teacherId, itemId }) {
  const id = String(itemId || '').trim()
  if (!teacherId || !id) {
    return { ok: false, error: 'invalid-args' }
  }

  await supabase.from('grammar_lab_hint_events').delete().eq('item_id', id)
  await supabase.from('grammar_lab_wrong_dismissed').delete().eq('item_id', id)

  const { data: deleted, error: delErr } = await supabase
    .from('sentence_training_items')
    .delete()
    .eq('id', id)
    .eq('teacher_id', teacherId)
    .select('id')

  if (delErr) {
    return { ok: false, error: delErr.message }
  }
  if (!deleted?.length) {
    return { ok: false, error: '삭제된 구문이 없습니다. 권한(RLS) 또는 ID를 확인하세요.' }
  }

  return { ok: true, deletedItems: deleted.length }
}
