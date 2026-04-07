'use client'

import { useState } from 'react'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'

/**
 * @param {{
 *   rows: Array<Record<string, unknown>>
 *   onRowsChange: (rows: Array<Record<string, unknown>>) => void
 *   selectedIds: Set<string>
 *   onSelectedIdsChange: (ids: Set<string>) => void
 *   onRowCommit?: (row: Record<string, unknown>) => void | Promise<void>
 *   showSetNameColumn?: boolean
 *   showDayColumn?: boolean
 *   dayReadOnly?: boolean
 *   showImageColumn?: boolean
 * }} props
 */
export default function WordTable({
  rows,
  onRowsChange,
  selectedIds,
  onSelectedIdsChange,
  onRowCommit,
  showSetNameColumn = true,
  showDayColumn = true,
  dayReadOnly = false,
  showImageColumn = true,
}) {
  const [busyExampleId, setBusyExampleId] = useState(null)
  const [imagePicker, setImagePicker] = useState(null)
  const [imageLoadingId, setImageLoadingId] = useState(null)

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

  const updateField = (id, field, value) => {
    onRowsChange(
      rows.map((r) => (String(r.id) === String(id) ? { ...r, [field]: value } : r)),
    )
  }

  /** 연속 updateField 는 stale rows 로 서로 덮어쓸 수 있음 → 한 번에 병합 */
  const patchRow = (id, patch) => {
    onRowsChange(
      rows.map((r) => (String(r.id) === String(id) ? { ...r, ...patch } : r)),
    )
  }

  const commitRow = (id, patch) => {
    const row = rows.find((r) => String(r.id) === String(id))
    if (!row || !onRowCommit) return
    const merged = patch ? { ...row, ...patch } : row
    void onRowCommit(merged)
  }

  const suggestExample = async (id) => {
    const row = rows.find((r) => String(r.id) === String(id))
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
      updateField(id, 'example_sentence', ex)
      commitRow(id, { example_sentence: ex })
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyExampleId(null)
    }
  }

  const openImagePicker = async (id) => {
    const row = rows.find((r) => String(r.id) === String(id))
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

  return (
    <div
      style={{
        overflowX: 'auto',
        borderRadius: RADIUS.md,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
        boxShadow: SHADOW.card,
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: COLORS.primarySoft, textAlign: 'left' }}>
            <th style={{ padding: '10px 8px', width: 40 }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="전체 선택"
              />
            </th>
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
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = String(row.id)
            const meaning = row.meaning != null ? String(row.meaning) : ''
            const example = row.example_sentence != null ? String(row.example_sentence) : ''
            const meaningEmpty = !meaning.trim()
            const exampleEmpty = !example.trim()
            const img = row.image_url ? String(row.image_url).trim() : ''

            return (
              <tr
                key={id}
                style={{
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
                <td style={{ padding: 8 }}>
                  <input
                    value={row.word != null ? String(row.word) : ''}
                    onChange={(e) => updateField(id, 'word', e.target.value)}
                    onBlur={(e) => commitRow(id, { word: e.target.value })}
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
                  <input
                    value={meaning}
                    onChange={(e) => updateField(id, 'meaning', e.target.value)}
                    onBlur={(e) => commitRow(id, { meaning: e.target.value })}
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
                  <td style={{ padding: 8, verticalAlign: 'middle' }}>
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
                        {imageLoadingId === id ? '검색…' : '이미지'}
                      </button>
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
                    <input
                      value={example}
                      onChange={(e) => updateField(id, 'example_sentence', e.target.value)}
                      onBlur={(e) => commitRow(id, { example_sentence: e.target.value })}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                          e.preventDefault()
                          void suggestExample(id)
                        }
                      }}
                      placeholder="예문 (선택) — 오른쪽 돋보기로 AI 생성"
                      title="Ctrl+S: 예문 AI 제안"
                      style={{
                        boxSizing: 'border-box',
                        width: '100%',
                        padding: '6px 40px 6px 8px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${COLORS.border}`,
                        fontStyle: exampleEmpty ? 'italic' : 'normal',
                      }}
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
                    <input
                      value={row.set_name != null ? String(row.set_name) : ''}
                      onChange={(e) => updateField(id, 'set_name', e.target.value)}
                      onBlur={(e) => commitRow(id, { set_name: e.target.value })}
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
                      <input
                        type="number"
                        min={1}
                        value={row.day != null ? Number(row.day) : 1}
                        onChange={(e) => updateField(id, 'day', parseInt(e.target.value, 10) || 1)}
                        onBlur={(e) =>
                          commitRow(id, { day: parseInt(e.target.value, 10) || 1 })
                        }
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
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p style={{ padding: 24, textAlign: 'center', color: COLORS.textSecondary }}>행이 없습니다</p>
      ) : null}

      {imagePicker && imagePicker.photos?.length > 0 ? (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            left: 0,
            right: 0,
            padding: 12,
            marginTop: 8,
            borderTop: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
            boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
          }}
        >
          <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>
            이미지 선택 (Unsplash)
          </div>
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
            <button
              type="button"
              onClick={() => setImagePicker(null)}
              style={{
                padding: '8px 12px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.bg,
                cursor: 'pointer',
              }}
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
