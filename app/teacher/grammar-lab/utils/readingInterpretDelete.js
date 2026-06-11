/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ teacherId: string, setId: string }} params
 */
export async function deleteReadingInterpretSet(supabase, { teacherId, setId }) {
  const { error: itemsErr } = await supabase.from('reading_interpret_items').delete().eq('set_id', setId)
  if (itemsErr) return { ok: false, error: itemsErr.message }

  const { error: setErr } = await supabase
    .from('reading_interpret_sets')
    .delete()
    .eq('id', setId)
    .eq('teacher_id', teacherId)
  if (setErr) return { ok: false, error: setErr.message }
  return { ok: true }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ setId: string, itemId: string }} params
 */
export async function deleteReadingInterpretItem(supabase, { setId, itemId }) {
  const { error } = await supabase
    .from('reading_interpret_items')
    .delete()
    .eq('id', itemId)
    .eq('set_id', setId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
