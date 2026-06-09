/** vocab-app `VOCAB_SCOPE_KEY_SEP` — scope_key 1번째 필드가 set_name */
const VOCAB_SCOPE_KEY_SEP = '\u001f'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} table
 * @param {string} oldSn
 * @param {string} newSn
 * @param {{ userIds?: string[] }} [scope]
 */
async function updateSetNameColumn(supabase, table, oldSn, newSn, scope) {
  let q = supabase.from(table).update({ set_name: newSn }).eq('set_name', oldSn)
  const uids = scope?.userIds?.filter(Boolean) ?? []
  if (uids.length) q = q.in('user_id', uids)
  const { error } = await q
  if (error) throw new Error(`${table}: ${error.message}`)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} oldSn
 * @param {string} newSn
 * @param {string[]} wordIds
 */
async function migrateWordLearningHistory(supabase, oldSn, newSn, wordIds) {
  if (!wordIds.length) return 0
  const { data, error } = await supabase
    .from('word_learning_history')
    .update({ set_name: newSn })
    .eq('set_name', oldSn)
    .in('word_id', wordIds)
    .select('id')
  if (error) throw new Error(`word_learning_history: ${error.message}`)
  return data?.length ?? 0
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} oldSn
 * @param {string} newSn
 * @param {string[]} userIds
 */
async function migrateVocabStudyStateScopeKeys(supabase, oldSn, newSn, userIds) {
  if (!userIds.length) return 0
  let migrated = 0
  const patterns = [`${oldSn}${VOCAB_SCOPE_KEY_SEP}%`, `${oldSn}\u0000%`]
  const seen = new Set()

  for (const pattern of patterns) {
    let q = supabase.from('vocab_study_state').select('user_id, scope_key, state, updated_at').like('scope_key', pattern)
    q = q.in('user_id', userIds)
    const { data: rows, error } = await q
    if (error) throw new Error(`vocab_study_state: ${error.message}`)

    for (const row of rows || []) {
      const dedupe = `${row.user_id}\0${row.scope_key}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)

      const parts = String(row.scope_key).includes(VOCAB_SCOPE_KEY_SEP)
        ? String(row.scope_key).split(VOCAB_SCOPE_KEY_SEP)
        : String(row.scope_key).split('\0')
      if (parts.length !== 3 || parts[0] !== oldSn) continue

      const newKey = `${newSn}${VOCAB_SCOPE_KEY_SEP}${parts[1]}${VOCAB_SCOPE_KEY_SEP}${parts[2]}`
      if (newKey === row.scope_key) continue

      const { error: upErr } = await supabase.from('vocab_study_state').upsert(
        {
          user_id: row.user_id,
          scope_key: newKey,
          state: row.state,
          updated_at: row.updated_at,
        },
        { onConflict: 'user_id,scope_key' },
      )
      if (upErr) throw new Error(`vocab_study_state upsert: ${upErr.message}`)

      const { error: delErr } = await supabase
        .from('vocab_study_state')
        .delete()
        .eq('user_id', row.user_id)
        .eq('scope_key', row.scope_key)
      if (delErr) throw new Error(`vocab_study_state delete: ${delErr.message}`)
      migrated++
    }
  }
  return migrated
}

/**
 * 단어 세트 이름 변경 + 학생 학습·점수·루틴 기록 set_name 동기화
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ teacherId: string, wordSetId: string, oldName: string, newName: string }} opts
 */
export async function renameWordSet(supabase, { teacherId, wordSetId, oldName, newName }) {
  const oldSn = String(oldName || '').trim()
  const newSn = String(newName || '').trim()
  const tid = String(teacherId || '').trim()
  const wid = String(wordSetId || '').trim()
  if (!tid || !wid || !oldSn || !newSn) {
    return { ok: false, error: 'invalid-args' }
  }
  if (oldSn === newSn) {
    return { ok: true }
  }

  const { data: clash } = await supabase
    .from('word_sets')
    .select('id')
    .eq('teacher_id', tid)
    .eq('name', newSn)
    .neq('id', wid)
    .maybeSingle()
  if (clash?.id) {
    return { ok: false, error: 'duplicate-name' }
  }

  const { data: wordsInSet, error: wErr } = await supabase
    .from('words')
    .select('id')
    .eq('teacher_id', tid)
    .eq('set_name', oldSn)
  if (wErr) {
    return { ok: false, error: wErr.message }
  }
  const wordIds = (wordsInSet || []).map((r) => r.id).filter(Boolean)

  const { data: accessRows, error: aErr } = await supabase
    .from('student_set_access')
    .select('student_id')
    .eq('set_id', wid)
  if (aErr) {
    return { ok: false, error: aErr.message }
  }
  const studentIds = [...new Set((accessRows || []).map((r) => String(r.student_id || '').trim()).filter(Boolean))]

  let historyUserIds = []
  if (wordIds.length) {
    const { data: histUsers, error: hErr } = await supabase
      .from('word_learning_history')
      .select('user_id')
      .eq('set_name', oldSn)
      .in('word_id', wordIds)
    if (hErr) {
      return { ok: false, error: hErr.message }
    }
    historyUserIds = [...new Set((histUsers || []).map((r) => String(r.user_id || '').trim()).filter(Boolean))]
  }
  const affectedUserIds = [...new Set([...studentIds, ...historyUserIds])]

  const { error: e1 } = await supabase.from('word_sets').update({ name: newSn }).eq('id', wid).eq('teacher_id', tid)
  if (e1) return { ok: false, error: e1.message }

  const { error: e2 } = await supabase.from('words').update({ set_name: newSn }).eq('teacher_id', tid).eq('set_name', oldSn)
  if (e2) return { ok: false, error: e2.message }

  const { error: e3 } = await supabase.from('routines').update({ set_name: newSn }).eq('teacher_id', tid).eq('set_name', oldSn)
  if (e3) console.warn('[wordSetRename] routines', e3.message)

  const { error: e4 } = await supabase.from('routine_applications').update({ set_name: newSn }).eq('set_name', oldSn)
  if (e4) console.warn('[wordSetRename] routine_applications', e4.message)

  try {
    await migrateWordLearningHistory(supabase, oldSn, newSn, wordIds)
    if (affectedUserIds.length) {
      await updateSetNameColumn(supabase, 'matching_scores', oldSn, newSn, { userIds: affectedUserIds })
      await updateSetNameColumn(supabase, 'scramble_scores', oldSn, newSn, { userIds: affectedUserIds })
      await updateSetNameColumn(supabase, 'vocab_test_attempts', oldSn, newSn, { userIds: affectedUserIds })
      await migrateVocabStudyStateScopeKeys(supabase, oldSn, newSn, affectedUserIds)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }

  return { ok: true }
}
