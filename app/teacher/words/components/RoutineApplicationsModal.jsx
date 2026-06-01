'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addRoutineApplication,
  deleteRoutineApplication,
  fetchRoutineApplications,
  updateRoutineApplicationStart,
} from '@/utils/routineAdmin'
import { COLORS, RADIUS } from '@/utils/tokens'

const DUPLICATE_APPLICATION_MSG =
  '이미 이 세트에 적용 중입니다. 변경하려면 위쪽 적용 카드에서 수정해주세요.'

function formatRoutineError(err) {
  if (err == null) return '오류가 발생했습니다.'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && typeof err.message === 'string') return err.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function isDuplicateApplicationError(err) {
  const msg = formatRoutineError(err).toLowerCase()
  return (
    msg.includes('duplicate') ||
    msg.includes('unique constraint') ||
    msg.includes('routine_applications_unique')
  )
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   teacherId: string,
 *   routineId: string,
 *   routineTitle: string,
 *   routineType?: 'day_split' | 'whole_set',
 *   totalDays: number,
 *   wordSetNames: string[],
 *   onChanged: () => void,
 * }} props
 */
export default function RoutineApplicationsModal({
  open,
  onClose,
  teacherId,
  routineId,
  routineTitle,
  routineType = 'day_split',
  totalDays,
  wordSetNames,
  onChanged,
}) {
  const isWholeSet = routineType === 'whole_set'
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [error, setError] = useState(null)

  const [newSet, setNewSet] = useState('')
  const [newMode, setNewMode] = useState('join')
  const [newStartDate, setNewStartDate] = useState('')
  const [saving, setSaving] = useState(false)

  const appliedSetNames = useMemo(() => {
    const set = new Set()
    for (const row of rows) {
      const sn = String(row.set_name || '').trim()
      if (sn) set.add(sn)
    }
    return set
  }, [rows])

  const availableSetNames = useMemo(
    () => (wordSetNames || []).filter((n) => !appliedSetNames.has(String(n || '').trim())),
    [wordSetNames, appliedSetNames],
  )

  const load = useCallback(async () => {
    if (!open || !teacherId || !routineId) return
    setLoading(true)
    setError(null)
    const res = await fetchRoutineApplications(routineId, teacherId)
    if (!res.ok) {
      setRows([])
      setError(res.error || '목록을 불러오지 못했습니다.')
    } else {
      setRows(res.rows || [])
    }
    setLoading(false)
  }, [open, teacherId, routineId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!open) {
      setNewSet('')
      setNewMode('join')
      setNewStartDate('')
    }
  }, [open])

  useEffect(() => {
    const sn = String(newSet || '').trim()
    if (sn && appliedSetNames.has(sn)) {
      setNewSet('')
    }
  }, [appliedSetNames, newSet])

  const handleAdd = async () => {
    if (!teacherId || !routineId || saving) return
    const sn = String(newSet || '').trim()
    if (!sn) {
      setError('단어 세트를 선택하세요.')
      return
    }
    if (appliedSetNames.has(sn)) {
      setError(DUPLICATE_APPLICATION_MSG)
      return
    }
    const startDate =
      isWholeSet || newMode !== 'fixed' || !newStartDate.trim() ? null : newStartDate.trim()
    setSaving(true)
    setError(null)
    const res = await addRoutineApplication({ teacherId, routineId, setName: sn, startDate })
    setSaving(false)
    if (!res.ok) {
      setError(isDuplicateApplicationError(res.error) ? DUPLICATE_APPLICATION_MSG : formatRoutineError(res.error))
      return
    }
    setNewSet('')
    setNewMode('join')
    setNewStartDate('')
    onChanged?.()
    void load()
  }

  const handleUpdateStart = async (applicationId, mode, dateStr) => {
    if (!teacherId || saving) return
    if (isWholeSet) {
      setError('전체 루틴은 고정 시작일을 사용할 수 없습니다.')
      return
    }
    const startDate = mode === 'fixed' && String(dateStr || '').trim() ? String(dateStr).trim() : null
    setSaving(true)
    setError(null)
    const res = await updateRoutineApplicationStart({ teacherId, applicationId, startDate })
    setSaving(false)
    if (!res.ok) {
      setError(formatRoutineError(res.error))
      return
    }
    onChanged?.()
    void load()
  }

  const handleRemove = async (applicationId) => {
    if (!teacherId || saving) return
    if (!window.confirm('이 세트 적용을 해제할까요? 해당 세트의 학생 루틴 진행 기록 행도 함께 삭제됩니다.')) return
    setSaving(true)
    setError(null)
    const res = await deleteRoutineApplication({ teacherId, applicationId })
    setSaving(false)
    if (!res.ok) {
      setError(formatRoutineError(res.error))
      return
    }
    onChanged?.()
    void load()
  }

  if (!open) return null

  const td = Math.max(1, parseInt(String(totalDays), 10) || 30)
  const canAddMore = availableSetNames.length > 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="routine-apps-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10060,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
      }}
      onClick={() => !saving && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          maxHeight: 'min(92vh, 720px)',
          overflowY: 'auto',
          padding: 22,
          borderRadius: RADIUS.lg,
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
        }}
      >
        <h3
          id="routine-apps-title"
          style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}
        >
          시작일 / 세트 적용 관리
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.5, color: COLORS.textSecondary }}>
          「{String(routineTitle || '').trim() || '루틴'}」 —{' '}
          {isWholeSet
            ? '전체(유지·복습) 루틴을 어떤 단어세트에 연결할지 설정합니다. 자율 모드 전용(고정 시작일 불가).'
            : `총 ${td}일 템플릿을 어떤 단어세트에 연결할지, 시작일을 어떻게 잡을지 설정합니다.`}
        </p>

        {error ? (
          <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: COLORS.danger }}>{error}</p>
        ) : null}

        <section
          style={{
            marginBottom: 16,
            padding: '14px 12px',
            borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.border}`,
            background: 'rgba(248,250,252,0.95)',
          }}
        >
          <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: COLORS.textPrimary }}>현재 적용 중</p>
          {loading ? (
            <p style={{ margin: 0, color: COLORS.textSecondary }}>불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary }}>적용된 세트가 없습니다.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rows.map((row) => {
                const fixed = Boolean(row.start_date)
                const label = isWholeSet
                  ? '자율 모드 전용 (학생별 가입일 기준, 고정 시작일 불가)'
                  : fixed
                    ? `${row.start_date} 고정 시작 (KST · 현재 일수는 학생 앱 동기화)`
                    : '학생별 가입일 기준 (자율 학습)'
                return (
                  <li
                    key={row.id}
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: RADIUS.md,
                      padding: 12,
                      background: '#fff',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 15, color: COLORS.textPrimary, marginBottom: 6 }}>
                      {row.set_name}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 10 }}>{label}</div>
                    {!isWholeSet ? (
                    <EditStartInline
                      applicationId={row.id}
                      fixed={fixed}
                      startDate={row.start_date ? String(row.start_date).slice(0, 10) : ''}
                      disabled={saving}
                      onSave={(mode, d) => void handleUpdateStart(row.id, mode, d)}
                    />
                    ) : null}
                    <button
                      type="button"
                      disabled={saving || rows.length <= 1}
                      onClick={() => void handleRemove(row.id)}
                      style={{
                        marginTop: 10,
                        padding: '6px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${COLORS.danger}`,
                        background: COLORS.dangerBg,
                        color: COLORS.danger,
                        cursor: saving ? 'wait' : 'pointer',
                        opacity: rows.length <= 1 ? 0.45 : 1,
                      }}
                    >
                      적용 해제
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section
          style={{
            borderTop: `2px solid ${COLORS.border}`,
            paddingTop: 16,
            marginTop: 4,
            padding: '16px 12px 0',
            borderRadius: RADIUS.md,
            background: 'rgba(255,255,255,0.6)',
          }}
        >
          <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
            다른 세트에 적용하기
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.55, color: COLORS.textSecondary }}>
            아직 연결하지 않은 단어 세트를 선택해 이 루틴을 추가로 적용할 수 있습니다.
          </p>

          {!canAddMore ? (
            <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.textHint }}>
              추가할 수 있는 세트가 없습니다. (모든 세트가 이미 적용 중이거나 등록된 세트가 없습니다.)
            </p>
          ) : (
            <>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600 }}>단어 세트</label>
              <select
                value={newSet}
                onChange={(e) => setNewSet(e.target.value)}
                disabled={saving}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: RADIUS.sm,
                  border: `1px solid ${COLORS.border}`,
                  marginBottom: 14,
                  fontSize: 14,
                }}
              >
                <option value="">선택…</option>
                {(wordSetNames || []).map((n) => {
                  const applied = appliedSetNames.has(String(n || '').trim())
                  return (
                    <option key={n} value={n} disabled={applied}>
                      {applied ? `${n} (이미 적용됨)` : n}
                    </option>
                  )
                })}
              </select>

              {isWholeSet ? (
                <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.55, color: '#0f766e' }}>
                  전체 루틴은 학생별 가입일(자율) 기준으로만 적용됩니다. 고정 시작일은 선택할 수 없습니다.
                </p>
              ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="newRoutineApplyMode"
                    checked={newMode === 'join'}
                    onChange={() => setNewMode('join')}
                  />
                  <span>
                    <strong>학생별 가입일 기준 (자유 학습)</strong>
                    <span style={{ display: 'block', fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
                      학생이 세트에 가입한 날부터 DAY 1로 시작합니다. 학생마다 진도가 다릅니다.
                    </span>
                  </span>
                </label>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="newRoutineApplyMode"
                    checked={newMode === 'fixed'}
                    onChange={() => setNewMode('fixed')}
                  />
                  <span style={{ flex: 1 }}>
                    <strong>학원 고정 시작일 (단체 수강)</strong>
                    <span style={{ display: 'block', fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
                      선택한 날짜(KST)부터 전원 DAY 1. 늦게 가입한 학생은 그날 기준 현재 DAY로 들어갑니다. 시작 전에는 DAY
                      1 대기입니다. 시작 후 경과가 총 {td}일을 넘으면 마지막 DAY로 고정됩니다.
                    </span>
                    {newMode === 'fixed' ? (
                      <input
                        type="date"
                        value={newStartDate}
                        onChange={(e) => setNewStartDate(e.target.value)}
                        style={{
                          marginTop: 8,
                          padding: '8px 10px',
                          borderRadius: RADIUS.sm,
                          border: `1px solid ${COLORS.border}`,
                          fontSize: 14,
                        }}
                      />
                    ) : null}
                  </span>
                </label>
              </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              style={{
                padding: '10px 16px',
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.bg,
                fontWeight: 600,
                cursor: saving ? 'wait' : 'pointer',
              }}
            >
              닫기
            </button>
            <button
              type="button"
              disabled={saving || !canAddMore || !newSet.trim()}
              onClick={() => void handleAdd()}
              style={{
                padding: '10px 16px',
                borderRadius: RADIUS.md,
                border: 'none',
                background: COLORS.headerGradient,
                color: COLORS.textOnGreen,
                fontWeight: 700,
                cursor: saving || !canAddMore || !newSet.trim() ? 'not-allowed' : 'pointer',
                opacity: saving || !canAddMore || !newSet.trim() ? 0.55 : 1,
              }}
            >
              {saving ? '처리 중…' : '세트 추가'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function EditStartInline({ applicationId, fixed, startDate, disabled, onSave }) {
  const [mode, setMode] = useState(fixed ? 'fixed' : 'join')
  const [dateStr, setDateStr] = useState(startDate || '')

  useEffect(() => {
    setMode(fixed ? 'fixed' : 'join')
    setDateStr(startDate || '')
  }, [applicationId, fixed, startDate])

  return (
    <div style={{ fontSize: 12, borderTop: `1px solid rgba(229,231,235,0.9)`, paddingTop: 10 }}>
      <span style={{ fontWeight: 700, marginRight: 8 }}>시작 방식 수정</span>
      <label style={{ marginRight: 12 }}>
        <input
          type="radio"
          name={`routine-edit-mode-${applicationId}`}
          checked={mode === 'join'}
          disabled={disabled}
          onChange={() => setMode('join')}
        />{' '}
        가입일
      </label>
      <label style={{ marginRight: 12 }}>
        <input
          type="radio"
          name={`routine-edit-mode-${applicationId}`}
          checked={mode === 'fixed'}
          disabled={disabled}
          onChange={() => setMode('fixed')}
        />{' '}
        고정일
      </label>
      {mode === 'fixed' ? (
        <input
          type="date"
          value={dateStr}
          disabled={disabled}
          onChange={(e) => setDateStr(e.target.value)}
          style={{ marginRight: 8, padding: '4px 8px', borderRadius: 6, border: `1px solid ${COLORS.border}` }}
        />
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSave(mode, mode === 'fixed' ? dateStr : null)}
        style={{
          padding: '4px 10px',
          borderRadius: 6,
          border: `1px solid ${COLORS.primary}`,
          background: 'rgba(102,126,234,0.08)',
          color: COLORS.primary,
          fontWeight: 700,
          fontSize: 12,
          cursor: disabled ? 'wait' : 'pointer',
        }}
      >
        저장
      </button>
    </div>
  )
}
