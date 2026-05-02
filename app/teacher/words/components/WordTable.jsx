'use client'

import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'

/**
 * 완전 비제어 입력: 타이핑 시 setState 없음 → 자식 리렌더·리컨실 비용 없음.
 * 외부에서 값이 바뀌면(저장·AI 등) 포커스 없을 때만 DOM에 반영.
 */
function DraftTextInput({
  rowId,
  field,
  value,
  cellDraftsRef,
  onCommit,
  style,
  placeholder,
  type = 'text',
  onKeyDown,
  title,
  dataRowId,
  'aria-label': ariaLabel,
}) {
  const inputRef = useRef(null)
  const key = String(rowId)
  const focusedRef = useRef(false)

  useEffect(() => {
    const el = inputRef.current
    if (!el || focusedRef.current) return
    const next = String(value ?? '')
    if (el.value !== next) el.value = next
  }, [value, rowId, field])

  return (
    <input
      ref={inputRef}
      type={type}
      data-row-id={dataRowId != null ? String(dataRowId) : undefined}
      defaultValue={String(value ?? '')}
      placeholder={placeholder}
      title={title}
      aria-label={ariaLabel}
      onFocus={() => {
        focusedRef.current = true
      }}
      onInput={(e) => {
        const x = e.target.value
        const d = cellDraftsRef.current[key] || {}
        cellDraftsRef.current[key] = { ...d, [field]: x }
      }}
      onKeyDown={onKeyDown}
      onBlur={() => {
        focusedRef.current = false
        const d = cellDraftsRef.current[key]
        if (d) {
          delete d[field]
          if (Object.keys(d).length === 0) delete cellDraftsRef.current[key]
        }
        const el = inputRef.current
        onCommit(key, field, el ? el.value : '')
      }}
      style={style}
    />
  )
}

function DraftDayInput({ rowId, value, cellDraftsRef, onCommit, style }) {
  const inputRef = useRef(null)
  const key = String(rowId)
  const focusedRef = useRef(false)

  useEffect(() => {
    const el = inputRef.current
    if (!el || focusedRef.current) return
    const next = String(value ?? 1)
    if (el.value !== next) el.value = next
  }, [value, rowId])

  return (
    <input
      ref={inputRef}
      type="number"
      min={1}
      defaultValue={String(value ?? 1)}
      onFocus={() => {
        focusedRef.current = true
      }}
      onInput={(e) => {
        const x = e.target.value
        const d = cellDraftsRef.current[key] || {}
        cellDraftsRef.current[key] = { ...d, day: x }
      }}
      onBlur={() => {
        focusedRef.current = false
        const d = cellDraftsRef.current[key]
        if (d) {
          delete d.day
          if (Object.keys(d).length === 0) delete cellDraftsRef.current[key]
        }
        const el = inputRef.current
        const n = parseInt(el?.value ?? '1', 10) || 1
        onCommit(key, 'day', n)
      }}
      style={style}
    />
  )
}

/**
 * @param {{
 *   rows: Array<Record<string, unknown>>
 *   onRowsChange:
 *     | ((rows: Array<Record<string, unknown>>) => void)
 *     | ((updater: (prev: Array<Record<string, unknown>>) => Array<Record<string, unknown>>) => void)
 *   selectedIds: Set<string>
 *   onSelectedIdsChange: (ids: Set<string>) => void
 *   onRowCommit?: (row: Record<string, unknown>) => void | Promise<void>
 *   showSetNameColumn?: boolean
 *   showDayColumn?: boolean
 *   dayReadOnly?: boolean
 *   showImageColumn?: boolean
 *   showDeleteColumn?: boolean
 *   onRowDelete?: (row: Record<string, unknown>) => void | Promise<void>
 *   showRowNumbers?: boolean
 *   rowGroupMode?: 'none' | 'day' | 'chunk10' | 'day_chunk'
 *   chunkSize?: number
 *   columnPreset?: 'classic' | 'word' | 'sentence' | 'image'
 *   getRowBackground?: (row: Record<string, unknown>) => string | undefined
 *   highlightRowIds?: Set<string> | string[]
 *   scrollContainer?: 'embedded' | 'window'
 *   stickyHeaderOffsetPx?: number
 * }} props
 */
