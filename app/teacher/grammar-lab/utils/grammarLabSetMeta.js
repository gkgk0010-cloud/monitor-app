/** @typedef {'full' | 'target'} GrammarLabBoxMode */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} teacherId
 * @param {string} setName
 * @param {'word_order' | 'box_drill'} trainingKind
 */
export async function fetchGrammarLabSetMeta(supabase, teacherId, setName, trainingKind) {
  const sn = String(setName || '').trim()
  if (!teacherId || !sn || !trainingKind) {
    return { box_mode: 'full', task_description: '' }
  }
  const { data, error } = await supabase
    .from('grammar_lab_sets')
    .select('box_mode, task_description')
    .eq('teacher_id', teacherId)
    .eq('set_name', sn)
    .eq('training_kind', trainingKind)
    .maybeSingle()
  if (error || !data) {
    return { box_mode: 'full', task_description: '' }
  }
  return {
    box_mode: data.box_mode === 'target' ? 'target' : 'full',
    task_description: String(data.task_description ?? '').trim(),
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} teacherId
 * @param {'word_order' | 'box_drill'} [trainingKind]
 */
export async function fetchGrammarLabSetMetaMap(supabase, teacherId, trainingKind = 'box_drill') {
  if (!teacherId) return {}
  const { data, error } = await supabase
    .from('grammar_lab_sets')
    .select('set_name, box_mode, task_description')
    .eq('teacher_id', teacherId)
    .eq('training_kind', trainingKind)
  if (error || !data) return {}
  /** @type {Record<string, { box_mode: GrammarLabBoxMode, task_description: string }>} */
  const map = {}
  for (const row of data) {
    const sn = String(row.set_name || '').trim()
    if (!sn) continue
    map[sn] = {
      box_mode: row.box_mode === 'target' ? 'target' : 'full',
      task_description: String(row.task_description ?? '').trim(),
    }
  }
  return map
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ teacherId: string, setName: string, trainingKind: 'box_drill', boxMode: GrammarLabBoxMode, taskDescription?: string }} opts
 */
export async function upsertGrammarLabBoxMode(supabase, { teacherId, setName, trainingKind, boxMode, taskDescription }) {
  const sn = String(setName || '').trim()
  if (!teacherId || !sn || trainingKind !== 'box_drill') {
    return { ok: false, error: 'invalid-args' }
  }
  const mode = boxMode === 'target' ? 'target' : 'full'
  const desc =
    mode === 'target' ? String(taskDescription ?? '').trim() || null : null
  const { error } = await supabase.from('grammar_lab_sets').upsert(
    {
      teacher_id: teacherId,
      set_name: sn,
      training_kind: trainingKind,
      box_mode: mode,
      task_description: desc,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'teacher_id,set_name,training_kind' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ teacherId: string, setName: string, trainingKind: 'word_order' | 'box_drill' }} opts
 */
export async function deleteGrammarLabSetMeta(supabase, { teacherId, setName, trainingKind }) {
  const sn = String(setName || '').trim()
  if (!teacherId || !sn || !trainingKind) return
  await supabase
    .from('grammar_lab_sets')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('set_name', sn)
    .eq('training_kind', trainingKind)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ teacherId: string, oldName: string, newName: string, trainingKind: 'word_order' | 'box_drill' }} opts
 */
export async function renameGrammarLabSetMeta(supabase, { teacherId, oldName, newName, trainingKind }) {
  const oldSn = String(oldName || '').trim()
  const newSn = String(newName || '').trim()
  if (!teacherId || !oldSn || !newSn || oldSn === newSn || !trainingKind) return
  await supabase
    .from('grammar_lab_sets')
    .update({ set_name: newSn, updated_at: new Date().toISOString() })
    .eq('teacher_id', teacherId)
    .eq('set_name', oldSn)
    .eq('training_kind', trainingKind)
}
