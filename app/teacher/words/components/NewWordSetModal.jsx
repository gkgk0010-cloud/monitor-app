'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'

/** DB·단어앱과 맞출 모드 키 (영문 스네이크) */
const ALL_MODE_KEYS = [
  'flashcard',
  'matching',
  'recall',
  'writing',
  'image',
  'readAloud',
  'shadowing',
  'listening',
  'scramble',
  'dictation',
  'composition',
]

const MODE_LABELS = {
  flashcard: '암기',
  matching: '매칭',
  recall: '리콜',
  writing: '라이팅',
  image: '이미지',
  readAloud: '낭독',
  shadowing: '쉐도잉',
  listening: '집중듣기',
  scramble: '스크램블',
  dictation: '딕테이션',
  composition: '입영작',
}

/** 세트 타입별 자동 추천 (STEP 2 기본 구역) */
const DEFAULT_MODES_BY_TYPE = {
  word: ['flashcard', 'matching', 'recall', 'writing'],
  sentence: ['readAloud', 'shadowing', 'scramble', 'dictation'],
  image: ['image', 'flashcard', 'matching'],
}

const SET_TYPE_OPTIONS = [
  {
    id: 'word',
    label: '단어 세트',
    hint: 'word + meaning 중심',
  },
  {
    id: 'sentence',
    label: '문장 세트',
    hint: 'example_sentence 중심',
  },
  {
    id: 'image',
    label: '이미지 세트',
    hint: 'image_url 중심',
  },
]

function modesRecordFromDefaults(setType) {
  const defaults = new Set(DEFAULT_MODES_BY_TYPE[setType] || DEFAULT_MODES_BY_TYPE.word)
  const o = {}
  for (const k of ALL_MODE_KEYS) {
    o[k] = defaults.has(k)
  }
  return o
}

function baseKeysForType(setType) {
  return DEFAULT_MODES_BY_TYPE[setType] || DEFAULT_MODES_BY_TYPE.word
}

function extraKeysForType(setType) {
  const base = new Set(baseKeysForType(setType))
  return ALL_MODE_KEYS.filter((k) => !base.has(k))
}

/**
 * @param {{
 *   open: boolean
 *   onClose: () => void
 *   teacherId: string
 *   existingSetNames: string[]
 *   onSaved?: () => void
 *   hasImageWords?: boolean
 * }} props
 */
