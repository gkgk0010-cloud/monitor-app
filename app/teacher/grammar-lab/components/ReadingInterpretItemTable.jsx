'use client'

import { Fragment, useState } from 'react'
import { COLORS, RADIUS } from '@/utils/tokens'
import {
  emptyKeyWordRow,
  isInterpretRowValid,
  rowPreviewKeyWords,
  rowPreviewSentence,
  rowPreviewTranslation,
  trimKeyWords,
} from '../utils/readingInterpretRows'
import { applyAIResultToRow, invokeInterpretMetaGenerator } from '../utils/readingInterpretAi'

/**
 * @param {{
 *   rows: object[],
 *   onRowsChange: (rows: object[]) => void,
 *   onRowCommit: (row: object) => Promise<void> | void,
 *   onRowDelete: (row: object) => Promise<void> | void,
 *   savingRowId?: string | null,
 *   supabase?: import('@supabase/supabase-js').SupabaseClient | null,
 *   setContext?: { hint_tone?: string | null, awkward_guide?: string | null },
 * }} props
 */
export default function ReadingInterpretItemTable({
  rows,
  onRowsChange,
  onRowCommit,
  onRowDelete,
  savingRowId = null,
  supabase = null,
  setContext = {},
}) {
  const [aiRowId, setAiRowId] = useState(null)

  const updateRow = (id, patch) => {
    onRowsChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const updateKeyWord = (row, index, field, value) => {
    const kws = [...(row.key_words || [emptyKeyWordRow()])]
    kws[index] = { ...kws[index], [field]: value }
    updateRow(row.id, { key_words: kws })
  }

  const addKeyWord = (row) => {
    updateRow(row.id, { key_words: [...(row.key_words || []), emptyKeyWordRow()] })
  }

  const removeKeyWord = (row, index) => {
    const kws = [...(row.key_words || [emptyKeyWordRow()])]
    if (kws.length <= 1) return
    kws.splice(index, 1)
    updateRow(row.id, { key_words: kws })
  }

  const handleSave = async (row) => {
    if (!isInterpretRowValid(row)) {
      alert('영어 문장과 정답 의역은 필수입니다.')
      return
    }
    await onRowCommit(row)
    updateRow(row.id, { _expanded: false })
  }

  const handleRowAi = async (row) => {
    if (!supabase) {
      alert('AI 도우미를 사용할 수 없습니다.')
      return
    }
    if (!String(row.sentence_en || '').trim() || !String(row.correct_translation || '').trim()) {
      alert('영어 문장과 정답 의역을 먼저 입력하세요.')
      return
    }
    if (String(row.id).startsWith('temp-')) {
      alert('먼저 행을 저장한 뒤 AI 자동 생성을 사용하세요.')
      return
    }
    setAiRowId(row.id)
    try {
      const results = await invokeInterpretMetaGenerator(supabase, {
        items: [
          {
            id: row.id,
            sentence_en: row.sentence_en,
            correct_translation: row.correct_translation,
          },
        ],
        set_context: setContext,
      })
      const ai = results.find((r) => String(r?.id) === String(row.id)) || results[0]
      if (!ai) {
        alert('AI 결과가 없습니다.')
        return
      }
      updateRow(row.id, applyAIResultToRow(row, ai))
    } catch (e) {
      alert('AI 생성 실패: ' + (e?.message || e))
    } finally {
      setAiRowId(null)
    }
  }

  return (
    <div className="word-table-wrap" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: COLORS.primarySoft }}>
            <th style={thStyle}>#</th>
            <th style={thStyle}>Day</th>
            <th style={thStyle}>영어 문장</th>
            <th style={thStyle}>정답 의역</th>
            <th style={thStyle}>핵심 단어</th>
            <th style={thStyle}>힌트</th>
            <th style={thStyle}>저장</th>
            <th style={thStyle}>삭제</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <Fragment key={row.id}>
              <tr
                style={{ background: row._expanded ? COLORS.successBg : COLORS.surface, cursor: 'pointer' }}
                onClick={() => updateRow(row.id, { _expanded: !row._expanded })}
              >
                <td style={tdStyle}>{idx + 1}</td>
                <td style={tdStyle}>{row.day != null && row.day !== '' ? `Day ${row.day}` : '-'}</td>
                <td style={tdStyle}>{rowPreviewSentence(row.sentence_en)}</td>
                <td style={tdStyle}>{rowPreviewTranslation(row.correct_translation)}</td>
                <td style={tdStyle}>{rowPreviewKeyWords(row.key_words)}</td>
                <td style={tdStyle}>
                  {String(row.hint || '').trim()
                    ? String(row.hint).slice(0, 30) + (String(row.hint).length > 30 ? '…' : '')
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
                  <button type="button" onClick={() => void onRowDelete(row)} style={smallDangerBtn}>
                    삭제
                  </button>
                </td>
              </tr>
              {row._expanded ? (
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, background: COLORS.successBg, padding: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
                      <label style={fieldLabel}>
                        Day (1~30, 비우면 NULL)
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={row.day ?? ''}
                          onChange={(e) => {
                            const v = e.target.value
                            updateRow(row.id, { day: v === '' ? null : v })
                          }}
                          style={{ ...inputStyle, maxWidth: 120 }}
                          placeholder="예: 1"
                        />
                      </label>

                      <label style={fieldLabel}>
                        영어 문장
                        <input
                          value={row.sentence_en}
                          onChange={(e) => updateRow(row.id, { sentence_en: e.target.value })}
                          style={inputStyle}
                          placeholder="The company will..."
                        />
                      </label>

                      <label style={fieldLabel}>
                        정답 의역
                        <textarea
                          value={row.correct_translation}
                          onChange={(e) => updateRow(row.id, { correct_translation: e.target.value })}
                          rows={3}
                          style={textareaStyle}
                          placeholder="정답 해석"
                        />
                      </label>

                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>핵심 단어</div>
                        {(row.key_words || [emptyKeyWordRow()]).map((kw, ki) => (
                          <div key={ki} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                            <input
                              value={kw.word}
                              onChange={(e) => updateKeyWord(row, ki, 'word', e.target.value)}
                              style={{ ...inputStyle, flex: '1 1 120px' }}
                              placeholder="단어"
                            />
                            <input
                              value={kw.meaning}
                              onChange={(e) => updateKeyWord(row, ki, 'meaning', e.target.value)}
                              style={{ ...inputStyle, flex: '2 1 180px' }}
                              placeholder="의미"
                            />
                            <button
                              type="button"
                              onClick={() => removeKeyWord(row, ki)}
                              disabled={(row.key_words || []).length <= 1}
                              style={smallSecondaryBtn}
                            >
                              삭제
                            </button>
                          </div>
                        ))}
                        <button type="button" onClick={() => addKeyWord(row)} style={smallSecondaryBtn}>
                          + 단어 추가
                        </button>
                        {trimKeyWords(row.key_words).length ? (
                          <p style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.textSecondary }}>
                            미리보기: {rowPreviewKeyWords(row.key_words)}
                          </p>
                        ) : null}
                      </div>

                      <label style={fieldLabel}>
                        힌트 (선택)
                        <textarea
                          value={row.hint}
                          onChange={(e) => updateRow(row.id, { hint: e.target.value })}
                          rows={2}
                          style={textareaStyle}
                          placeholder="힌트"
                        />
                      </label>

                      <label style={fieldLabel}>
                        어색 패턴 (쉼표 구분)
                        <textarea
                          value={row.awkward_patterns}
                          onChange={(e) => updateRow(row.id, { awkward_patterns: e.target.value })}
                          rows={2}
                          style={textareaStyle}
                          placeholder="직역 어색 표현, 쉼표로 구분"
                        />
                      </label>

                      <label style={fieldLabel}>
                        핵심 표현 (쉼표 구분)
                        <textarea
                          value={row.critical_phrases}
                          onChange={(e) => updateRow(row.id, { critical_phrases: e.target.value })}
                          rows={2}
                          style={textareaStyle}
                          placeholder="정답 핵심 표현, 쉼표로 구분"
                        />
                      </label>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          disabled={aiRowId === row.id || !supabase}
                          onClick={() => void handleRowAi(row)}
                          style={smallAiBtn}
                        >
                          {aiRowId === row.id ? 'AI 생성 중…' : '✨ AI 자동 생성'}
                        </button>
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
const tdStyle = { padding: '10px 12px', borderBottom: `1px solid ${COLORS.border}`, verticalAlign: 'top' }
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
const textareaStyle = { ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }
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
const smallAiBtn = {
  padding: '6px 12px',
  borderRadius: RADIUS.sm,
  border: '1px solid #c4b5fd',
  background: '#f5f3ff',
  color: '#5b21b6',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
}
