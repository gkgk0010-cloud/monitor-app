'use client'

import { COLORS, RADIUS } from '@/utils/tokens'
import { formatSaveProgressLabel, progressPercent } from '../utils/grammarLabBatchSave'

/**
 * @param {{ progress: { done: number, total: number, phase: 'items' | 'boxes' } | null }} props
 */
export default function SaveProgressOverlay({ progress }) {
  if (!progress?.total) return null
  const pct = progressPercent(progress.done, progress.total)
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15,23,42,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          minWidth: 280,
          maxWidth: 400,
          padding: '20px 24px',
          borderRadius: RADIUS.lg,
          background: COLORS.surface,
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
        }}
      >
        <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>
          {formatSaveProgressLabel(progress)}
        </p>
        <div
          style={{
            marginTop: 12,
            height: 8,
            borderRadius: 4,
            background: '#e2e8f0',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: COLORS.primary,
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      </div>
    </div>
  )
}