export default function NewWordSetModal({ open, onClose, teacherId, existingSetNames, onSaved, hasImageWords }) {
  const [step, setStep] = useState(1)
  const [setName, setSetName] = useState('')
  const [setType, setSetType] = useState('word')
  const [modes, setModes] = useState(() => modesRecordFromDefaults('word'))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep(1)
    setSetName('')
    setSetType('word')
    setModes(modesRecordFromDefaults('word'))
    setSaving(false)
  }, [open])

  const baseKeys = useMemo(() => baseKeysForType(setType), [setType])
  const extraKeys = useMemo(() => extraKeysForType(setType), [setType])

  const goNext = () => {
    const n = String(setName || '').trim()
    if (!n) {
      alert('세트 이름을 입력해 주세요.')
      return
    }
    if (existingSetNames.some((s) => String(s).trim() === n)) {
      alert('이미 같은 이름의 세트가 있습니다. 다른 이름을 사용해 주세요.')
      return
    }
    setModes(modesRecordFromDefaults(setType))
    setStep(2)
  }

  const toggleMode = (key) => {
    setModes((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleComplete = async () => {
    const n = String(setName || '').trim()
    const selected = ALL_MODE_KEYS.filter((k) => modes[k])
    if (selected.length === 0) {
      alert('학습 모드를 하나 이상 선택해 주세요.')
      return
    }
    if (!teacherId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('word_sets').insert({
        teacher_id: teacherId,
        name: n,
        set_type: setType,
        available_modes: selected,
      })
      if (error) {
        if (error.code === '23505' || /duplicate|unique/i.test(error.message)) {
          alert('같은 이름의 세트가 이미 있습니다.')
        } else {
          alert(`저장 실패: ${error.message}`)
        }
        return
      }
      onSaved?.()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-set-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflow: 'auto',
      }}
    >
      <div
        style={{
          width: 'min(440px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: COLORS.surface,
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.modal,
          padding: 24,
          boxSizing: 'border-box',
        }}
      >
        {step === 1 ? (
          <>
            <h2 id="new-set-modal-title" style={{ fontSize: 18, fontWeight: 800, color: COLORS.accentText, margin: '0 0 6px' }}>
              새 세트 만들기 <span style={{ fontWeight: 600, color: COLORS.textSecondary }}>(1/2)</span>
            </h2>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 18px' }}>기본 정보를 입력한 뒤 다음 단계에서 학습 모드를 고릅니다.</p>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
              세트 이름
            </label>
            <input
              type="text"
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              placeholder="예: 토익 RC Day1"
              autoComplete="off"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                fontSize: 15,
                marginBottom: 20,
                boxSizing: 'border-box',
              }}
            />

            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 10 }}>세트 타입</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {SET_TYPE_OPTIONS.map((opt) => {
                const active = setType === opt.id
                return (
                  <label
                    key={opt.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '12px 14px',
                      borderRadius: RADIUS.md,
                      border: active ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
                      background: active ? COLORS.primarySoft : COLORS.bg,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="set-type"
                      checked={active}
                      onChange={() => setSetType(opt.id)}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <span style={{ fontWeight: 700, color: COLORS.textPrimary }}>{opt.label}</span>
                      <span style={{ display: 'block', fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>{opt.hint}</span>
                    </span>
                  </label>
                )
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22, gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 16px',
                  borderRadius: RADIUS.md,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.bg,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={goNext}
                style={{
                  padding: '10px 18px',
                  borderRadius: RADIUS.md,
                  border: 'none',
                  background: COLORS.headerGradient,
                  color: COLORS.textOnGreen,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                다음 →
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="new-set-modal-title" style={{ fontSize: 18, fontWeight: 800, color: COLORS.accentText, margin: '0 0 6px' }}>
              학습 모드 선택 <span style={{ fontWeight: 600, color: COLORS.textSecondary }}>(2/2)</span>
            </h2>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 16px' }}>
              세트: <strong style={{ color: COLORS.textPrimary }}>{String(setName).trim() || '—'}</strong>
            </p>

            <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.accentText, marginBottom: 10 }}>기본 (자동 추천)</div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px 14px',
                marginBottom: 18,
                padding: '12px 14px',
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.primarySoft,
              }}
            >
              {baseKeys.map((key) => (
                <label key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  <input type="checkbox" checked={!!modes[key]} onChange={() => toggleMode(key)} />
                  {MODE_LABELS[key]}
                </label>
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.accentText, marginBottom: 10 }}>추가 선택</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px 12px',
                marginBottom: 12,
                padding: '12px 14px',
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.bg,
              }}
            >
              {extraKeys.map((key) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  <input type="checkbox" checked={!!modes[key]} onChange={() => toggleMode(key)} />
                  <span>
                    {MODE_LABELS[key]}
                    {key === 'image' ? (
                      <span style={{ display: 'block', fontSize: 11, color: COLORS.textHint, marginTop: 2 }}>
                        {hasImageWords ? '단어에 이미지가 있으면 앱에서 사용할 수 있어요.' : 'image_url이 있는 단어가 있을 때 앱에서 활성화돼요.'}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22, gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  padding: '10px 16px',
                  borderRadius: RADIUS.md,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.bg,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                ← 이전
              </button>
              <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '10px 16px',
                    borderRadius: RADIUS.md,
                    border: `1px solid ${COLORS.border}`,
                    background: COLORS.surface,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleComplete()}
                  style={{
                    padding: '10px 18px',
                    borderRadius: RADIUS.md,
                    border: 'none',
                    background: COLORS.headerGradient,
                    color: COLORS.textOnGreen,
                    fontWeight: 700,
                    cursor: saving ? 'wait' : 'pointer',
                    opacity: saving ? 0.85 : 1,
                  }}
                >
                  {saving ? '저장 중…' : '완료'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
