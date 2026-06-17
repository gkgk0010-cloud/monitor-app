'use client'

import { useEffect, useState } from 'react'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'

const INTERPRET_TYPE_PRESETS = {
  custom: { hint_tone: '', awkward_guide: '' },
  abstract_noun: {
    hint_tone: '추상명사를 동사로 풀어보세요',
    awkward_guide: '명사 직역, 영어 어순',
  },
  passive: {
    hint_tone: '능동으로 자연스럽게',
    awkward_guide: '~받고 있다, ~에 의해',
  },
  sentence_question: {
    hint_tone:
      '끊어읽기(박스) 순서대로, 의문사 덩어리를 명사로 잡고 푸세요. 예: Who approved the budget → 승인한 사람은? / 예산을?',
    awkward_guide:
      '[끊어읽기모드] 영어 어순 무시하고 한 문장으로 합치기 / 의문사 덩어리를 명사화 안 하고 \'누가 ~했나요?\'로 풀어쓰기 / 박스 의미단위(누가·무엇을·언제) 누락',
  },
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onSubmit: (values: {
 *     set_name: string,
 *     description: string | null,
 *     hint_tone: string | null,
 *     awkward_guide: string | null,
 *   }) => Promise<void> | void,
 *   initial?: object | null,
 *   saving?: boolean,
 * }} props
 */
export default function ReadingInterpretCreateModal({ open, onClose, onSubmit, initial = null, saving = false }) {
  const isEdit = Boolean(initial?.id)
  const [setName, setSetName] = useState('')
  const [description, setDescription] = useState('')
  const [interpretType, setInterpretType] = useState('custom')
  const [hintTone, setHintTone] = useState('')
  const [awkwardGuide, setAwkwardGuide] = useState('')

  useEffect(() => {
    if (!open) return
    setSetName(String(initial?.set_name ?? ''))
    setDescription(String(initial?.description ?? ''))
    setHintTone(String(initial?.hint_tone ?? ''))
    setAwkwardGuide(String(initial?.awkward_guide ?? ''))
    setInterpretType('custom')
  }, [open, initial])

  const handleTypeChange = (type) => {
    setInterpretType(type)
    const preset = INTERPRET_TYPE_PRESETS[type]
    if (preset && type !== 'custom') {
      setHintTone(preset.hint_tone)
      setAwkwardGuide(preset.awkward_guide)
    }
  }

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
      hint_tone: String(hintTone).trim() || null,
      awkward_guide: String(awkwardGuide).trim() || null,
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
          maxWidth: 520,
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

        <label style={labelStyle}>
          해석 유형 (프리셋)
          <select value={interpretType} onChange={(e) => handleTypeChange(e.target.value)} style={inputStyle}>
            <option value="custom">직접 입력</option>
            <option value="abstract_noun">추상명사 (abstract_noun)</option>
            <option value="passive">수동태 (passive)</option>
            <option value="sentence_question">끊어읽기 (sentence_question)</option>
          </select>
        </label>

        <label style={labelStyle}>
          힌트 톤 (AI)
          <input
            value={hintTone}
            onChange={(e) => setHintTone(e.target.value)}
            style={inputStyle}
            placeholder="예: 핵심 표현을 자연스럽게 풀어보세요"
          />
        </label>

        <label style={labelStyle}>
          어색 패턴 가이드 (AI)
          <input
            value={awkwardGuide}
            onChange={(e) => setAwkwardGuide(e.target.value)}
            style={inputStyle}
            placeholder="예: 영어 어순 직역, 명사 직역"
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
