'use client'

import { useEffect, useMemo, useState } from 'react'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import { assignDaysFromManualCounts } from '../utils/dayAssign'

const SUCCESS_EMERALD = '#10b981'

/**
 * @param {{
 *   open: boolean
 *   onClose: () => void
 *   initialMode: 'equal' | 'chunk' | 'csv_day' | 'manual'
 *   initialTotalDays: number
 *   initialPerDay: number
 *   initialManualSegments?: { day: number, count: number }[]
 *   canUseCsvDay?: boolean
 *   isSentenceStyleCreate?: boolean
 *   validCount: number
 *   onExecute: (p: {
 *     dayMode: 'equal' | 'chunk' | 'csv_day' | 'manual'
 *     totalDays: number
 *     perDay: number
 *     manualSegments?: { day: number, count: number }[]
 *   }) => void
 * }} props
 */
export default function WordAddedDaySplitModal({
  open,
  onClose,
  initialMode = 'equal',
  initialTotalDays = 7,
  initialPerDay = 20,
  initialManualSegments,
  onExecute,
  canUseCsvDay = false,
  isSentenceStyleCreate = false,
  validCount = 0,
}) {
  const [mode, setMode] = useState(initialMode)
  const [nDays, setNDays] = useState(initialTotalDays)
  const [nPer, setNPer] = useState(initialPerDay)
  const [manualSegs, setManualSegs] = useState(() => initialManualSegments || [{ day: 1, count: 0 }])

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setNDays(Math.max(1, Number(initialTotalDays) || 1))
    setNPer(Math.max(1, Number(initialPerDay) || 1))
    setManualSegs(
      initialManualSegments && initialManualSegments.length > 0
        ? initialManualSegments.map((s) => ({
            day: Math.max(1, Math.floor(parseInt(String(s?.day), 10) || 1)),
            count: Math.max(0, Math.floor(parseInt(String(s?.count), 10) || 0)),
          }))
        : [{ day: 1, count: 0 }],
    )
  }, [open, initialMode, initialTotalDays, initialPerDay, initialManualSegments])

  const manualSum = useMemo(
    () => manualSegs.reduce((a, s) => a + (Math.max(0, Math.floor(parseInt(String(s.count), 10) || 0)) || 0), 0),
    [manualSegs],
  )
  const manualMismatch = useMemo(() => validCount > 0 && manualSum !== validCount, [manualSum, validCount])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const addManualDay = () => {
    const maxD = Math.max(1, ...manualSegs.map((s) => s.day), 0)
    setManualSegs((prev) => [...prev, { day: maxD + 1, count: 0 }])
  }

  const runExecute = () => {
    if (mode === 'csv_day') {
      onExecute({ dayMode: 'csv_day', totalDays: 1, perDay: 1 })
      return
    }
    if (mode === 'manual') {
      const segs = manualSegs.map((s) => ({
        day: s.day,
        count: Math.max(0, Math.floor(parseInt(String(s.count), 10) || 0)),
      }))
      if (validCount < 1) {
        onClose()
        return
      }
      const res = assignDaysFromManualCounts(validCount, segs)
      if (!res.ok) {
        if (res.sum < res.expected) {
          alert(
            `⚠️ 입력 합계(${res.sum})와 총 개수(${res.expected})가 다릅니다. 남은 ${res.expected - res.sum}개는 직접 조정해주세요.`,
          )
        } else {
          alert(
            `⚠️ 입력 합계(${res.sum})와 총 개수(${res.expected})가 다릅니다. ${res.sum - res.expected}개를 줄여 주세요.`,
          )
        }
        return
      }
      onExecute({ dayMode: 'manual', totalDays: 1, perDay: 1, manualSegments: segs })
      return
    }
    onExecute({
      dayMode: mode,
      totalDays: Math.max(1, nDays),
      perDay: Math.max(1, nPer),
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="word-day-split-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
        overflow: 'auto',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)',
          maxWidth: '100%',
          maxHeight: 'min(92vh, 100%)',
          overflow: 'auto',
          background: COLORS.surface,
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.modal,
          padding: '20px 20px 18px',
          boxSizing: 'border-box',
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div
            aria-hidden
            style={{
              flexShrink: 0,
              width: 40,
              height: 40,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${SUCCESS_EMERALD} 0%, #059669 100%)`,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 800,
              boxShadow: '0 2px 12px rgba(16, 185, 129, 0.35)',
            }}
          >
            ✓
          </div>
          <h2
            id="word-day-split-title"
            style={{ fontSize: 18, fontWeight: 800, color: COLORS.accentText, margin: 0, lineHeight: 1.4 }}
          >
            {isSentenceStyleCreate ? '✓ 문장/스피킹이 추가됐어요' : '✓ 단어가 추가됐어요'}
          </h2>
        </div>

        <p style={{ margin: '0 0 12px', fontSize: 15, color: COLORS.textPrimary, lineHeight: 1.5, fontWeight: 500 }}>
          Day별로 나눠야 학습이 가능해요.
        </p>

        <div
          style={{
            height: 1,
            background: 'linear-gradient(90deg, rgba(102,126,234,0.4) 0%, rgba(229,231,235,0.95) 100%)',
            margin: '0 0 12px',
          }}
        />

        <p
          style={{
            margin: '0 0 12px',
            fontSize: 14,
            fontWeight: 700,
            color: COLORS.textPrimary,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span aria-hidden>💡</span>
          Day 나누기 방식을 선택하세요
        </p>

        <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          <div
            style={{
              padding: 12,
              borderRadius: RADIUS.md,
              border: `1px solid ${mode === 'equal' ? COLORS.primary : COLORS.border}`,
              background: mode === 'equal' ? COLORS.primarySoft : COLORS.bg,
            }}
          >
            <label
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}
            >
              <input
                type="radio"
                name="day-split-mode"
                checked={mode === 'equal'}
                onChange={() => setMode('equal')}
                style={{ marginTop: 3 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: COLORS.accentText, fontSize: 14, marginBottom: 4 }}>
                  Day 개수로 나누기
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: COLORS.textSecondary,
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    flexWrap: 'wrap',
                  }}
                >
                  <span>📅</span> 며칠 안에 끝낼지 정함
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    min={1}
                    value={nDays}
                    onChange={(e) => setNDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    disabled={mode !== 'equal'}
                    style={{
                      width: 72,
                      padding: '8px 10px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${COLORS.border}`,
                      fontSize: 15,
                      fontWeight: 700,
                      opacity: mode === 'equal' ? 1 : 0.5,
                      background: mode === 'equal' ? COLORS.surface : '#f3f4f6',
                      cursor: mode === 'equal' ? 'text' : 'not-allowed',
                    }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>Day</span>
                </div>
              </div>
            </label>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: RADIUS.md,
              border: `1px solid ${mode === 'chunk' ? COLORS.primary : COLORS.border}`,
              background: mode === 'chunk' ? COLORS.primarySoft : COLORS.bg,
            }}
          >
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="radio"
                name="day-split-mode"
                checked={mode === 'chunk'}
                onChange={() => setMode('chunk')}
                style={{ marginTop: 3 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: COLORS.accentText, fontSize: 14, marginBottom: 4 }}>
                  단어 개수로 나누기
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: COLORS.textSecondary,
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    flexWrap: 'wrap',
                  }}
                >
                  <span>📝</span> 하루 몇 개씩 학습할지 정함
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    min={1}
                    value={nPer}
                    onChange={(e) => setNPer(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    disabled={mode !== 'chunk'}
                    style={{
                      width: 72,
                      padding: '8px 10px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${COLORS.border}`,
                      fontSize: 15,
                      fontWeight: 700,
                      opacity: mode === 'chunk' ? 1 : 0.5,
                      background: mode === 'chunk' ? COLORS.surface : '#f3f4f6',
                      cursor: mode === 'chunk' ? 'text' : 'not-allowed',
                    }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>개</span>
                </div>
              </div>
            </label>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: RADIUS.md,
              border: `1px solid ${mode === 'csv_day' && canUseCsvDay ? COLORS.primary : COLORS.border}`,
              background: mode === 'csv_day' && canUseCsvDay ? COLORS.primarySoft : COLORS.bg,
              opacity: canUseCsvDay ? 1 : 0.65,
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                cursor: canUseCsvDay ? 'pointer' : 'not-allowed',
              }}
            >
              <input
                type="radio"
                name="day-split-mode"
                checked={mode === 'csv_day'}
                disabled={!canUseCsvDay}
                onChange={() => {
                  if (canUseCsvDay) setMode('csv_day')
                }}
                style={{ marginTop: 3 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: COLORS.accentText, fontSize: 14, marginBottom: 4 }}>
                  CSV의 day 컬럼 사용
                </div>
                <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.45 }}>
                  업로드한 표에 day가 있으면 그대로 씁니다. 문장/스피킹에 기본 권장.
                </p>
                {!canUseCsvDay ? (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: COLORS.textHint, fontWeight: 600 }}>
                    CSV에 day 컬럼이 없어요
                  </p>
                ) : null}
              </div>
            </label>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: RADIUS.md,
              border: `1px solid ${mode === 'manual' ? COLORS.primary : COLORS.border}`,
              background: mode === 'manual' ? COLORS.primarySoft : COLORS.bg,
            }}
          >
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="radio"
                name="day-split-mode"
                checked={mode === 'manual'}
                onChange={() => setMode('manual')}
                style={{ marginTop: 3 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: COLORS.accentText, fontSize: 14, marginBottom: 4 }}>
                  Day별 개수 직접 입력
                </div>
                <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.45 }}>
                  문장/스피킹에서 Day당 개수를 직접 맞출 때 유용해요.
                </p>
              </div>
            </label>
            {mode === 'manual' ? (
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: `1px solid ${COLORS.border}`,
                  display: 'grid',
                  gap: 8,
                }}
              >
                {manualSegs.map((s, i) => (
                  <div
                    key={`${s.day}-${i}`}
                    style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
                  >
                    <span style={{ minWidth: 48, fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                      Day {s.day}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={s.count}
                      onChange={(e) => {
                        const c = Math.max(0, parseInt(e.target.value, 10) || 0)
                        setManualSegs((prev) => prev.map((x, j) => (j === i ? { ...x, count: c } : x)))
                      }}
                      style={{
                        width: 64,
                        padding: '6px 8px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${COLORS.border}`,
                        fontSize: 14,
                      }}
                    />
                    <span style={{ fontSize: 13, color: COLORS.textSecondary }}>개</span>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addManualDay}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '6px 12px',
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: RADIUS.sm,
                    border: `1px dashed ${COLORS.border}`,
                    background: COLORS.surface,
                    cursor: 'pointer',
                    color: COLORS.accentText,
                  }}
                >
                  + Day 추가
                </button>
                {validCount > 0 ? (
                  <div style={{ fontSize: 13, color: COLORS.textPrimary, fontWeight: 600 }}>
                    합계: {manualSum} / {validCount}
                  </div>
                ) : null}
                {manualMismatch ? (
                  <p style={{ margin: 0, fontSize: 12, color: '#b45309', lineHeight: 1.4, fontWeight: 600 }}>
                    ⚠️ 입력 합계({manualSum})와 총 개수({validCount})가 다릅니다.{' '}
                    {manualSum < validCount
                      ? `남은 ${validCount - manualSum}개는 직접 조정해주세요.`
                      : `${manualSum - validCount}개를 줄여 주세요.`}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={runExecute}
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: COLORS.headerGradient,
              color: COLORS.textOnGreen,
              fontWeight: 800,
              fontSize: 15,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(102, 126, 234, 0.3)',
            }}
          >
            Day 나누기 실행
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.bg,
              color: COLORS.textSecondary,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            나중에 하기
          </button>
        </div>
      </div>
    </div>
  )
}
