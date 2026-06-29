import { rowToStiUpdate } from './grammarLabRows'

const RECOVERY_PREFIX = 'tokpass_grammar_hint_ko_recovery_v1_'

function recoveryKey(teacherId, setName) {
  const sn = String(setName || '_').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  return `${RECOVERY_PREFIX}${teacherId}_${sn}`
}

/** @returns {{ id: string, meaning: string, example_sentence?: string }[]} */
export function loadHintKoRecovery(teacherId, setName) {
  if (typeof localStorage === 'undefined' || !teacherId) return []
  try {
    const raw = localStorage.getItem(recoveryKey(teacherId, setName))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveHintKoRecoveryEntry(teacherId, setName, row) {
  if (typeof localStorage === 'undefined' || !teacherId || !row?.id) return
  const id = String(row.id)
  if (id.startsWith('temp-')) return
  const meaning = String(row.meaning ?? '').trim()
  if (!meaning) return
  const list = loadHintKoRecovery(teacherId, setName).filter((r) => String(r.id) !== id)
  list.push({
    id,
    meaning,
    example_sentence: String(row.example_sentence ?? '').trim(),
  })
  try {
    localStorage.setItem(recoveryKey(teacherId, setName), JSON.stringify(list))
  } catch (_e) {}
}

export function clearHintKoRecoveryEntry(teacherId, setName, rowId) {
  if (typeof localStorage === 'undefined' || !teacherId) return
  const id = String(rowId)
  const next = loadHintKoRecovery(teacherId, setName).filter((r) => String(r.id) !== id)
  try {
    if (next.length) localStorage.setItem(recoveryKey(teacherId, setName), JSON.stringify(next))
    else localStorage.removeItem(recoveryKey(teacherId, setName))
  } catch (_e) {}
}

export function clearHintKoRecoveryAll(teacherId, setName) {
  if (typeof localStorage === 'undefined' || !teacherId) return
  try {
    localStorage.removeItem(recoveryKey(teacherId, setName))
  } catch (_e) {}
}

/**
 * sentence_training_items.hint_ko 즉시 저장
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function persistHintKoRow(supabase, { row, trainingKind, teacherId }) {
  if (!supabase || !teacherId || !row?.id) {
    return { ok: false, reason: 'missing-args' }
  }
  if (String(row.id).startsWith('temp-')) {
    return { ok: false, reason: 'temp-id' }
  }
  const meaning = String(row.meaning ?? '').trim()
  if (!meaning) {
    return { ok: false, reason: 'empty-meaning' }
  }
  const payload = rowToStiUpdate(row, trainingKind)
  const { error } = await supabase
    .from('sentence_training_items')
    .update(payload)
    .eq('id', row.id)
    .eq('teacher_id', teacherId)
  if (error) {
    return { ok: false, reason: 'db-error', error: error.message }
  }
  return { ok: true }
}
