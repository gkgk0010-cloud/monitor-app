'use client'

import { useEffect } from 'react'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'

const SUCCESS_EMERALD = '#10b981'

/**
 * 단어 세트 워크플로 — 액션 완료 후 다음 단계 안내용 공통 모달
 * @param {{
 *   open: boolean
 *   onClose: () => void
 *   title: string
 *   nextStepDescription: string
 *   nextStepLabel?: string
 *   primaryLabel: string
 *   onPrimary: () => void
 *   secondaryLabel: string
 *   onSecondary?: () => void
 * }} props
 */
export default function WorkflowSuccessModal({
  open,
  onClose,
  title,
  nextStepDescription,
  nextStepLabel = '다음 단계:',
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}) {
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
      aria-labelledby="workflow-success-title"
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
          width: 'min(400px, 100%)',
          maxWidth: '100%',
          maxHeight: 'min(90vh, 100%)',
          overflow: 'auto',
          background: COLORS.surface,
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.modal,
          padding: '22px 22px 20px',
          boxSizing: 'border-box',
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
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
            id="workflow-success-title"
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: COLORS.accentText,
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            {title}
          </h2>
        </div>

        <p
          style={{
            margin: '0 0 6px',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.02em',
            background: COLORS.headerGradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {nextStepLabel}
        </p>
        <p
          style={{
            margin: '0 0 20px',
            fontSize: 15,
            color: COLORS.textPrimary,
            lineHeight: 1.55,
            fontWeight: 500,
          }}
        >
          {nextStepDescription}
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={() => onPrimary()}
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
            {primaryLabel}
          </button>
          <button
            type="button"
            onClick={() => (onSecondary ? onSecondary() : onClose())}
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
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
