import { parseKeyWordsCell, trimKeyWords } from './readingInterpretRows'
import { batchUpdateReadingInterpretItems } from './readingInterpretBatchSave'

const CHUNK_SIZE = 10
const SAVE_PAUSE_MS = 40

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function applyAIResultToRow(row, ai) {
  if (!ai) return row
  const hasKw = trimKeyWords(row.key_words).length > 0
  const kwFromAi =
    typeof ai.key_words === 'string'
      ? parseKeyWordsCell(ai.key_words)
      : Array.isArray(ai.key_words)
        ? ai.key_words
        : []
  const awkwardArr = Array.isArray(ai.awkward_patterns)
    ? ai.awkward_patterns
    : String(ai.awkward_patterns || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
  const criticalArr = Array.isArray(ai.critical_phrases)
    ? ai.critical_phrases
    : String(ai.critical_phrases || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

  return {
    ...row,
    key_words: hasKw ? row.key_words : kwFromAi.length ? kwFromAi : row.key_words,
    hint: String(row.hint || '').trim() || String(ai.hint || '').trim(),
    awkward_patterns:
      String(row.awkward_patterns || '').trim() || (awkwardArr.length ? awkwardArr.join(',') : ''),
    critical_phrases:
      String(row.critical_phrases || '').trim() || (criticalArr.length ? criticalArr.join(',') : ''),
  }
}

export function isInterpretRowAiComplete(row) {
  return (
    trimKeyWords(row.key_words).length > 0 &&
    String(row.hint || '').trim() !== '' &&
    String(row.awkward_patterns || '').trim() !== '' &&
    String(row.critical_phrases || '').trim() !== ''
  )
}

export async function invokeInterpretMetaGenerator(supabase, { items, set_context }) {
  const { data, error } = await supabase.functions.invoke('interpret-meta-generator', {
    body: { items, set_context },
  })
  if (error) throw new Error(error.message || 'Edge Function 호출 실패')
  if (data?.error) throw new Error(String(data.error))
  return Array.isArray(data?.results) ? data.results : []
}

/**
 * @returns {{ updatedRows: object[], processed: number, skipped: number, saved: number, failedChunkCount: number }}
 */
export async function bulkGenerateInterpretMeta(supabase, rows, setContext, onProgress, setId) {
  const pending = rows.filter((r) => {
    if (String(r.id || '').startsWith('temp-')) return false
    if (!String(r.sentence_en || '').trim() || !String(r.correct_translation || '').trim()) return false
    return !isInterpretRowAiComplete(r)
  })
  const skipped = rows.length - pending.length
  let processed = 0
  let saved = 0
  let failedChunkCount = 0
  const byId = new Map(rows.map((r) => [String(r.id), { ...r }]))

  for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
    const chunk = pending.slice(i, i + CHUNK_SIZE)
    const done = Math.min(i + chunk.length, pending.length)
    if (onProgress) {
      onProgress({
        current: done,
        total: pending.length,
        processed,
        saved,
        log: `${done} / ${pending.length} AI 처리 · DB 저장 ${saved}건`,
      })
    }

    const payload = chunk.map((r) => ({
      id: r.id,
      sentence_en: r.sentence_en,
      correct_translation: r.correct_translation,
    }))

    try {
      const results = await invokeInterpretMetaGenerator(supabase, {
        items: payload,
        set_context: setContext,
      })
      const chunkUpdated = []
      for (const ai of results) {
        const id = String(ai?.id || '')
        if (!id || !byId.has(id)) continue
        byId.set(id, applyAIResultToRow(byId.get(id), ai))
        chunkUpdated.push(byId.get(id))
        processed += 1
      }

      if (setId && chunkUpdated.length) {
        try {
          const count = await batchUpdateReadingInterpretItems(supabase, setId, chunkUpdated)
          saved += count
        } catch (saveErr) {
          console.error('[readingInterpretAi] chunk save failed', saveErr)
          failedChunkCount += 1
        }
      }

      await sleep(SAVE_PAUSE_MS)
    } catch (e) {
      console.error('[readingInterpretAi] chunk AI failed', e)
      failedChunkCount += 1
    }
  }

  if (onProgress) {
    onProgress({
      current: pending.length,
      total: pending.length,
      processed,
      saved,
      log: `완료 · AI ${processed}건 · DB 저장 ${saved}건`,
    })
  }

  return {
    updatedRows: rows.map((r) => byId.get(String(r.id)) || r),
    processed,
    skipped,
    saved,
    failedChunkCount,
  }
}
