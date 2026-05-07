'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'

const DEFAULT_FALLBACK_SEC = 15

/**
 * 세트별 테스트 문항당 시간(초). 비우면 word_sets.test_time_per_word = NULL → 학원 기본.
 * @param {{
 *   open: boolean
 *   onClose: () => void
 *   wordSetId: string
 *   teacherId: string
 *   initialSeconds: number | null
 *   academyDefaultSeconds: number | null
 *   onSaved?: () => void
 * }} props
 */
export default function VocabTestTimeModal({
  open,
  onClose,
  wordSetId,
  teacherId,
  initialSeconds,
  academyDefaultSeconds,
  onSaved,
}) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setValue(
      initialSeconds != null && Number.isFinite(Number(initialSeconds)) && Number(initialSeconds) > 0
        ? String(Math.floor(Number(initialSeconds)))
        : '',
    )
  }, [open, initialSeconds])

  const save = useCallback(async () => {
    if (!wordSetId || !teacherId) return
    const t = String(value || '').trim()
    let payload = null
    if (t !== '') {
      const n = parseInt(t, 10)
      if (!Number.isFinite(n) || n < 1 || n > 600) {
        setError('1~600초 사이로 입력하거나 비워 주세요.')
        return
      }
      payload = n
    }
    setSaving(true)
    setError('')
    try {
      const { error: e } = await supabase
        .from('word_sets')
        .update({ test_time_per_word: payload })
        .eq('id', wordSetId)
        .eq('teacher_id', teacherId)
      if (e) throw new Error(e.message)
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [value, wordSetId, teacherId, onSaved, onClose])

  if (!open) return null

  const effectiveAcademy =
    academyDefaultSeconds != null &&
    Number.isFinite(Number(academyDefaultSeconds)) &&
    Number(academyDefaultSeconds) > 0
      ? Math.floor(Number(academyDefaultSeconds))
      : DEFAULT_FALLBACK_SEC

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vocab-test-time-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          background: COLORS.surface,
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.modal,
          padding: 22,
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="vocab-test-time-title" style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 800, color: COLORS.accentText }}>
          테스트 설정
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.55 }}>
          객관식 테스트의 <strong>문항당 제한 시간</strong>입니다. 비워 두면 학원 기본({effectiveAcademy}초)을 씁니다. 학원 기본도 없으면 학생 앱에서{' '}
          {DEFAULT_FALLBACK_SEC}초입니다.
        </p>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
          테스트 시간 (초)
        </label>
        <input
          type="number"
          min={1}
          max={600}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="비우면 학원 기본값 사용"
          disabled={saving}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 15,
            borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.border}`,
            boxSizing: 'border-box',
            marginBottom: 12,
          }}
        />
        {error ? (
          <p style={{ color: COLORS.danger, fontSize: 13, margin: '0 0 12px' }} role="alert">
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
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
            취소
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            style={{
              padding: '10px 18px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: COLORS.headerGradient,
              color: COLORS.textOnGreen,
              fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
