/** 박스 만들기 세트 대량 저장 — 청크 INSERT (300문장 ≈ 3~4회) */

export const GRAMMAR_LAB_CHUNK_SIZE = 100

/** @typedef {{ stage: string, current: number, total: number }} GrammarLabSaveProgress */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object[]} payload
 * @param {(p: GrammarLabSaveProgress) => void} [onProgress]
 */
export async function batchInsertSentenceTrainingItems(supabase, payload, onProgress) {
  const total = payload.length
  const inserted = []
  for (let i = 0; i < total; i += GRAMMAR_LAB_CHUNK_SIZE) {
    const chunk = payload.slice(i, i + GRAMMAR_LAB_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('sentence_training_items')
      .insert(chunk)
      .select('id, sentence_text')
    if (error) throw error
    if (data?.length) inserted.push(...data)
    onProgress?.({
      stage: '문장 등록',
      current: Math.min(i + chunk.length, total),
      total,
    })
  }
  return inserted
}

export function progressPercent(current, total) {
  if (!total) return 0
  return Math.min(100, Math.round((current / total) * 100))
}

export function formatSaveProgressLabel(progress) {
  if (!progress) return ''
  const pct = progressPercent(progress.current, progress.total)
  if (progress.stage === '완료') {
    return `완료 ${progress.current}/${progress.total} (100%)`
  }
  return `${progress.stage} 중… ${progress.current}/${progress.total} (${pct}%)`
}

/** 저장 완료 메시지 1.5초 후 오버레이 닫기 */
export function scheduleClearSaveProgress(setSaveProgress, total) {
  setSaveProgress({ stage: '완료', current: total, total })
  setTimeout(() => setSaveProgress(null), 1500)
}
