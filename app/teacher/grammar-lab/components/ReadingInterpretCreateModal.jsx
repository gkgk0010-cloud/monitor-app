'use client'

import { useEffect, useState } from 'react'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onSubmit: (values: { set_name: string, description: string | null }) => Promise<void> | void,
 *   initial?: object | null,
 *   saving?: boolean,
 * }} props
 */
export default function ReadingInterpretCreateModal({ open, onClose, onSubmit, initial = null, saving = false }) {
  const isEdit = Boolean(initial?.id)
  const [setName, setSetName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (!open) return
    setSetName(String(initial?.set_name ?? ''))
    setDescription(String(initial?.description ?? ''))
  }, [open, initial])

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    const sn = String(setName).trim()
    if (!sn) {
      alert('세트명을 입력하세요.')
      return
    }
    await onSubmit({
      set_name: sn,
      description: String(description).trim() || null,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={() => {
        if (!saving) onClose()
      }}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          padding: '22px 24px',
          borderRadius: RADIUS.lg,
          background: COLORS.surface,
          boxShadow: SHADOW.modal,
        }}
      >
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: COLORS.textPrimary }}>
          {isEdit ? '독해해석 세트 편집' : '새 독해해석 세트'}
        </h2>

        <label style={labelStyle}>
          세트명 <span style={{ color: COLORS.danger }}>*</span>
          <input value={setName} onChange={(e) => setSetName(e.target.value)} required style={inputStyle} />
        </label>

        <label style={labelStyle}>
          설명
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="선택 사항"
          />
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onClose} disabled={saving} style={secondaryBtn}>
            취소
          </button>
          <button type="submit" disabled={saving} style={primaryBtn}>
            {saving ? '저장 중…' : isEdit ? '저장' : '만들기'}
          </button>
        </div>
      </form>
    </div>
  )
}

const labelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 14,
  fontWeight: 700,
  color: COLORS.textPrimary,
  marginBottom: 12,
}

const inputStyle = {
  padding: '10px 12px',
  borderRadius: RADIUS.md,
  border: `1px solid ${COLORS.border}`,
  fontSize: 14,
  fontWeight: 500,
}

const primaryBtn = {
  padding: '10px 18px',
  borderRadius: RADIUS.md,
  border: 'none',
  background: COLORS.primary,
  color: COLORS.textOnGreen,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 14,
}

const secondaryBtn = {
  padding: '10px 18px',
  borderRadius: RADIUS.md,
  border: `1px solid ${COLORS.border}`,
  background: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 14,
}
