/**
 * CSV 필드 이스케이프 (쉼표·따옴표·개행 포함 시 RFC 4180 스타일 따옴표)
 * @param {unknown} val
 * @returns {string}
 */
export function escapeCsvField(val) {
  const s = String(val ?? '')
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** @param {Date} [d] */
export function formatDateYmdLocal(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 파일명용 (Windows 금지 문자 제거)
 * @param {unknown} name
 * @param {string} [fallback]
 */
export function safeCsvFileSlug(name, fallback = 'set') {
  const base = String(name ?? '').trim() || fallback
  const cleaned = base.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ')
  return cleaned.slice(0, 120).trim() || fallback
}

/** 단어 세트 내보내기용 고정 헤더 (UTF-8 BOM 은 호출부에서 앞에 붙임) */
export const WORD_SET_CSV_HEADER = 'word,meaning,example_sentence,image_url,day'

/**
 * @param {{
 *   word?: unknown
 *   meaning?: unknown
 *   example_sentence?: unknown
 *   image_url?: unknown
 *   day?: unknown
 * }} row
 * @returns {string} 한 줄 (개행 없음)
 */
export function wordRowToCsvLine(row) {
  const w = String(row?.word ?? '').trim()
  const m = String(row?.meaning ?? '')
  const ex = String(row?.example_sentence ?? '')
  const img = row?.image_url != null && String(row.image_url).trim() ? String(row.image_url).trim() : ''
  const day = row?.day != null && row.day !== '' ? String(row.day) : ''
  return [w, m, ex, img, day].map(escapeCsvField).join(',')
}

/**
 * 브라우저에서 UTF-8 BOM CSV 다운로드. Supabase에서 페이지 단위로 읽어 문자열 청크만 누적 (한 번에 전부 join 하지 않음).
 *
 * @param {{
 *   fetchPage: (rangeFrom: number, rangeTo: number) => Promise<{ data: object[] | null, error: Error | null }>
 *   filenameBase: string
 *   pageSize?: number
 *   onProgress?: (loaded: number, lastBatch: number) => void
 * }} opts
 * @returns {Promise<{ rowCount: number }>}
 */
export async function downloadPagedRowsAsUtf8BomCsv(opts) {
  const {
    fetchPage,
    filenameBase,
    pageSize = 500,
    onProgress,
  } = opts

  const BOM = '\uFEFF'
  const lines = [BOM + WORD_SET_CSV_HEADER + '\r\n']
  let rowCount = 0
  let from = 0

  for (;;) {
    const to = from + pageSize - 1
    const { data, error } = await fetchPage(from, to)
    if (error) throw error
    const batch = data || []
    if (batch.length === 0) break

    let chunk = ''
    for (const row of batch) {
      chunk += wordRowToCsvLine(row) + '\r\n'
      rowCount += 1
    }
    lines.push(chunk)
    onProgress?.(rowCount, batch.length)

    if (batch.length < pageSize) break
    from += pageSize
  }

  const blob = new Blob(lines, { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = `${filenameBase}.csv`
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }

  return { rowCount }
}
