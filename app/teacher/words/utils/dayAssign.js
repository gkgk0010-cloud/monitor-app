/** 순서 유지: 앞에서부터 총 totalDays일로 가능한 한 균등 분배 */
export function assignDaysEqual(count, totalDays) {
  if (totalDays < 1 || count === 0) return []
  const base = Math.floor(count / totalDays)
  const rem = count % totalDays
  const out = []
  for (let d = 1; d <= totalDays; d++) {
    const n = base + (d <= rem ? 1 : 0)
    for (let i = 0; i < n; i++) out.push(d)
  }
  return out
}

/** 순서 유지: 일당 perDay개씩 day 1,2,3… */
export function assignDaysChunk(count, perDay) {
  if (perDay < 1 || count === 0) return []
  const out = []
  for (let i = 0; i < count; i++) {
    out.push(Math.floor(i / perDay) + 1)
  }
  return out
}

/**
 * Day별 개수 직접 입력 — 앞에서부터 해당 Day에 순서대로 배정.
 * 합계가 validCount와 다르면 자동 보정하지 않고 { ok: false, sum } 반환.
 * @param {number} validCount 유효 행 수
 * @param {{ day: number, count: number }[]} segments Day 순서
 * @returns {{ ok: true, seq: number[] } | { ok: false, sum: number, expected: number }}
 */
export function assignDaysFromManualCounts(validCount, segments) {
  if (validCount < 1) {
    return { ok: true, seq: [] }
  }
  const segs = Array.isArray(segments) ? segments : []
  const out = []
  for (const seg of segs) {
    const d = Math.max(1, Math.floor(parseInt(String(seg?.day), 10) || 1))
    const n = Math.max(0, Math.floor(parseInt(String(seg?.count), 10) || 0))
    for (let i = 0; i < n; i++) out.push(d)
  }
  if (out.length !== validCount) {
    return { ok: false, sum: out.length, expected: validCount }
  }
  return { ok: true, seq: out }
}
