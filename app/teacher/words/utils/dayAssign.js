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
