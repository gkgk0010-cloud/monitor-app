/**
 * 출처 문장분석 세트 box_drill_answers.role_hint AI 일괄 채우기
 */

import { readFetchJson, sleep, friendlyHttpError } from '@/utils/fetchApiJson'
import { chunkRoleHintPayload, countRoleHintBoxes } from './roleHintChunkUtils'

const CHUNK_RETRY_ATTEMPTS = 3
const CHUNK_PAUSE_MS = 400

/**
 * @param {{ item_id: string, sentence_text: string, boxes: object[] }[]} items
 * @param {number} [attempt]
 */
async function fetchRoleHintChunk(items, attempt = 0) {
  try {
    const res = await fetch('/api/grammar-lab/fill-role-hints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    const { json, parseError, friendlyError } = await readFetchJson(res)

    if (parseError) {
      const err = friendlyError || friendlyHttpError(res.status)
      if (attempt + 1 < CHUNK_RETRY_ATTEMPTS) {
        await sleep(800 * (attempt + 1))
        return fetchRoleHintChunk(items, attempt + 1)
      }
      return { ok: false, error: err, filled: [] }
    }

    if (!res.ok) {
      const err = String(json.error || friendlyHttpError(res.status))
      if (attempt + 1 < CHUNK_RETRY_ATTEMPTS && res.status >= 500) {
        await sleep(800 * (attempt + 1))
        return fetchRoleHintChunk(items, attempt + 1)
      }
      return { ok: false, error: err, filled: [] }
    }

    return {
      ok: true,
      filled: Array.isArray(json.filled) ? json.filled : [],
      failedChunks: Number(json.failedChunks || 0),
    }
  } catch {
    if (attempt + 1 < CHUNK_RETRY_ATTEMPTS) {
      await sleep(800 * (attempt + 1))
      return fetchRoleHintChunk(items, attempt + 1)
    }
    return { ok: false, error: '네트워크 오류. 연결을 확인하고 다시 시도해 주세요.', filled: [] }
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} itemIds
 */
export async function countMissingBoxRoleHints(supabase, itemIds) {
  const ids = (itemIds || []).filter(Boolean)
  if (!ids.length) return { total: 0, missing: 0 }

  let total = 0
  let missing = 0
  const ID_CHUNK = 40
  const PAGE = 1000

  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const idChunk = ids.slice(i, i + ID_CHUNK)
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('box_drill_answers')
        .select('id, role_hint')
        .in('item_id', idChunk)
        .range(from, from + PAGE - 1)
      if (error) throw error
      const rows = data || []
      total += rows.length
      missing += rows.filter((r) => !String(r.role_hint ?? '').trim()).length
      if (rows.length < PAGE) break
    }
  }

  return { total, missing }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   teacherId: string,
 *   boxSourceSetName: string,
 *   onProgress?: (p: { stage: string, current: number, total: number } | null) => void,
 * }} opts
 */
export async function fillBoxDrillRoleHintsForSet(supabase, { teacherId, boxSourceSetName, onProgress }) {
  const setName = String(boxSourceSetName || '').trim()
  if (!teacherId || !setName) {
    return { ok: false, error: 'invalid-args', updated: 0 }
  }

  const { data: items, error: itemErr } = await supabase
    .from('sentence_training_items')
    .select('id, sentence_text')
    .eq('teacher_id', teacherId)
    .eq('set_name', setName)
    .eq('training_kind', 'box_drill')
  if (itemErr) throw itemErr

  const itemIds = (items || []).map((r) => r.id).filter(Boolean)
  if (!itemIds.length) {
    return { ok: false, error: 'no-items', updated: 0 }
  }

  const { data: boxes, error: boxErr } = await supabase
    .from('box_drill_answers')
    .select('id, item_id, box_index, start_char, end_char, role_hint')
    .in('item_id', itemIds)
    .order('box_index')
  if (boxErr) throw boxErr

  const byItem = new Map()
  for (const it of items || []) {
    byItem.set(it.id, { item_id: it.id, sentence_text: it.sentence_text, boxes: [] })
  }
  for (const b of boxes || []) {
    const row = byItem.get(b.item_id)
    if (!row) continue
    const text = String(row.sentence_text || '').slice(b.start_char, b.end_char)
    row.boxes.push({
      box_index: b.box_index,
      english: text,
      role_hint: b.role_hint,
      answer_id: b.id,
    })
  }

  const payload = [...byItem.values()]
    .map((row) => ({
      ...row,
      boxes: row.boxes.filter((b) => !String(b.role_hint ?? '').trim()),
    }))
    .filter((x) => x.boxes.length)

  const totalBoxCount = [...byItem.values()].reduce((n, r) => n + r.boxes.length, 0)
  if (!totalBoxCount) {
    return { ok: false, error: 'no-boxes', updated: 0 }
  }
  if (!payload.length) {
    return { ok: true, updated: 0, setName, skipped: true }
  }

  const chunks = chunkRoleHintPayload(payload)
  const totalToFill = countRoleHintBoxes(payload)
  let updated = 0
  let savedBoxes = 0
  let failedChunks = 0
  const chunkErrors = []

  const report = (stage, current) => {
    onProgress?.({ stage, current, total: totalToFill })
  }

  report('역할 라벨 AI 생성', 0)

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci]
    const chunkBoxCount = countRoleHintBoxes(chunk)

    report(`역할 라벨 AI (${ci + 1}/${chunks.length}묶음 · ${chunkBoxCount}칸)`, savedBoxes)

    const result = await fetchRoleHintChunk(chunk)
    if (!result.ok) {
      failedChunks += 1
      chunkErrors.push(result.error || 'AI 묶음 실패')
      await sleep(CHUNK_PAUSE_MS)
      continue
    }
    if (Number(result.failedChunks || 0) > 0) failedChunks += Number(result.failedChunks)

    for (const f of result.filled || []) {
      const parent = byItem.get(f.item_id)
      const box = parent?.boxes?.find((x) => Number(x.box_index) === Number(f.box_index))
      if (!box?.answer_id || !f.role_hint) continue
      const { error: upErr } = await supabase
        .from('box_drill_answers')
        .update({ role_hint: f.role_hint })
        .eq('id', box.answer_id)
      if (!upErr) {
        updated += 1
        savedBoxes += 1
        box.role_hint = f.role_hint
        report(`역할 라벨 저장 (${ci + 1}/${chunks.length}묶음)`, savedBoxes)
      }
    }

    if (ci + 1 < chunks.length) await sleep(CHUNK_PAUSE_MS)
  }

  if (updated === 0 && failedChunks > 0) {
    throw new Error(chunkErrors[0] || 'AI 역할 채우기에 실패했습니다. 잠시 후 다시 시도해 주세요.')
  }

  return {
    ok: true,
    updated,
    setName,
    failedChunks,
    partial: failedChunks > 0,
    totalToFill,
  }
}
