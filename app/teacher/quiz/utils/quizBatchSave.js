import { QUIZ_CHUNK_SIZE } from './quizCategories'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object[]} payload
 * @param {(p: { stage: string, current: number, total: number }) => void} [onProgress]
 */
export async function batchInsertQuizItems(supabase, payload, onProgress) {
  const total = payload.length
  const inserted = []
  for (let i = 0; i < total; i += QUIZ_CHUNK_SIZE) {
    const chunk = payload.slice(i, i + QUIZ_CHUNK_SIZE)
    const { data, error } = await supabase.from('quiz_items').insert(chunk).select('id')
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
} from '../../grammar-lab/utils/grammarLabBatchSave'
