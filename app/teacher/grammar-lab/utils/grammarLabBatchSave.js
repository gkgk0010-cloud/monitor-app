/** sentence_training_items 대량 저장 — 청크 INSERT (Network 3~7회 수준) */

export const STI_INSERT_CHUNK_SIZE = 50

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object[]} payload
 * @param {(p: { done: number, total: number, phase: 'items' }) => void} [onProgress]
 */
export async function batchInsertSentenceTrainingItems(supabase, payload, onProgress) {
  const total = payload.length
  const inserted = []
  for (let i = 0; i < total; i += STI_INSERT_CHUNK_SIZE) {
    const chunk = payload.slice(i, i + STI_INSERT_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('sentence_training_items')
      .insert(chunk)
      .select('id, sentence_text')
    if (error) throw error
    if (data?.length) inserted.push(...data)
    onProgress?.({
      done: Math.min(i + chunk.length, total),
      total,
      phase: 'items',
    })
  }
  return inserted
}

export function progressPercent(done, total) {
  if (!total) return 0
  return Math.min(100, Math.round((done / total) * 100))
}

export function formatSaveProgressLabel(progress) {
  if (!progress) return ''
  const pct = progressPercent(progress.done, progress.total)
  if (progress.phase === 'boxes') {
    return `박스 정답 등록 중… ${progress.done}/${progress.total} (${pct}%)`
  }
  return `문장 등록 중… ${progress.done}/${progress.total} (${pct}%)`
}
