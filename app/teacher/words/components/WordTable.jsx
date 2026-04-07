'use client'

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

  const commitRow = (id) => {
    const row = rows.find((r) => String(r.id) === String(id))
    if (row && onRowCommit) void onRowCommit(row)
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
                    onBlur={() => commitRow(id)}
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
                    onBlur={() => commitRow(id)}
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
                  <input
                    value={example}
                    onChange={(e) => updateField(id, 'example_sentence', e.target.value)}
                    onBlur={() => commitRow(id)}
                    placeholder="예문 (선택)"
                    style={{
                      width: '100%',
                      minWidth: 160,
                      padding: '6px 8px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${COLORS.border}`,
                      fontStyle: exampleEmpty ? 'italic' : 'normal',
                    }}
                  />
                </td>
                <td style={{ padding: 8 }}>
                  <input
                    value={row.set_name != null ? String(row.set_name) : ''}
                    onChange={(e) => updateField(id, 'set_name', e.target.value)}
                    onBlur={() => commitRow(id)}
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
                    onBlur={() => commitRow(id)}
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
