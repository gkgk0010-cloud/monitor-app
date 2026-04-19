'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { subscribeToast } from '@/utils/toastBus'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'

/**
 * document.body에 고정 토스트 — z-index/overflow 이슈 없음.
 */
export default function TeacherToastPortal() {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  const onEmit = useCallback((payload) => {
    setToast({ message: payload.message, type: payload.type })
    if (timerRef.current) clearTimeout(timerRef.current)
    const ms = typeof payload.durationMs === 'number' ? payload.durationMs : 2500
    timerRef.current = setTimeout(() => {
      setToast(null)
      timerRef.current = null
    }, ms)
  }, [])

  useEffect(() => {
    return subscribeToast(onEmit)
  }, [onEmit])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (typeof document === 'undefined' || !toast) return null

  const isError = toast.type === 'error'
  const el = (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        top: 'max(16px, env(safe-area-inset-top, 0px))',
        transform: 'translateX(-50%)',
        zIndex: 2147483647,
        maxWidth: 'min(92vw, 440px)',
        padding: '12px 18px',
        borderRadius: RADIUS.md,
        boxShadow: SHADOW.modal,
        fontSize: 14,
        fontWeight: 700,
        lineHeight: 1.45,
        textAlign: 'center',
        pointerEvents: 'none',
        animation: 'monitor-toast-in 0.22s ease',
        background: isError ? COLORS.dangerBg : '#ecfdf5',
        color: isError ? COLORS.danger : '#15803d',
        border: `1px solid ${isError ? COLORS.danger : '#86efac'}`,
        wordBreak: 'break-word',
      }}
    >
      {toast.message}
    </div>
  )

  return createPortal(el, document.body)
}
