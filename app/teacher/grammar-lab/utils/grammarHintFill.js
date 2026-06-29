const CHUNK_SIZE = 8

/**
 * @param {{ id: string, sentence_text: string, hint_ko?: string }[]} items
 * @returns {Promise<{ filled: { id: string, hint_ko: string }[], missingIds: string[], error?: string, parseError?: boolean }>}
 */
export async function fetchHintKoBatch(items) {
  const res = await fetch('/api/grammar-lab/fill-hints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(json.error || 'hint_ko 자동 채우기 실패')
    err.parseError = json.parseError === true
    throw err
  }
  return {
    filled: Array.isArray(json.filled) ? json.filled : [],
    missingIds: Array.isArray(json.missingIds) ? json.missingIds : [],
  }
}

/**
 * @param {object[]} rows — WordTable 행 (example_sentence, meaning)
 * @param {(p: { current: number, total: number, log: string }) => void} [onProgress]
 */
export async function fillHintKoForGrammarRows(rows, onProgress) {
  const pending = rows.filter((r) => {
    const ex = String(r.example_sentence ?? '').trim().split('\n')[0]
    const m = String(r.meaning ?? '').trim()
    return ex && !m
  })
  if (!pending.length) {
    return { updatedRows: rows, filled: 0, failedIds: [] }
  }

  const byId = new Map(rows.map((r) => [String(r.id), { ...r }]))
  const failedIds = new Set()
  let filled = 0

  for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
    const chunk = pending.slice(i, i + CHUNK_SIZE)
    onProgress?.({
      current: i,
      total: pending.length,
      log: `hint_ko 자동 채우기 (${Math.floor(i / CHUNK_SIZE) + 1}배치)…`,
    })
    const payload = chunk.map((r) => ({
      id: String(r.id),
      sentence_text: String(r.example_sentence ?? '').trim().split('\n')[0],
      hint_ko: String(r.meaning ?? '').trim() || null,
    }))
    try {
      const { filled: batchFilled, missingIds } = await fetchHintKoBatch(payload)
      for (const f of batchFilled) {
        const cur = byId.get(String(f.id))
        if (!cur || !String(f.hint_ko || '').trim()) continue
        cur.meaning = String(f.hint_ko).trim()
        filled += 1
      }
      for (const id of missingIds || []) {
        failedIds.add(String(id))
      }
      for (const r of chunk) {
        const cur = byId.get(String(r.id))
        if (cur && !String(cur.meaning ?? '').trim()) {
          failedIds.add(String(r.id))
        }
      }
    } catch (e) {
      console.error('[grammarHintFill]', e)
      for (const r of chunk) failedIds.add(String(r.id))
      throw e
    }
  }

  onProgress?.({ current: pending.length, total: pending.length, log: '완료' })
  return {
    updatedRows: rows.map((r) => byId.get(String(r.id)) || r),
    filled,
    failedIds: [...failedIds],
  }
}
