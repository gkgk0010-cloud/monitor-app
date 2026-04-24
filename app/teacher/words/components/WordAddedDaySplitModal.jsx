'use client'

import { useEffect, useState } from 'react'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'

const SUCCESS_EMERALD = '#10b981'

/**
 * 모달 1 — 단어 추가 후 Day 나누기 옵션을 모달 안에서 선택·실행
 * @param {{
 *   open: boolean
 *   onClose: () => void
 *   initialMode: 'equal' | 'chunk'
 *   initialTotalDays: number
 *   initialPerDay: number
 *   onExecute: (p: { dayMode: 'equal' | 'chunk', totalDays: number, perDay: number }) => void
 * }} props
 */
export default function WordAddedDaySplitModal({
  open,
  onClose,
  initialMode = 'equal',
  initialTotalDays = 7,
  initialPerDay = 20,
  onExecute,
}) {
  const [mode, setMode] = useState(initialMode)
  const [nDays, setNDays] = useState(initialTotalDays)
  const [nPer, setNPer] = useState(initialPerDay)

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setNDays(Math.max(1, Number(initialTotalDays) || 1))
    setNPer(Math.max(1, Number(initialPerDay) || 1))
  }, [open, initialMode, initialTotalDays, initialPerDay])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

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
          width: 'min(440px, 100%)',
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
            ✓ 단어가 추가됐어요
          </h2>
        </div>

        <p style={{ margin: '0 0 12px', fontSize: 15, color: COLORS.textPrimary, lineHeight: 1.5, fontWeight: 500 }}>
          Day별로 단어를 나눠야 학습이 가능해요.
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
          아래 두 방식 중 하나를 선택해서 입력하세요
        </p>

        <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
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
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() =>
              onExecute({
                dayMode: mode,
                totalDays: Math.max(1, nDays),
                perDay: Math.max(1, nPer),
              })
            }
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
