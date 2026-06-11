'use client'

import { Fragment } from 'react'
import { COLORS, RADIUS } from '@/utils/tokens'
import { MAX_OPTIONS, MIN_OPTIONS } from '../utils/quizCategories'
import {
  emptyOptions,
  formatAnswerLabel,
  isQuizRowValid,
  rowPreviewOptions,
  rowPreviewQuestion,
} from '../utils/quizRows'

/**
 * @param {{
 *   rows: object[],
 *   onRowsChange: (rows: object[]) => void,
 *   onRowCommit: (row: object) => Promise<void> | void,
 *   onRowDelete: (row: object) => Promise<void> | void,
 *   savingRowId?: string | null,
 * }} props
 */
export default function QuizItemTable({ rows, onRowsChange, onRowCommit, onRowDelete, savingRowId = null }) {
  const updateRow = (id, patch) => {
    onRowsChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const toggleExpand = (row) => {
    updateRow(row.id, { _expanded: !row._expanded })
  }

  const handleOptionChange = (row, index, value) => {
    const opts = [...(row.options || emptyOptions())]
    opts[index] = value
    updateRow(row.id, { options: opts })
  }

  const addOption = (row) => {
    const opts = [...(row.options || emptyOptions())]
    if (opts.length >= MAX_OPTIONS) return
    opts.push('')
    updateRow(row.id, { options: opts })
  }

  const removeLastOption = (row) => {
    const opts = [...(row.options || emptyOptions())]
    if (opts.length <= MIN_OPTIONS) return
    opts.pop()
    let ci = Number(row.correct_index)
    if (ci >= opts.length) ci = opts.length - 1
    updateRow(row.id, { options: opts, correct_index: ci })
  }

  const handleSave = async (row) => {
    if (!isQuizRowValid(row)) {
      alert('문제 본문, 선택지 2개 이상, 정답을 확인하세요.')
      return
    }
    await onRowCommit(row)
    updateRow(row.id, { _expanded: false })
  }

  return (
    <div className="word-table-wrap" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: COLORS.primarySoft }}>
            <th style={thStyle}>#</th>
            <th style={thStyle}>문제</th>
            <th style={thStyle}>선택지</th>
            <th style={thStyle}>정답</th>
            <th style={thStyle}>해설</th>
            <th style={thStyle}>저장</th>
            <th style={thStyle}>삭제</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <Fragment key={row.id}>
              <tr
                style={{
                  background: row._expanded ? COLORS.successBg : COLORS.surface,
                  cursor: 'pointer',
                }}
                onClick={() => toggleExpand(row)}
              >
                <td style={tdStyle}>{idx + 1}</td>
                <td style={tdStyle}>{rowPreviewQuestion(row.question_text)}</td>
                <td style={tdStyle}>{rowPreviewOptions(row.options)}</td>
                <td style={tdStyle}>{formatAnswerLabel(row.correct_index, row.options)}</td>
                <td style={tdStyle}>
                  {String(row.explanation || '').trim()
                    ? String(row.explanation).slice(0, 40) + (String(row.explanation).length > 40 ? '…' : '')
                    : '-'}
                </td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={savingRowId === row.id}
                    onClick={() => void handleSave(row)}
                    style={smallPrimaryBtn}
                  >
                    {savingRowId === row.id ? '…' : '저장'}
                  </button>
                </td>
                <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => void onRowDelete(row)}
                    style={smallDangerBtn}
                  >
                    삭제
                  </button>
                </td>
              </tr>
              {row._expanded ? (
                <tr key={`${row.id}-edit`}>
                  <td colSpan={7} style={{ ...tdStyle, background: COLORS.successBg, padding: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
                      <label style={fieldLabel}>
                        문제 본문
                        <textarea
                          value={row.question_text}
                          onChange={(e) => updateRow(row.id, { question_text: e.target.value })}
                          rows={4}
                          style={textareaStyle}
                          placeholder="문제 본문 (줄바꿈 가능)"
                        />
                      </label>

                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>선택지 ({MIN_OPTIONS}~{MAX_OPTIONS}개)</div>
                        {(row.options || emptyOptions()).map((opt, oi) => (
                          <label key={oi} style={{ ...fieldLabel, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <input
                              type="radio"
                              name={`correct-${row.id}`}
                              checked={Number(row.correct_index) === oi}
                              onChange={() => updateRow(row.id, { correct_index: oi })}
                            />
                            <span style={{ minWidth: 48, fontWeight: 600 }}>{oi + 1}번</span>
                            <input
                              value={opt}
                              onChange={(e) => handleOptionChange(row, oi, e.target.value)}
                              style={{ ...inputStyle, flex: 1 }}
                              placeholder={`선택지 ${oi + 1}`}
                            />
                          </label>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button
                            type="button"
                            onClick={() => addOption(row)}
                            disabled={(row.options || []).length >= MAX_OPTIONS}
                            style={smallSecondaryBtn}
                          >
                            + 선택지 추가
                          </button>
                          <button
                            type="button"
                            onClick={() => removeLastOption(row)}
                            disabled={(row.options || []).length <= MIN_OPTIONS}
                            style={smallSecondaryBtn}
                          >
                            − 마지막 선택지 삭제
                          </button>
                        </div>
                      </div>

                      <label style={fieldLabel}>
                        해설 (선택)
                        <textarea
                          value={row.explanation}
                          onChange={(e) => updateRow(row.id, { explanation: e.target.value })}
                          rows={2}
                          style={textareaStyle}
                          placeholder="해설"
                        />
                      </label>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          disabled={savingRowId === row.id}
                          onClick={() => void handleSave(row)}
                          style={smallPrimaryBtn}
                        >
                          {savingRowId === row.id ? '저장 중…' : '저장'}
                        </button>
                        <button type="button" onClick={() => updateRow(row.id, { _expanded: false })} style={smallSecondaryBtn}>
                          취소
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p style={{ padding: 24, textAlign: 'center', color: COLORS.textSecondary }}>등록된 문항이 없습니다.</p>
      ) : null}
    </div>
  )
}

const thStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: `2px solid ${COLORS.border}`,
  fontWeight: 800,
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '10px 12px',
  borderBottom: `1px solid ${COLORS.border}`,
  verticalAlign: 'top',
}

const fieldLabel = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 14,
  fontWeight: 700,
  color: COLORS.textPrimary,
}

const inputStyle = {
  padding: '8px 10px',
  borderRadius: RADIUS.md,
  border: `1px solid ${COLORS.border}`,
  fontSize: 14,
}

const textareaStyle = {
  ...inputStyle,
  resize: 'vertical',
  fontFamily: 'inherit',
}

const smallPrimaryBtn = {
  padding: '6px 12px',
  borderRadius: RADIUS.sm,
  border: 'none',
  background: COLORS.primary,
  color: COLORS.textOnGreen,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
}

const smallSecondaryBtn = {
  padding: '6px 12px',
  borderRadius: RADIUS.sm,
  border: `1px solid ${COLORS.border}`,
  background: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
}

const smallDangerBtn = {
  padding: '6px 12px',
  borderRadius: RADIUS.sm,
  border: 'none',
  background: '#64748b',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
}
