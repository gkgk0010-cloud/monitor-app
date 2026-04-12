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
}) {
  const [busyExampleId, setBusyExampleId] = useState(null)
  const [imagePicker, setImagePicker] = useState(null)
  const [imageLoadingId, setImageLoadingId] = useState(null)

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

  const commitRow = useCallback(
    (id, patch) => {
      const row = rowsRef.current.find((r) => String(r.id) === String(id))
      if (!row || !onRowCommit) return
      const merged = patch ? { ...row, ...patch } : row
      void onRowCommit(merged)
    },
    [onRowCommit],
  )

  const commitDraftField = useCallback(
    (id, field, val) => {
      updateField(id, field, val)
      commitRow(id, { [field]: val })
    },
    [updateField, commitRow],
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

  const columnCount = useMemo(
    () =>
      4 +
      (showRowNumbers ? 1 : 0) +
      (showImageColumn ? 1 : 0) +
      (showSetNameColumn ? 1 : 0) +
      (showDayColumn ? 1 : 0) +
      (showDeleteColumn && onRowDelete ? 1 : 0),
    [showRowNumbers, showImageColumn, showSetNameColumn, showDayColumn, showDeleteColumn, onRowDelete],
  )

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
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => (flatItems[index]?.type === 'section' ? 46 : 96),
    overscan: 20,
  })

  const suggestExample = useCallback(
    async (id) => {
      const row = getEffectiveRow(id)
      if (!row) return
      const word = String(row.word || '').trim()
      const meaning = String(row.meaning || '').trim()
      if (!word) {
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
        commitRow(id, { example_sentence: ex })
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
    [getEffectiveRow, updateField, commitRow],
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
    const q = String(row.word || '').trim()
    if (!q) {
      alert('영단어를 먼저 입력하세요.')
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
    commitRow(id, { image_url: url, image_source: 'unsplash' })
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
    commitRow(id, { image_url: s, image_source: source })
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

  return (
    <div
      style={{
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        borderRadius: RADIUS.md,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
        boxShadow: SHADOW.card,
        paddingBottom: 4,
      }}
    >
      <div
        ref={scrollParentRef}
        style={{
          maxHeight: 'min(72vh, calc(100vh - 240px))',
          overflow: 'auto',
        }}
      >
        <table
          style={{
            width: '100%',
            minWidth: 1120,
            borderCollapse: 'collapse',
            fontSize: 14,
            tableLayout: 'fixed',
          }}
        >
          <thead
            style={{
              display: 'table',
              width: '100%',
              tableLayout: 'fixed',
              position: 'sticky',
              top: 0,
              zIndex: 8,
              background: COLORS.primarySoft,
            }}
          >
          <tr style={{ background: COLORS.primarySoft, textAlign: 'left' }}>
            <th style={{ padding: '10px 8px', width: 40 }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="전체 선택"
              />
            </th>
            {showRowNumbers ? (
              <th style={{ padding: '10px 6px', width: 44, color: COLORS.accentText, textAlign: 'right' }}>
                #
              </th>
            ) : null}
            <th style={{ padding: '10px 8px', color: COLORS.accentText }}>word</th>
            <th style={{ padding: '10px 8px', color: COLORS.accentText }}>meaning</th>
            {showImageColumn ? (
              <th style={{ padding: '10px 8px', color: COLORS.accentText, width: 120 }}>image</th>
            ) : null}
            <th style={{ padding: '10px 8px', color: COLORS.accentText }}>example_sentence</th>
            {showSetNameColumn ? (
              <th style={{ padding: '10px 8px', color: COLORS.accentText }}>set_name</th>
            ) : null}
            {showDayColumn ? (
              <th style={{ padding: '10px 8px', width: 72, color: COLORS.accentText }}>day</th>
            ) : null}
            {showDeleteColumn && onRowDelete ? (
              <th
                style={{
                  padding: '10px 8px',
                  minWidth: 72,
                  width: 72,
                  color: COLORS.accentText,
                  position: 'sticky',
                  right: 0,
                  zIndex: 4,
                  background: COLORS.primarySoft,
                  boxShadow: '-8px 0 14px -6px rgba(0, 0, 0, 0.12)',
                }}
              >
                삭제
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody
          style={{
            display: 'block',
            position: 'relative',
            width: '100%',
            height: rowVirtualizer.getTotalSize(),
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = flatItems[virtualRow.index]
            if (!item) return null
            const trBase = {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
              display: 'table',
              tableLayout: 'fixed',
            }
            if (item.type === 'section') {
              const sec = item.sec
              return (
                <tr
                  key={`sec-${sec.key}`}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={trBase}
                >
                  <td
                    colSpan={columnCount}
                    style={{
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
                  </td>
                </tr>
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

            return (
              <tr
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  ...trBase,
                  borderTop: `1px solid ${COLORS.border}`,
                  background: selectedIds.has(id) ? COLORS.successBg : COLORS.surface,
                }}
              >
                <td style={{ padding: 8 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(id)}
                    onChange={() => toggleOne(id)}
                    aria-label={`선택 ${row.word}`}
                  />
                </td>
                {showRowNumbers ? (
                  <td
                    style={{
                      padding: '8px 6px',
                      textAlign: 'right',
                      color: COLORS.textSecondary,
                      fontSize: 13,
                      width: 44,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {rowNum}
                  </td>
                ) : null}
                <td style={{ padding: 8 }}>
                  <DraftTextInput
                    rowId={id}
                    field="word"
                    value={row.word != null ? String(row.word) : ''}
                    cellDraftsRef={cellDraftsRef}
                    onCommit={commitDraftField}
                    style={{
                      width: '100%',
                      minWidth: 100,
                      padding: '6px 8px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${COLORS.border}`,
                    }}
                  />
                </td>
                <td style={{ padding: 8, background: meaningEmpty ? COLORS.warningBg : undefined }}>
                  <DraftTextInput
                    rowId={id}
                    field="meaning"
                    value={meaning}
                    cellDraftsRef={cellDraftsRef}
                    onCommit={commitDraftField}
                    placeholder={meaningEmpty ? '뜻 입력' : ''}
                    style={{
                      width: '100%',
                      minWidth: 120,
                      padding: '6px 8px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${meaningEmpty ? COLORS.warning : COLORS.border}`,
                    }}
                  />
                </td>
                {showImageColumn ? (
                  <td style={{ padding: 8, verticalAlign: 'top' }}>
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
                        minWidth: 132,
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
                      <span style={{ fontSize: 10, color: COLORS.textHint }}>
                        드롭·붙여넣기·URL
                      </span>
                    </div>
                  </td>
                ) : null}
                <td
                  style={{
                    padding: 8,
                    color: exampleEmpty ? COLORS.textHint : COLORS.textPrimary,
                    minWidth: 220,
                    verticalAlign: 'middle',
                  }}
                >
                  <div style={{ position: 'relative', width: '100%', minWidth: 200 }}>
                    <DraftTextInput
                      rowId={id}
                      field="example_sentence"
                      value={example}
                      cellDraftsRef={cellDraftsRef}
                      onCommit={commitDraftField}
                      dataRowId={id}
                      onKeyDown={handleExampleKeyDown}
                      placeholder="예문 (선택) — 오른쪽 돋보기로 AI 생성"
                      style={{
                        boxSizing: 'border-box',
                        width: '100%',
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
                </td>
                {showSetNameColumn ? (
                  <td style={{ padding: 8 }}>
                    <DraftTextInput
                      rowId={id}
                      field="set_name"
                      value={row.set_name != null ? String(row.set_name) : ''}
                      cellDraftsRef={cellDraftsRef}
                      onCommit={commitDraftField}
                      style={{
                        width: '100%',
                        minWidth: 100,
                        padding: '6px 8px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${COLORS.border}`,
                      }}
                    />
                  </td>
                ) : null}
                {showDayColumn ? (
                  <td style={{ padding: 8 }}>
                    {dayReadOnly ? (
                      <span style={{ fontWeight: 600, color: COLORS.accentText }}>
                        {row.day != null ? Number(row.day) : '—'}
                      </span>
                    ) : (
                      <DraftDayInput
                        rowId={id}
                        value={row.day != null ? Number(row.day) : 1}
                        cellDraftsRef={cellDraftsRef}
                        onCommit={commitDraftField}
                        style={{
                          width: 64,
                          padding: '6px 8px',
                          borderRadius: RADIUS.sm,
                          border: `1px solid ${COLORS.border}`,
                        }}
                      />
                    )}
                  </td>
                ) : null}
                {showDeleteColumn && onRowDelete ? (
                  <td
                    style={{
                      padding: 8,
                      verticalAlign: 'middle',
                      position: 'sticky',
                      right: 0,
                      zIndex: 2,
                      background: selectedIds.has(id) ? COLORS.successBg : COLORS.surface,
                      boxShadow: '-8px 0 14px -6px rgba(0, 0, 0, 0.1)',
                      minWidth: 72,
                      whiteSpace: 'nowrap',
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
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
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
