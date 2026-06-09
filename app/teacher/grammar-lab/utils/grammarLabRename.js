/**
 * 문법 해부실 세트 이름 변경 — 구문 + 학습 기록 set_name 동기화
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ teacherId: string, oldName: string, newName: string, trainingKind: 'word_order' | 'box_drill' }} opts
 */
export async function renameGrammarLabSet(supabase, { teacherId, oldName, newName, trainingKind }) {
  const oldSn = String(oldName || '').trim()
  const newSn = String(newName || '').trim()
  const kind = trainingKind
  if (!teacherId || !oldSn || !newSn || !kind) {
    return { ok: false, error: 'invalid-args', renamed: 0 }
  }
  if (oldSn === newSn) {
    return { ok: true, renamed: 0 }
  }

  const { data: dup, error: dupErr } = await supabase
    .from('sentence_training_items')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('set_name', newSn)
    .eq('training_kind', kind)
    .limit(1)

  if (dupErr) {
    return { ok: false, error: dupErr.message, renamed: 0 }
  }
  if (dup?.length) {
    return { ok: false, error: 'duplicate-name', renamed: 0 }
  }

  const { data: items, error: listErr } = await supabase
    .from('sentence_training_items')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('set_name', oldSn)
    .eq('training_kind', kind)

  if (listErr) {
    return { ok: false, error: listErr.message, renamed: 0 }
  }

  const itemIds = (items || []).map((r) => r.id).filter(Boolean)
  if (!itemIds.length) {
    return { ok: false, error: 'no-items', renamed: 0 }
  }

  const { data: updated, error: upErr } = await supabase
    .from('sentence_training_items')
    .update({ set_name: newSn })
    .eq('teacher_id', teacherId)
    .eq('set_name', oldSn)
    .eq('training_kind', kind)
    .select('id')

  if (upErr) {
    return { ok: false, error: upErr.message, renamed: 0 }
  }

  const renamed = updated?.length ?? 0

  let histQ = supabase
    .from('training_solve_history')
    .update({ set_name: newSn })
    .eq('set_name', oldSn)
    .eq('training_type', kind)
    .in('item_id', itemIds)
  const { error: histErr } = await histQ
  if (histErr) {
    return { ok: false, error: histErr.message, renamed: 0 }
  }

  await supabase
    .from('grammar_lab_wrong_dismissed')
    .update({ set_name: newSn })
    .eq('set_name', oldSn)
    .eq('training_type', kind)
    .in('item_id', itemIds)

  const { data: solverRows } = await supabase
    .from('training_solve_history')
    .select('user_id')
    .eq('set_name', newSn)
    .eq('training_type', kind)
    .in('item_id', itemIds)
  const { data: sessionRows } = await supabase
    .from('grammar_lab_session_completions')
    .select('user_id')
    .eq('set_name', oldSn)
    .eq('training_type', kind)
  const affectedUsers = [
    ...new Set(
      [...(solverRows || []), ...(sessionRows || [])]
        .map((r) => String(r.user_id || '').trim())
        .filter(Boolean),
    ),
  ]
  if (affectedUsers.length) {
    await supabase
      .from('grammar_lab_session_completions')
      .update({ set_name: newSn })
      .eq('set_name', oldSn)
      .eq('training_type', kind)
      .in('user_id', affectedUsers)
  }

  return { ok: true, renamed }
}
