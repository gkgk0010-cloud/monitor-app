import { isInterpretRowValid, READING_INTERPRET_CHUNK_SIZE, rowToItemUpdate } from './readingInterpretRows'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object[]} payload
 * @param {(p: { stage: string, current: number, total: number }) => void} [onProgress]
 */
export async function batchInsertReadingInterpretItems(supabase, payload, onProgress) {
  const total = payload.length
  const inserted = []
  for (let i = 0; i < total; i += READING_INTERPRET_CHUNK_SIZE) {
    const chunk = payload.slice(i, i + READING_INTERPRET_CHUNK_SIZE)
    const { data, error } = await supabase.from('reading_interpret_items').insert(chunk).select('id')
    if (error) throw error
    if (data?.length) inserted.push(...data)
    onProgress?.({
      stage: '문항 등록',
      current: Math.min(i + chunk.length, total),
      total,
    })
  }
  return inserted
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} setId
 * @param {object[]} rows
 * @param {(p: { stage: string, current: number, total: number }) => void} [onProgress]
 */
export async function batchUpdateReadingInterpretItems(supabase, setId, rows, onProgress) {
  const targets = rows.filter(
    (r) => !String(r.id || '').startsWith('temp-') && isInterpretRowValid(r),
  )
  const total = targets.length
  let current = 0
  for (const row of targets) {
    const payload = rowToItemUpdate(row)
    const { error } = await supabase
      .from('reading_interpret_items')
      .update(payload)
      .eq('id', row.id)
      .eq('set_id', setId)
    if (error) throw error
    current += 1
    onProgress?.({ stage: '저장 중', current, total })
  }
  return current
}

export {
  progressPercent,
  formatSaveProgressLabel,
  scheduleClearSaveProgress,
} from './grammarLabBatchSave'
