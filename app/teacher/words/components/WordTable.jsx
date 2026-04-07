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
 * }} props
 */
export default function WordTable({ rows, onRowsChange, selectedIds, onSelectedIdsChange, onRowCommit }) {
  const [busyExampleId, setBusyExampleId] = useState(null)
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

  /** blur 시점에 부모 state가 아직 갱신 안 됐을 수 있어, 방금 입력한 필드 값을 patch 로 넘김 */
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
            <th style={{ padding: '10px 8px', color: COLORS.accentText }}>example_sentence</th>
            <th style={{ padding: '10px 8px', color: COLORS.accentText }}>set_name</th>
            <th style={{ padding: '10px 8px', width: 72, color: COLORS.accentText }}>day</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = String(row.id)
            const meaning = row.meaning != null ? String(row.meaning) : ''
            const example = row.example_sentence != null ? String(row.example_sentence) : ''
            const meaningEmpty = !meaning.trim()
            const exampleEmpty = !example.trim()

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
                <td style={{ padding: 8, color: exampleEmpty ? COLORS.textHint : COLORS.textPrimary }}>
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, minWidth: 200 }}>
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
                      placeholder="예문 (선택) — 🔍로 생성"
                      title="Ctrl+S: 예문 AI 제안"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '6px 8px',
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
                        flexShrink: 0,
                        width: 36,
                        padding: 0,
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${COLORS.border}`,
                        background: COLORS.primarySoft,
                        cursor: busyExampleId === id ? 'wait' : 'pointer',
                        fontSize: 16,
                        lineHeight: 1,
                      }}
                    >
                      {busyExampleId === id ? '…' : '🔍'}
                    </button>
                  </div>
                </td>
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
                <td style={{ padding: 8 }}>
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
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p style={{ padding: 24, textAlign: 'center', color: COLORS.textSecondary }}>행이 없습니다</p>
      ) : null}
    </div>
  )
}
