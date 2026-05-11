'use client'

import { useSyncExternalStore } from 'react'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import { subscribeTtsWarmupOverlay, getTtsWarmupOverlaySnapshot } from '@/utils/ttsWarmupOverlay'
import { cancelTeacherTtsPrefetchQueue } from '@/utils/ttsPrefetchRunner'

export default function TtsWarmupPortal() {
  const s = useSyncExternalStore(
    subscribeTtsWarmupOverlay,
    getTtsWarmupOverlaySnapshot,
    getTtsWarmupOverlaySnapshot,
  )

  if (!s.open) return null

  const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Google TTS 미리 생성 진행"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2400,
        background: 'rgba(20,20,40,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          borderRadius: RADIUS.xl,
          background: COLORS.surface,
          boxShadow: SHADOW.modal,
          padding: 22,
          boxSizing: 'border-box',
        }}
      >
        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 900, color: COLORS.accentText }}>{s.title}</h3>
        <p style={{ margin: '0 0 14px', fontSize: 14, color: COLORS.textSecondary, fontWeight: 600 }}>{s.subtitle}</p>

        <div style={{ height: 10, borderRadius: 8, background: COLORS.bg, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: COLORS.headerGradient, transition: 'width 160ms ease' }} />
        </div>

        <p style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 900, color: COLORS.textPrimary }}>
          {s.done}/{s.total}
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.55 }}>{s.costHint}</p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {s.phase === 'running' ? (
            <button
              type="button"
              onClick={() => cancelTeacherTtsPrefetchQueue()}
              style={{
                padding: '10px 16px',
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.bg,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              중단
            </button>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textSecondary }}>
              {s.phase === 'cancelled' ? '중단됨' : '완료'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
