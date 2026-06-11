import { READING_INTERPRET_CHUNK_SIZE } from './readingInterpretRows'

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

export {
  progressPercent,
  formatSaveProgressLabel,
  scheduleClearSaveProgress,
} from './grammarLabBatchSave'
