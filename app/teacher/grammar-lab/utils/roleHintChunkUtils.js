/** role_hint AI — 한 번에 보낼 박스 수 (응답 잘림·타임아웃 방지) */
export const ROLE_HINT_MAX_BOXES_PER_CHUNK = 12
export const ROLE_HINT_MAX_ITEMS_PER_CHUNK = 4

/**
 * @param {{ boxes?: { role_hint?: string | null }[] }[]} items
 */
export function countRoleHintBoxes(items) {
  return (items || []).reduce((n, it) => n + (it.boxes?.length || 0), 0)
}

/**
 * @param {{ item_id: string, sentence_text: string, boxes: { box_index: number, english: string, role_hint?: string | null }[] }[]} items
 */
export function chunkRoleHintPayload(items) {
  const chunks = []
  let current = []
  let boxCount = 0

  for (const item of items || []) {
    const boxes = (item.boxes || []).filter((b) => !String(b.role_hint ?? '').trim())
    if (!boxes.length) continue

    const next = {
      item_id: item.item_id,
      sentence_text: item.sentence_text,
      boxes: boxes.map((b) => ({
        box_index: b.box_index,
        english: b.english,
        role_hint: null,
      })),
    }

    if (
      current.length &&
      (boxCount + next.boxes.length > ROLE_HINT_MAX_BOXES_PER_CHUNK ||
        current.length >= ROLE_HINT_MAX_ITEMS_PER_CHUNK)
    ) {
      chunks.push(current)
      current = []
      boxCount = 0
    }

    current.push(next)
    boxCount += next.boxes.length
  }

  if (current.length) chunks.push(current)
  return chunks
}
