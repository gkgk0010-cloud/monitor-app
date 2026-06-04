'use client'

import { COLORS, RADIUS } from '@/utils/tokens'
import { formatSaveProgressLabel, progressPercent } from '../utils/grammarLabBatchSave'

/**
 * @param {{ progress: { stage: string, current: number, total: number } | null }} props
 */
export default function SaveProgressOverlay({ progress }) {
  if (!progress?.total) return null
  const pct = progressPercent(progress.current, progress.total)
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
          minWidth: 300,
          maxWidth: 420,
          padding: '20px 24px',
          borderRadius: RADIUS.lg,
          background: COLORS.surface,
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
        }}
      >
        <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: COLORS.textPrimary }}>
          {formatSaveProgressLabel(progress)}
        </p>
        <progress
          value={progress.current}
          max={progress.total}
          style={{ display: 'block', width: '100%', marginTop: 12, height: 10 }}
        />
        <p style={{ margin: '8px 0 0', fontSize: 13, color: COLORS.textSecondary, textAlign: 'right' }}>
          {pct}%
        </p>
      </div>
    </div>
  )
}
