const CHUNK_SIZE = 8
const PERSIST_BATCH_PAUSE_MS = 40

/**
 * @param {{ id: string, sentence_text: string, hint_ko?: string }[]} items
 * @returns {Promise<{ filled: { id: string, hint_ko: string }[], missingIds: string[], error?: string, parseError?: boolean, httpStatus?: number }>}
 */
export async function fetchHintKoBatch(items) {
  const res = await fetch('/api/grammar-lab/fill-hints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      filled: [],
      missingIds: (items || []).map((it) => String(it.id)),
      error: json.error || 'hint_ko 자동 채우기 실패',
      parseError: json.parseError === true,
      httpStatus: res.status,
    }
  }
  return {
    filled: Array.isArray(json.filled) ? json.filled : [],
    missingIds: Array.isArray(json.missingIds) ? json.missingIds : [],
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @param {object[]} rows — WordTable 행 (example_sentence, meaning)
 * @param {(p: { current: number, total: number, log: string, saved?: number, filled?: number }) => void} [onProgress]
 * @param {{
 *   onPersistRow?: (row: object) => Promise<{ ok?: boolean, reason?: string, error?: string }>,
 *   onRecoverySaved?: (row: object) => void,
 *   onRecoveryCleared?: (rowId: string) => void,
 * }} [options]
 */
export async function fillHintKoForGrammarRows(rows, onProgress, options = {}) {
  const { onPersistRow, onRecoverySaved, onRecoveryCleared } = options
  const pending = rows.filter((r) => {
    const ex = String(r.example_sentence ?? '').trim().split('\n')[0]
    const m = String(r.meaning ?? '').trim()
    return ex && !m
  })
  if (!pending.length) {
    return { updatedRows: rows, filled: 0, saved: 0, failedIds: [], persistFailedIds: [] }
  }

  const byId = new Map(rows.map((r) => [String(r.id), { ...r }]))
  const failedIds = new Set()
  const persistFailedIds = new Set()
  let filled = 0
  let saved = 0

  for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
    const chunk = pending.slice(i, i + CHUNK_SIZE)
    const done = Math.min(i + chunk.length, pending.length)
    onProgress?.({
      current: done,
      total: pending.length,
      filled,
      saved,
      log: `${done} / ${pending.length} 처리 · AI ${filled}건 · DB 저장 ${saved}건`,
    })

    const payload = chunk.map((r) => ({
      id: String(r.id),
      sentence_text: String(r.example_sentence ?? '').trim().split('\n')[0],
      hint_ko: String(r.meaning ?? '').trim() || null,
    }))

    const { filled: batchFilled, missingIds, error } = await fetchHintKoBatch(payload)
    if (error) {
      console.error('[grammarHintFill] batch failed:', error)
      for (const r of chunk) failedIds.add(String(r.id))
      continue
    }

    for (const f of batchFilled) {
      const cur = byId.get(String(f.id))
      if (!cur || !String(f.hint_ko || '').trim()) continue
      cur.meaning = String(f.hint_ko).trim()
      filled += 1

      if (onPersistRow) {
        try {
          const result = await onPersistRow(cur)
          if (result?.ok) {
            saved += 1
            onRecoveryCleared?.(String(cur.id))
          } else {
            persistFailedIds.add(String(cur.id))
            onRecoverySaved?.(cur)
          }
        } catch (e) {
          console.error('[grammarHintFill] persist failed', cur.id, e)
          persistFailedIds.add(String(cur.id))
          onRecoverySaved?.(cur)
        }
        await sleep(PERSIST_BATCH_PAUSE_MS)
      }
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
  }

  onProgress?.({
    current: pending.length,
    total: pending.length,
    filled,
    saved,
    log: `완료 · AI ${filled}건 · DB 저장 ${saved}건`,
  })

  return {
    updatedRows: rows.map((r) => byId.get(String(r.id)) || r),
    filled,
    saved,
    failedIds: [...failedIds],
    persistFailedIds: [...persistFailedIds],
  }
}

/**
 * localStorage 등에 보관된 미저장 hint_ko 일괄 재저장
 */
export async function replayPersistHintKoRecovery(rows, recoveryEntries, onPersistRow, onProgress) {
  const byId = new Map(rows.map((r) => [String(r.id), { ...r }]))
  let saved = 0
  const failed = []
  const total = recoveryEntries.length

  for (let i = 0; i < recoveryEntries.length; i += 1) {
    const entry = recoveryEntries[i]
    const id = String(entry.id)
    const cur = byId.get(id)
    if (!cur) {
      failed.push(id)
      continue
    }
    cur.meaning = String(entry.meaning ?? '').trim()
    onProgress?.({ current: i + 1, total, log: `미저장 복구 ${i + 1} / ${total}` })
    try {
      const result = await onPersistRow(cur)
      if (result?.ok) saved += 1
      else failed.push(id)
    } catch {
      failed.push(id)
    }
    await sleep(PERSIST_BATCH_PAUSE_MS)
  }

  return {
    updatedRows: rows.map((r) => byId.get(String(r.id)) || r),
    saved,
    failedIds: failed,
  }
}
