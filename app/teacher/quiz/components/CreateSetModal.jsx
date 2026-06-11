'use client'

import { useEffect, useState } from 'react'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import {
  DEFAULT_RANDOM_ORDER,
  DEFAULT_TIME_LIMIT_SECONDS,
  QUIZ_CATEGORIES,
  QUIZ_CATEGORY_LABELS,
} from '../utils/quizCategories'

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onSubmit: (values: object) => Promise<void> | void,
 *   initial?: object | null,
 *   defaultCategory?: string,
 *   saving?: boolean,
 * }} props
 */
export default function CreateSetModal({
  open,
  onClose,
  onSubmit,
  initial = null,
  defaultCategory = 'reading',
  saving = false,
}) {
  const isEdit = Boolean(initial?.id)
  const [setName, setSetName] = useState('')
  const [description, setDescription] = useState('')
  const [quizCategory, setQuizCategory] = useState(defaultCategory)
  const [timeLimit, setTimeLimit] = useState(DEFAULT_TIME_LIMIT_SECONDS)
  const [randomOrder, setRandomOrder] = useState(DEFAULT_RANDOM_ORDER)

  useEffect(() => {
    if (!open) return
    setSetName(String(initial?.set_name ?? ''))
    setDescription(String(initial?.description ?? ''))
    setQuizCategory(initial?.quiz_category || defaultCategory)
    setTimeLimit(initial?.time_limit_seconds ?? DEFAULT_TIME_LIMIT_SECONDS)
    setRandomOrder(initial?.random_order ?? DEFAULT_RANDOM_ORDER)
  }, [open, initial, defaultCategory])

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    const sn = String(setName).trim()
    if (!sn) {
      alert('세트명을 입력하세요.')
      return
    }
    const sec = parseInt(String(timeLimit), 10)
    if (!Number.isFinite(sec) || sec < 1) {
      alert('시간 제한은 1초 이상이어야 합니다.')
      return
    }
    await onSubmit({
      set_name: sn,
      description: String(description).trim() || null,
      quiz_category: quizCategory,
      time_limit_seconds: sec,
      random_order: randomOrder,
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
          {isEdit ? '세트 편집' : '새 세트 만들기'}
        </h2>

        <label style={labelStyle}>
          세트명 <span style={{ color: COLORS.danger }}>*</span>
          <input
            value={setName}
            onChange={(e) => setSetName(e.target.value)}
            required
            style={inputStyle}
            placeholder="예: 패러프레이징 연습 세트 1"
          />
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

        <label style={labelStyle}>
          유형
          <select
            value={quizCategory}
            onChange={(e) => setQuizCategory(e.target.value)}
            disabled={isEdit}
            style={inputStyle}
          >
            {QUIZ_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {QUIZ_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          시간 제한 (초)
          <input
            type="number"
            min={1}
            value={timeLimit}
            onChange={(e) => setTimeLimit(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={randomOrder}
            onChange={(e) => setRandomOrder(e.target.checked)}
          />
          순서 랜덤
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
