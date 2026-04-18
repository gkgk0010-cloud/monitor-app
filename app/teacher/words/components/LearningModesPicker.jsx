'use client'

import { useMemo } from 'react'
import { COLORS, RADIUS } from '@/utils/tokens'
import { MODE_LABELS, baseKeysForType, extraKeysForType } from '../utils/learningModes'

function toggleStyle(active) {
  return {
    padding: '4px 10px',
    borderRadius: RADIUS.sm,
    border: `1px solid ${active ? COLORS.primary : COLORS.border}`,
    background: active ? COLORS.primarySoft : COLORS.bg,
    color: active ? COLORS.accentText : COLORS.textSecondary,
    fontWeight: 700,
    fontSize: 11,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

/**
 * @param {{
 *   setType: string
 *   modes: Record<string, boolean>
 *   requiredByMode: Record<string, boolean>
 *   passScore: number
 *   maxAttempts: number
 *   hasImageWords?: boolean
 *   onToggleMode: (key: string) => void
 *   onRequiredChange: (key: string, required: boolean) => void
 *   onPassScoreChange: (n: number) => void
 *   onMaxAttemptsChange: (n: number) => void
 * }} props
 */
export default function LearningModesPicker({
  setType,
  modes,
  requiredByMode,
  passScore,
  maxAttempts,
  hasImageWords,
  onToggleMode,
  onRequiredChange,
  onPassScoreChange,
  onMaxAttemptsChange,
}) {
  const baseKeys = useMemo(() => baseKeysForType(setType), [setType])
  const extraKeys = useMemo(() => extraKeysForType(setType), [setType])

  const row = (key) => {
    const checked = !!modes[key]
    const req = !!requiredByMode[key]
    return (
      <div
        key={key}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 0,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, minWidth: 0 }}>
            <input type="checkbox" checked={checked} onChange={() => onToggleMode(key)} />
            {MODE_LABELS[key]}
          </label>
          {checked ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: COLORS.textSecondary }}>학습</span>
              <button type="button" onClick={() => onRequiredChange(key, true)} style={toggleStyle(req)}>
                ● 필수
              </button>
              <button type="button" onClick={() => onRequiredChange(key, false)} style={toggleStyle(!req)}>
                ○ 선택
              </button>
            </div>
          ) : null}
        </div>
        {key === 'image' ? (
          <span style={{ fontSize: 11, color: COLORS.textHint, marginLeft: 24, marginBottom: 8 }}>
            {hasImageWords ? '단어에 이미지가 있으면 앱에서 사용할 수 있어요.' : 'image_url이 있는 단어가 있을 때 앱에서 활성화돼요.'}
          </span>
        ) : null}
        {key === 'test' && checked ? (
          <div
            style={{
              marginLeft: 24,
              marginBottom: 10,
              padding: '10px 12px',
              borderRadius: RADIUS.md,
              border: `1px dashed ${COLORS.border}`,
              background: COLORS.bg,
              display: 'grid',
              gap: 10,
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, fontWeight: 600 }}>
              <span style={{ color: COLORS.textSecondary }}>통과 기준:</span>
              <input
                type="number"
                min={0}
                max={100}
                value={passScore}
                onChange={(e) => onPassScoreChange(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                style={{ width: 64, padding: 6, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}
              />
              <span>점 이상</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, fontWeight: 600 }}>
              <span style={{ color: COLORS.textSecondary }}>최대 시도:</span>
              <input
                type="number"
                min={1}
                max={99}
                value={maxAttempts}
                onChange={(e) => onMaxAttemptsChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ width: 64, padding: 6, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}
              />
              <span>회</span>
            </label>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.accentText, marginBottom: 10 }}>기본 (자동 추천)</div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          marginBottom: 14,
          padding: '12px 14px',
          borderRadius: RADIUS.md,
          border: `1px solid ${COLORS.border}`,
          background: COLORS.primarySoft,
        }}
      >
        {baseKeys.map((key) => row(key))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.accentText, marginBottom: 10 }}>추가 선택</div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          marginBottom: 8,
          padding: '12px 14px',
          borderRadius: RADIUS.md,
          border: `1px solid ${COLORS.border}`,
          background: COLORS.bg,
        }}
      >
        {extraKeys.map((key) => row(key))}
      </div>
    </>
  )
}
