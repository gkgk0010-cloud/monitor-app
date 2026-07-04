import { GRAMMAR_LAB_CHUNK_SIZE } from './grammarLabBatchSave'

/** PostgREST .in() URL 길이·응답 row 상한(1000) 회피 */
const BOX_ANSWER_PAGE_SIZE = 1000

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} itemIds
 * @returns {Promise<{ item_id: string }[]>}
 */
async function fetchBoxAnswerRowsBatched(supabase, itemIds) {
  const ids = [...new Set(itemIds.filter(Boolean))]
  if (!ids.length) return []

  const rows = []
  for (let i = 0; i < ids.length; i += GRAMMAR_LAB_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + GRAMMAR_LAB_CHUNK_SIZE)
    let offset = 0
    while (true) {
      const { data, error } = await supabase
        .from('box_drill_answers')
        .select('item_id')
        .in('item_id', chunk)
        .range(offset, offset + BOX_ANSWER_PAGE_SIZE - 1)
      if (error) throw error
      if (!data?.length) break
      rows.push(...data)
      if (data.length < BOX_ANSWER_PAGE_SIZE) break
      offset += BOX_ANSWER_PAGE_SIZE
    }
  }
  return rows
}

/**
 * 박스 정답이 1개 이상 있는 item_id 집합
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} itemIds
 * @returns {Promise<Set<string>>}
 */
export async function fetchItemIdsWithBoxAnswers(supabase, itemIds) {
  try {
    const rows = await fetchBoxAnswerRowsBatched(supabase, itemIds)
    return new Set(rows.map((r) => r.item_id))
  } catch (err) {
    console.warn('[boxDrillQuery] fetchItemIdsWithBoxAnswers failed:', err?.message || err)
    return new Set()
  }
}

/**
 * item_id별 box_drill_answers 행 수
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} itemIds
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchBoxCountsByItemId(supabase, itemIds) {
  const counts = {}
  try {
    const rows = await fetchBoxAnswerRowsBatched(supabase, itemIds)
    for (const r of rows) {
      counts[r.item_id] = (counts[r.item_id] || 0) + 1
    }
  } catch (err) {
    console.warn('[boxDrillQuery] fetchBoxCountsByItemId failed:', err?.message || err)
  }
  return counts
}

/**
 * item_id별 box_drill_answers 좌표 (export용)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} itemIds
 * @returns {Promise<Record<string, { box_index: number, start_char: number, end_char: number }[]>>}
 */
export async function fetchBoxDrillAnswersMap(supabase, itemIds) {
  const ids = [...new Set(itemIds.filter(Boolean))]
  const map = {}
  if (!ids.length) return map

  for (let i = 0; i < ids.length; i += GRAMMAR_LAB_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + GRAMMAR_LAB_CHUNK_SIZE)
    let offset = 0
    while (true) {
      const { data, error } = await supabase
        .from('box_drill_answers')
        .select('item_id, box_index, start_char, end_char')
        .in('item_id', chunk)
        .order('item_id', { ascending: true })
        .order('box_index', { ascending: true })
        .range(offset, offset + BOX_ANSWER_PAGE_SIZE - 1)
      if (error) throw error
      if (!data?.length) break
      for (const row of data) {
        if (!map[row.item_id]) map[row.item_id] = []
        map[row.item_id].push({
          box_index: row.box_index,
          start_char: row.start_char,
          end_char: row.end_char,
        })
      }
      if (data.length < BOX_ANSWER_PAGE_SIZE) break
      offset += BOX_ANSWER_PAGE_SIZE
    }
  }
  return map
}