function WordTable({
  rows,
  onRowsChange,
  selectedIds,
  onSelectedIdsChange,
  onRowCommit,
  showSetNameColumn = true,
  showDayColumn = true,
  dayReadOnly = false,
  showImageColumn = true,
  showDeleteColumn = false,
  onRowDelete,
  showRowNumbers = true,
  rowGroupMode = 'none',
  chunkSize = 10,
  columnPreset = 'classic',
  getRowBackground,
  highlightRowIds,
  scrollContainer = 'embedded',
  stickyHeaderOffsetPx = 0,
}) {
  const isSentence = columnPreset === 'sentence'
  const isImage = columnPreset === 'image'
  const isTypedWord = columnPreset === 'word'

  /** 체크 · (#) · 데이터 컬럼들 · (day) · 저장 · 삭제 — 헤더/행 동일 */
  const wordTableGrid = useMemo(() => {
    const parts = ['48px']
    if (showRowNumbers) parts.push('50px')
    if (isSentence) {
      parts.push('minmax(200px, 1.4fr)', '200px', '150px')
      if (showDayColumn) parts.push('60px')
      if (onRowCommit) parts.push('76px')
      if (showDeleteColumn && onRowDelete) parts.push('70px')
      return parts.join(' ')
    }
    if (isImage) {
      parts.push('150px', '200px', '150px')
      if (showDayColumn) parts.push('60px')
      if (onRowCommit) parts.push('76px')
      if (showDeleteColumn && onRowDelete) parts.push('70px')
      return parts.join(' ')
    }
    if (isTypedWord) {
      parts.push('150px', '200px', '150px', 'minmax(160px, 1fr)')
      if (showDayColumn) parts.push('60px')
      if (onRowCommit) parts.push('76px')
      if (showDeleteColumn && onRowDelete) parts.push('70px')
      return parts.join(' ')
    }
    parts.push('150px', '200px')
    if (showImageColumn) parts.push('150px')
    parts.push('minmax(160px, 1fr)')
    if (showSetNameColumn && !isTypedWord) parts.push('150px')
    if (showDayColumn) parts.push('60px')
    if (onRowCommit) parts.push('76px')
    if (showDeleteColumn && onRowDelete) parts.push('70px')
    return parts.join(' ')
  }, [
    showRowNumbers,
    showImageColumn,
    showSetNameColumn,
    showDayColumn,
    showDeleteColumn,
    onRowDelete,
    onRowCommit,
    isSentence,
    isImage,
    isTypedWord,
  ])

  const [busyExampleId, setBusyExampleId] = useState(null)
  const [imagePicker, setImagePicker] = useState(null)
  const [imageLoadingId, setImageLoadingId] = useState(null)

  const highlightIdSet = useMemo(() => {
    if (highlightRowIds == null) return null
    if (highlightRowIds instanceof Set) return highlightRowIds
    const s = new Set()
    for (const x of highlightRowIds) s.add(String(x))
    return s
  }, [highlightRowIds])

  /** 비동기(이미지 검색 등) 직후 클로저의 rows 가 옛값일 수 있어, 렌더마다 동기화 */
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  /** blur 전 입력 중인 칸 — 예문 AI·이미지 검색이 최신 타이핑을 보도록 */
  const cellDraftsRef = useRef({})

  const getEffectiveRow = useCallback((id) => {
    const sid = String(id)
    const base = rowsRef.current.find((r) => String(r.id) === sid)
    if (!base) return null
    const d = cellDraftsRef.current[sid]
    if (!d) return base
    const o = { ...base, ...d }
    if (d.day != null && d.day !== '') {
      const p = parseInt(String(d.day), 10)
      if (!Number.isNaN(p)) o.day = p
    }
    return o
  }, [])

  const allIds = rows.map((r) => String(r.id))
  const allSelected = rows.length > 0 && allIds.every((id) => selectedIds.has(id))

  const toggleAll = () => {
    if (allSelected) {
      onSelectedIdsChange(new Set())
    } else {
      onSelectedIdsChange(new Set(allIds))
    }
  }

  const toggleOne = (id) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectedIdsChange(next)
  }

  const updateField = useCallback((id, field, value) => {
    onRowsChange((prev) =>
      prev.map((r) => (String(r.id) === String(id) ? { ...r, [field]: value } : r)),
    )
  }, [onRowsChange])

  /** 연속 updateField 는 stale rows 로 서로 덮어쓸 수 있음 → 한 번에 병합 */
  const patchRow = useCallback((id, patch) => {
    onRowsChange((prev) =>
      prev.map((r) => (String(r.id) === String(id) ? { ...r, ...patch } : r)),
    )
  }, [onRowsChange])

  /** 블러 시 로컬 상태만 반영 — DB 저장은 행별 [저장] 버튼 */
  const syncDraftField = useCallback(
    (id, field, val) => {
      updateField(id, field, val)
    },
    [updateField],
  )

  const [savingId, setSavingId] = useState(null)

  const handleRowSaveClick = useCallback(
    async (id) => {
      const row = getEffectiveRow(id)
      if (!row || !onRowCommit) return
      setSavingId(String(id))
      try {
        await onRowCommit(row)
      } finally {
        setSavingId((cur) => (cur === String(id) ? null : cur))
      }
    },
    [getEffectiveRow, onRowCommit],
  )

  const [collapsedSections, setCollapsedSections] = useState(() => new Set())

  const indexById = useMemo(() => {
    const m = new Map()
    rows.forEach((row, i) => m.set(String(row.id), i + 1))
    return m
  }, [rows])

  const sections = useMemo(() => {
    const r = rows
    if (r.length === 0) return []
    const cs = Math.max(1, chunkSize)
    if (rowGroupMode === 'none') return [{ key: 'all', label: '', rows: r }]
    if (rowGroupMode === 'chunk10') {
      const out = []
      for (let i = 0; i < r.length; i += cs) {
        const slice = r.slice(i, i + cs)
        out.push({
          key: `c-${i}`,
          label: `${i + 1}–${i + slice.length}번`,
          rows: slice,
        })
      }
      return out
    }
    if (rowGroupMode === 'day') {
      const byDay = new Map()
      for (const row of r) {
        const d = row.day != null ? Number(row.day) : 0
        if (!byDay.has(d)) byDay.set(d, [])
        byDay.get(d).push(row)
      }
      const sortedDays = [...byDay.keys()].sort((a, b) => a - b)
      return sortedDays.map((d) => ({
        key: `day-${d}`,
        label: `Day ${d}`,
        rows: byDay.get(d),
      }))
    }
    if (rowGroupMode === 'day_chunk') {
      const byDay = new Map()
      for (const row of r) {
        const d = row.day != null ? Number(row.day) : 0
        if (!byDay.has(d)) byDay.set(d, [])
        byDay.get(d).push(row)
      }
      const sortedDays = [...byDay.keys()].sort((a, b) => a - b)
      const out = []
      for (const d of sortedDays) {
        const list = byDay.get(d)
        for (let i = 0; i < list.length; i += cs) {
          const slice = list.slice(i, i + cs)
          out.push({
            key: `d${d}-c${i}`,
            label: `Day ${d} · ${i + 1}–${i + slice.length}번`,
            rows: slice,
          })
        }
      }
      return out
    }
    return [{ key: 'all', label: '', rows: r }]
  }, [rows, rowGroupMode, chunkSize])

  const toggleSection = (key) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    setCollapsedSections(new Set())
  }, [rowGroupMode])

  /** 섹션 헤더 + 데이터 행을 한 줄로 펼쳐 가상 스크롤 */
  const flatItems = useMemo(() => {
    const out = []
    for (const sec of sections) {
      if (sec.label) {
        out.push({ type: 'section', sec })
      }
      const hideBody = Boolean(sec.label) && collapsedSections.has(sec.key)
      if (hideBody) continue
      for (const row of sec.rows) {
        out.push({ type: 'row', row })
      }
    }
    return out
  }, [sections, collapsedSections])

  const scrollParentRef = useRef(null)

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () =>
      scrollContainer === 'window' && typeof document !== 'undefined'
        ? document.documentElement
        : scrollParentRef.current,
    estimateSize: (index) => (flatItems[index]?.type === 'section' ? 46 : 96),
    overscan: scrollContainer === 'window' ? 2500 : 20,
  })

  const suggestExample = useCallback(
    async (id) => {
      const row = getEffectiveRow(id)
      if (!row) return
      const ex0 = String(row.example_sentence || '').trim()
      let word = String(row.word || '').trim()
      const meaning = String(row.meaning || '').trim()
      if (isSentence) {
        if (!ex0) {
          alert('예문을 먼저 입력하세요.')
          return
        }
        if (!word) word = ex0.split(/\s+/).filter(Boolean)[0] || 'a'
      } else if (!word) {
        alert('영단어를 먼저 입력하세요.')
        return
      }
      setBusyExampleId(String(id))
      try {
        const res = await fetch('/api/suggest-example', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word, meaning: meaning || undefined }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || '예문 요청 실패')
        const ex = String(json.example_sentence || '').trim()
        if (!ex) throw new Error('예문을 받지 못했습니다.')
        const sid = String(id)
        const dr = cellDraftsRef.current[sid]
        if (dr) {
          delete dr.example_sentence
          if (Object.keys(dr).length === 0) delete cellDraftsRef.current[sid]
        }
        updateField(id, 'example_sentence', ex)
        requestAnimationFrame(() => {
          try {
            const el = document.querySelector(`input[data-row-id="${sid}"]`)
            if (el) el.value = ex
          } catch (_) {}
        })
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e))
      } finally {
        setBusyExampleId(null)
      }
    },
    [getEffectiveRow, updateField, isSentence],
  )

  const handleExampleKeyDown = useCallback(
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        const tid = e.currentTarget.getAttribute('data-row-id')
        if (tid) void suggestExample(tid)
      }
    },
    [suggestExample],
  )

  const openImagePicker = async (id) => {
    const row = getEffectiveRow(id)
    if (!row) return
    const q =
      String(row.word || '').trim() ||
      String(row.meaning || '').trim() ||
      String(row.example_sentence || '').trim().slice(0, 80)
    if (!q) {
      alert(isSentence ? '뜻·예문 중 하나를 입력한 뒤 검색해 주세요.' : '영단어를 먼저 입력하세요.')
      return
    }
    setImageLoadingId(String(id))
    setImagePicker({ id: String(id), photos: [] })
    try {
      const res = await fetch(`/api/unsplash?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '이미지 검색 실패')
      const photos = json.photos || []
      if (photos.length === 0) {
        alert('이미지를 찾지 못했습니다. 다른 영단어로 시도해 보세요.')
        setImagePicker(null)
        return
      }
      setImagePicker({ id: String(id), photos })
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
      setImagePicker(null)
    } finally {
      setImageLoadingId(null)
    }
  }

  const pickImage = (id, photo) => {
    const url = photo.regular || photo.thumb
    patchRow(id, { image_url: url, image_source: 'unsplash' })
    setImagePicker(null)
  }

  const MAX_IMG_DATA_URL = 1_400_000

  const applyImageUrl = (id, url, source) => {
    const s = String(url || '').trim()
    if (!s) return
    if (s.startsWith('data:') && s.length > MAX_IMG_DATA_URL) {
      alert('이미지가 너무 큽니다. 더 작은 파일이나 URL을 사용해 주세요.')
      return
    }
    patchRow(id, { image_url: s, image_source: source })
  }

  const onImageDrop = (id, e) => {
    e.preventDefault()
    const f = e.dataTransfer?.files?.[0]
    if (!f || !f.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => applyImageUrl(id, reader.result, 'upload')
    reader.readAsDataURL(f)
  }

  const onImagePaste = (id, e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of items) {
      if (it.type.startsWith('image/')) {
        e.preventDefault()
        const f = it.getAsFile()
        if (!f) continue
        const reader = new FileReader()
        reader.onload = () => applyImageUrl(id, reader.result, 'paste')
        reader.readAsDataURL(f)
        return
      }
    }
  }

  /** image 칼럼 UI (classic / sentence / image 프리셋 공통) */
  function renderImageBlock(id, row) {
    const img = row.image_url ? String(row.image_url).trim() : ''
    return (
      <div role="gridcell" style={{ padding: 8, verticalAlign: 'top', minWidth: 0 }}>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => onImageDrop(id, e)}
          onPaste={(e) => onImagePaste(id, e)}
          tabIndex={0}
          title="이미지 파일 드롭 또는 클립보드에서 이미지 붙여넣기"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 6,
            borderRadius: RADIUS.sm,
            border: `1px dashed ${COLORS.border}`,
            background: COLORS.bg,
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {img ? (
              <img
                src={img}
                alt=""
                style={{
                  width: 40,
                  height: 40,
                  objectFit: 'cover',
                  borderRadius: RADIUS.sm,
                  border: `1px solid ${COLORS.border}`,
                }}
              />
            ) : (
              <span style={{ fontSize: 12, color: COLORS.textHint }}>—</span>
            )}
            <button
              type="button"
              title="Unsplash에서 이미지 찾기"
              onClick={() => void openImagePicker(id)}
              disabled={imageLoadingId === id}
              style={{
                padding: '4px 8px',
                fontSize: 12,
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.primary}`,
                background: COLORS.primarySoft,
                color: COLORS.accentText,
                cursor: imageLoadingId === id ? 'wait' : 'pointer',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {imageLoadingId === id ? '검색…' : '검색'}
            </button>
          </div>
          <input
            type="url"
            name={`imgurl-${id}`}
            placeholder="https://… URL"
            defaultValue=""
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v) applyImageUrl(id, v, 'link')
              e.target.value = ''
            }}
            style={{
              fontSize: 11,
              padding: '4px 6px',
              borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.border}`,
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
          <span style={{ fontSize: 10, color: COLORS.textHint }}>드롭·붙여넣기·URL</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="word-table-wrap"
      style={{
        borderRadius: RADIUS.md,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
        boxShadow: SHADOW.card,
        paddingBottom: 4,
      }}
    >
      <div
        ref={scrollContainer === 'embedded' ? scrollParentRef : undefined}
        style={{
          ...(scrollContainer === 'embedded'
            ? {
                maxHeight: 'min(72vh, calc(100vh - 240px))',
                overflow: 'auto',
              }
            : { overflow: 'visible' }),
          width: '100%',
        }}
      >
        <div
          style={{
            width: '100%',
            minWidth: 1120,
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        >
          <div
            role="row"
            style={{
              display: 'grid',
              gridTemplateColumns: wordTableGrid,
              position: 'sticky',
              top: scrollContainer === 'window' ? stickyHeaderOffsetPx : 0,
              zIndex: 54,
              background: COLORS.primarySoft,
              borderBottom: `1px solid ${COLORS.border}`,
              textAlign: 'left',
              alignItems: 'center',
            }}
          >
            <div role="columnheader" style={{ padding: '10px 8px' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="전체 선택"
              />
            </div>
            {showRowNumbers ? (
              <div
                role="columnheader"
                style={{ padding: '10px 6px', color: COLORS.accentText, textAlign: 'right', fontWeight: 700 }}
              >
                #
              </div>
            ) : null}
            {isSentence ? (
              <>
                <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                  example_sentence
                </div>
                <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                  meaning
                </div>
                <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                  image
                </div>
              </>
            ) : isImage ? (
              <>
                <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                  word
                </div>
                <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                  meaning
                </div>
                <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                  image
                </div>
              </>
            ) : isTypedWord ? (
              <>
                <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                  word
                </div>
                <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                  meaning
                </div>
                <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                  image
                </div>
                <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                  example_sentence
                </div>
              </>
            ) : (
              <>
                <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                  word
                </div>
                <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                  meaning
                </div>
                {showImageColumn ? (
                  <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                    image
                  </div>
                ) : null}
                <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                  example_sentence
                </div>
                {showSetNameColumn && !isTypedWord ? (
                  <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                    set_name
                  </div>
                ) : null}
              </>
            )}
            {showDayColumn ? (
              <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                day
              </div>
            ) : null}
            {onRowCommit ? (
              <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                저장
              </div>
            ) : null}
            {showDeleteColumn && onRowDelete ? (
              <div role="columnheader" style={{ padding: '10px 8px', color: COLORS.accentText, fontWeight: 700 }}>
                삭제
              </div>
            ) : null}
          </div>

          <div
            style={{
              position: 'relative',
              width: '100%',
              height: rowVirtualizer.getTotalSize(),
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = flatItems[virtualRow.index]
              if (!item) return null
              const rowGridBase = {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: wordTableGrid,
                boxSizing: 'border-box',
                zIndex: 0,
              }
              if (item.type === 'section') {
                const sec = item.sec
                return (
                  <div
                    key={`sec-${sec.key}`}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={rowGridBase}
                  >
                    <div
                      style={{
                        gridColumn: '1 / -1',
                        padding: '8px 10px',
                        borderTop: `1px solid ${COLORS.border}`,
                        background: COLORS.bg,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSection(sec.key)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 700,
                          color: COLORS.accentText,
                          padding: '2px 0',
                        }}
                      >
                        {collapsedSections.has(sec.key) ? '▶' : '▼'} {sec.label}{' '}
                        <span style={{ fontWeight: 500, color: COLORS.textSecondary }}>({sec.rows.length}개)</span>
                      </button>
                    </div>
                  </div>
                )
              }
              const row = item.row
              const id = String(row.id)
              const meaning = row.meaning != null ? String(row.meaning) : ''
              const example = row.example_sentence != null ? String(row.example_sentence) : ''
              const meaningEmpty = !meaning.trim()
              const exampleEmpty = !example.trim()
              const img = row.image_url ? String(row.image_url).trim() : ''
              const rowNum = indexById.get(id) ?? 0
              const tint = getRowBackground?.(row)
              const isMeaningHighlight = highlightIdSet?.has(id) === true
              const rowBg = isMeaningHighlight
                ? 'rgba(254, 226, 226, 0.92)'
                : (tint ?? (selectedIds.has(id) ? COLORS.successBg : COLORS.surface))

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  role="row"
                  style={{
                    ...rowGridBase,
                    borderTop: `1px solid ${COLORS.border}`,
                    background: rowBg,
                    alignItems: 'start',
                    boxShadow: isMeaningHighlight ? 'inset 0 0 0 2px #ef4444' : undefined,
                  }}
                >
                  <div role="gridcell" style={{ padding: 8, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(id)}
                      onChange={() => toggleOne(id)}
                      aria-label={`선택 ${row.word}`}
                    />
                  </div>
                  {showRowNumbers ? (
                    <div
                      role="gridcell"
                      style={{
                        padding: '8px 6px',
                        textAlign: 'right',
                        color: COLORS.textSecondary,
                        fontSize: 13,
                        fontVariantNumeric: 'tabular-nums',
                        minWidth: 0,
                      }}
                    >
                      {rowNum}
                    </div>
                  ) : null}
                  {isSentence ? (
                    <>
                      <div
                        role="gridcell"
                        style={{
                          padding: 8,
                          color: exampleEmpty ? COLORS.textHint : COLORS.textPrimary,
                          verticalAlign: 'middle',
                          minWidth: 0,
                        }}
                      >
                        <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
                          <DraftTextInput
                            rowId={id}
                            field="example_sentence"
                            value={example}
                            cellDraftsRef={cellDraftsRef}
                            onCommit={syncDraftField}
                            dataRowId={id}
                            onKeyDown={handleExampleKeyDown}
                            placeholder="예문 — 돋보기로 AI"
                            style={{
                              boxSizing: 'border-box',
                              width: '100%',
                              minWidth: 0,
                              padding: '6px 40px 6px 8px',
                              borderRadius: RADIUS.sm,
                              border: `1px solid ${COLORS.border}`,
                              fontStyle: exampleEmpty ? 'italic' : 'normal',
                            }}
                            title="Ctrl+S: 예문 AI 제안"
                          />
                          <button
                            type="button"
                            title="예문 AI 제안 (Ctrl+S)"
                            aria-label="예문 찾기"
                            disabled={busyExampleId === id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void suggestExample(id)}
                            style={{
                              position: 'absolute',
                              right: 4,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: 32,
                              height: 30,
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: 'none',
                              borderRadius: RADIUS.sm,
                              background: busyExampleId === id ? COLORS.border : COLORS.primarySoft,
                              cursor: busyExampleId === id ? 'wait' : 'pointer',
                            }}
                          >
                            {busyExampleId === id ? (
                              <span style={{ fontSize: 14, color: COLORS.textSecondary }}>…</span>
                            ) : (
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={COLORS.accentText}
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <circle cx="11" cy="11" r="7" />
                                <path d="M20 20 16.65 16.65" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                      <div
                        role="gridcell"
                        style={{ padding: 8, background: meaningEmpty ? COLORS.warningBg : undefined, minWidth: 0 }}
                      >
                        <DraftTextInput
                          rowId={id}
                          field="meaning"
                          value={meaning}
                          cellDraftsRef={cellDraftsRef}
                          onCommit={syncDraftField}
                          placeholder={meaningEmpty ? '뜻 입력' : ''}
                          style={{
                            width: '100%',
                            minWidth: 0,
                            maxWidth: '100%',
                            padding: '6px 8px',
                            borderRadius: RADIUS.sm,
                            border: `1px solid ${meaningEmpty ? COLORS.warning : COLORS.border}`,
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      {renderImageBlock(id, row)}
                    </>
                  ) : isImage ? (
                    <>
                      <div role="gridcell" style={{ padding: 8, minWidth: 0 }}>
                        <DraftTextInput
                          rowId={id}
                          field="word"
                          value={row.word != null ? String(row.word) : ''}
                          cellDraftsRef={cellDraftsRef}
                          onCommit={syncDraftField}
                          style={{
                            width: '100%',
                            minWidth: 0,
                            maxWidth: '100%',
                            padding: '6px 8px',
                            borderRadius: RADIUS.sm,
                            border: `1px solid ${COLORS.border}`,
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div
                        role="gridcell"
                        style={{ padding: 8, background: meaningEmpty ? COLORS.warningBg : undefined, minWidth: 0 }}
                      >
                        <DraftTextInput
                          rowId={id}
                          field="meaning"
                          value={meaning}
                          cellDraftsRef={cellDraftsRef}
                          onCommit={syncDraftField}
                          placeholder={meaningEmpty ? '뜻 입력' : ''}
                          style={{
                            width: '100%',
                            minWidth: 0,
                            maxWidth: '100%',
                            padding: '6px 8px',
                            borderRadius: RADIUS.sm,
                            border: `1px solid ${meaningEmpty ? COLORS.warning : COLORS.border}`,
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      {renderImageBlock(id, row)}
                    </>
                  ) : isTypedWord ? (
                    <>
                      <div role="gridcell" style={{ padding: 8, minWidth: 0 }}>
                        <DraftTextInput
                          rowId={id}
                          field="word"
                          value={row.word != null ? String(row.word) : ''}
                          cellDraftsRef={cellDraftsRef}
                          onCommit={syncDraftField}
                          style={{
                            width: '100%',
                            minWidth: 0,
                            maxWidth: '100%',
                            padding: '6px 8px',
                            borderRadius: RADIUS.sm,
                            border: `1px solid ${COLORS.border}`,
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div
                        role="gridcell"
                        style={{ padding: 8, background: meaningEmpty ? COLORS.warningBg : undefined, minWidth: 0 }}
                      >
                        <DraftTextInput
                          rowId={id}
                          field="meaning"
                          value={meaning}
                          cellDraftsRef={cellDraftsRef}
                          onCommit={syncDraftField}
                          placeholder={meaningEmpty ? '뜻 입력' : ''}
                          style={{
                            width: '100%',
                            minWidth: 0,
                            maxWidth: '100%',
                            padding: '6px 8px',
                            borderRadius: RADIUS.sm,
                            border: `1px solid ${meaningEmpty ? COLORS.warning : COLORS.border}`,
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      {renderImageBlock(id, row)}
                      <div
                        role="gridcell"
                        style={{
                          padding: 8,
                          color: exampleEmpty ? COLORS.textHint : COLORS.textPrimary,
                          verticalAlign: 'middle',
                          minWidth: 0,
                        }}
                      >
                        <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
                          <DraftTextInput
                            rowId={id}
                            field="example_sentence"
                            value={example}
                            cellDraftsRef={cellDraftsRef}
                            onCommit={syncDraftField}
                            dataRowId={id}
                            onKeyDown={handleExampleKeyDown}
                            placeholder="예문 (선택) — 오른쪽 돋보기로 AI 생성"
                            style={{
                              boxSizing: 'border-box',
                              width: '100%',
                              minWidth: 0,
                              padding: '6px 40px 6px 8px',
                              borderRadius: RADIUS.sm,
                              border: `1px solid ${COLORS.border}`,
                              fontStyle: exampleEmpty ? 'italic' : 'normal',
                            }}
                            title="Ctrl+S: 예문 AI 제안"
                          />
                          <button
                            type="button"
                            title="예문 AI 제안 (Ctrl+S)"
                            aria-label="예문 찾기"
                            disabled={busyExampleId === id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void suggestExample(id)}
                            style={{
                              position: 'absolute',
                              right: 4,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: 32,
                              height: 30,
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: 'none',
                              borderRadius: RADIUS.sm,
                              background: busyExampleId === id ? COLORS.border : COLORS.primarySoft,
                              cursor: busyExampleId === id ? 'wait' : 'pointer',
                            }}
                          >
                            {busyExampleId === id ? (
                              <span style={{ fontSize: 14, color: COLORS.textSecondary }}>…</span>
                            ) : (
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={COLORS.accentText}
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <circle cx="11" cy="11" r="7" />
                                <path d="M20 20 16.65 16.65" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div role="gridcell" style={{ padding: 8, minWidth: 0 }}>
                        <DraftTextInput
                          rowId={id}
                          field="word"
                          value={row.word != null ? String(row.word) : ''}
                          cellDraftsRef={cellDraftsRef}
                          onCommit={syncDraftField}
                          style={{
                            width: '100%',
                            minWidth: 0,
                            maxWidth: '100%',
                            padding: '6px 8px',
                            borderRadius: RADIUS.sm,
                            border: `1px solid ${COLORS.border}`,
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div
                        role="gridcell"
                        style={{ padding: 8, background: meaningEmpty ? COLORS.warningBg : undefined, minWidth: 0 }}
                      >
                        <DraftTextInput
                          rowId={id}
                          field="meaning"
                          value={meaning}
                          cellDraftsRef={cellDraftsRef}
                          onCommit={syncDraftField}
                          placeholder={meaningEmpty ? '뜻 입력' : ''}
                          style={{
                            width: '100%',
                            minWidth: 0,
                            maxWidth: '100%',
                            padding: '6px 8px',
                            borderRadius: RADIUS.sm,
                            border: `1px solid ${meaningEmpty ? COLORS.warning : COLORS.border}`,
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      {showImageColumn ? renderImageBlock(id, row) : null}
                      <div
                        role="gridcell"
                        style={{
                          padding: 8,
                          color: exampleEmpty ? COLORS.textHint : COLORS.textPrimary,
                          verticalAlign: 'middle',
                          minWidth: 0,
                        }}
                      >
                        <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
                          <DraftTextInput
                            rowId={id}
                            field="example_sentence"
                            value={example}
                            cellDraftsRef={cellDraftsRef}
                            onCommit={syncDraftField}
                            dataRowId={id}
                            onKeyDown={handleExampleKeyDown}
                            placeholder="예문 (선택) — 오른쪽 돋보기로 AI 생성"
                            style={{
                              boxSizing: 'border-box',
                              width: '100%',
                              minWidth: 0,
                              padding: '6px 40px 6px 8px',
                              borderRadius: RADIUS.sm,
                              border: `1px solid ${COLORS.border}`,
                              fontStyle: exampleEmpty ? 'italic' : 'normal',
                            }}
                            title="Ctrl+S: 예문 AI 제안"
                          />
                          <button
                            type="button"
                            title="예문 AI 제안 (Ctrl+S)"
                            aria-label="예문 찾기"
                            disabled={busyExampleId === id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void suggestExample(id)}
                            style={{
                              position: 'absolute',
                              right: 4,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: 32,
                              height: 30,
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: 'none',
                              borderRadius: RADIUS.sm,
                              background: busyExampleId === id ? COLORS.border : COLORS.primarySoft,
                              cursor: busyExampleId === id ? 'wait' : 'pointer',
                            }}
                          >
                            {busyExampleId === id ? (
                              <span style={{ fontSize: 14, color: COLORS.textSecondary }}>…</span>
                            ) : (
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={COLORS.accentText}
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <circle cx="11" cy="11" r="7" />
                                <path d="M20 20 16.65 16.65" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                      {showSetNameColumn && !isTypedWord ? (
                        <div role="gridcell" style={{ padding: 8, minWidth: 0 }}>
                          <DraftTextInput
                            rowId={id}
                            field="set_name"
                            value={row.set_name != null ? String(row.set_name) : ''}
                            cellDraftsRef={cellDraftsRef}
                            onCommit={syncDraftField}
                            style={{
                              width: '100%',
                              minWidth: 0,
                              maxWidth: '100%',
                              padding: '6px 8px',
                              borderRadius: RADIUS.sm,
                              border: `1px solid ${COLORS.border}`,
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      ) : null}
                    </>
                  )}
                  {showDayColumn ? (
                    <div role="gridcell" style={{ padding: 8, minWidth: 0 }}>
                      {dayReadOnly ? (
                        <span style={{ fontWeight: 600, color: COLORS.accentText }}>
                          {row.day != null ? Number(row.day) : '—'}
                        </span>
                      ) : (
                        <DraftDayInput
                          rowId={id}
                          value={row.day != null ? Number(row.day) : 1}
                          cellDraftsRef={cellDraftsRef}
                          onCommit={syncDraftField}
                          style={{
                            width: '100%',
                            maxWidth: 60,
                            padding: '6px 8px',
                            borderRadius: RADIUS.sm,
                            border: `1px solid ${COLORS.border}`,
                            boxSizing: 'border-box',
                          }}
                        />
                      )}
                    </div>
                  ) : null}
                  {onRowCommit ? (
                    <div
                      role="gridcell"
                      style={{
                        padding: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 0,
                      }}
                    >
                      <button
                        type="button"
                        title="이 행을 DB에 저장"
                        disabled={savingId === id}
                        onClick={() => void handleRowSaveClick(id)}
                        style={{
                          padding: '6px 10px',
                          fontSize: 12,
                          borderRadius: RADIUS.sm,
                          border: `1px solid ${COLORS.primary}`,
                          background: COLORS.primarySoft,
                          color: COLORS.accentText,
                          cursor: savingId === id ? 'wait' : 'pointer',
                          fontWeight: 700,
                          opacity: savingId === id ? 0.75 : 1,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {savingId === id ? '…' : '저장'}
                      </button>
                    </div>
                  ) : null}
                  {showDeleteColumn && onRowDelete ? (
                    <div
                      role="gridcell"
                      style={{
                        padding: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 0,
                      }}
                    >
                      <button
                        type="button"
                        title="이 행 삭제"
                        onClick={() => void onRowDelete(row)}
                        style={{
                          padding: '6px 10px',
                          fontSize: 12,
                          borderRadius: RADIUS.sm,
                          border: `1px solid ${COLORS.danger}`,
                          background: COLORS.dangerBg,
                          color: COLORS.danger,
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={{ padding: 24, textAlign: 'center', color: COLORS.textSecondary }}>행이 없습니다</p>
      ) : null}

      {imagePicker ? (
        <div
          role="dialog"
          aria-label="Unsplash 이미지 선택"
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            bottom: 12,
            zIndex: 1000,
            maxWidth: 720,
            margin: '0 auto',
            padding: 14,
            borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
            boxShadow: SHADOW.card,
            maxHeight: 'min(48vh, 360px)',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: COLORS.accentText,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>이미지 선택 (Unsplash)</span>
            <button
              type="button"
              onClick={() => setImagePicker(null)}
              style={{
                padding: '4px 10px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.bg,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              닫기
            </button>
          </div>
          {imageLoadingId === imagePicker.id &&
          (!imagePicker.photos || imagePicker.photos.length === 0) ? (
            <p style={{ margin: 0, fontSize: 14, color: COLORS.textSecondary }}>이미지 검색 중…</p>
          ) : imagePicker.photos && imagePicker.photos.length > 0 ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {imagePicker.photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickImage(imagePicker.id, p)}
                  style={{
                    padding: 0,
                    border: `2px solid ${COLORS.border}`,
                    borderRadius: RADIUS.sm,
                    cursor: 'pointer',
                    overflow: 'hidden',
                    background: 'none',
                  }}
                >
                  <img src={p.thumb} alt="" style={{ width: 80, height: 80, objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default memo(WordTable)
