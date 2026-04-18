'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import {
  ALL_MODE_KEYS,
  initModesStateForType,
  buildAvailableModesJson,
  defaultRequiredForBaseKeys,
} from '../utils/learningModes'
import LearningModesPicker from './LearningModesPicker'

const SET_TYPE_OPTIONS = [
  { id: 'word', label: '단어 세트', hint: 'word + meaning 중심' },
  { id: 'sentence', label: '문장 세트', hint: 'example_sentence 중심' },
  { id: 'image', label: '이미지 세트', hint: 'image_url 중심' },
]

/**
 * @param {{
 *   open: boolean
 *   onClose: () => void
 *   teacherId: string
 *   existingSetNames: string[]
 *   onSaved?: (payload: { name: string; setType: string }) => void
 *   hasImageWords?: boolean
 * }} props
 */
export default function NewWordSetModal({ open, onClose, teacherId, existingSetNames, onSaved, hasImageWords }) {
  const [step, setStep] = useState(1)
  const [setName, setSetName] = useState('')
  const [setType, setSetType] = useState('word')
  const [modes, setModes] = useState(() => initModesStateForType('word').modes)
  const [requiredByMode, setRequiredByMode] = useState(() => initModesStateForType('word').requiredByMode)
  const [passScore, setPassScore] = useState(80)
  const [maxAttempts, setMaxAttempts] = useState(3)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep(1)
    setSetName('')
    setSetType('word')
    const init = initModesStateForType('word')
    setModes(init.modes)
    setRequiredByMode(init.requiredByMode)
    setPassScore(init.passScore)
    setMaxAttempts(init.maxAttempts)
    setSaving(false)
  }, [open])

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
    const init = initModesStateForType(setType)
    setModes(init.modes)
    setRequiredByMode(init.requiredByMode)
    setPassScore(init.passScore)
    setMaxAttempts(init.maxAttempts)
    setStep(2)
  }

  const handleToggleMode = (key) => {
    setModes((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      if (next[key]) {
        setRequiredByMode((r) => ({
          ...r,
          [key]: defaultRequiredForBaseKeys(setType)[key] ?? false,
        }))
      }
      return next
    })
  }

  const handleComplete = async () => {
    const n = String(setName || '').trim()
    const selected = ALL_MODE_KEYS.filter((k) => modes[k])
    const availableModes = buildAvailableModesJson(modes, requiredByMode, passScore, maxAttempts)

    if (selected.length === 0) {
      alert('학습 모드를 하나 이상 선택해 주세요.')
      return
    }
    if (!teacherId) {
      alert('선생님 정보를 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.')
      return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('word_sets')
        .insert({
          teacher_id: teacherId,
          name: n,
          set_type: setType,
          available_modes: availableModes,
        })
        .select('id')
        .maybeSingle()

      if (error) {
        console.error('[word_sets] insert 실패', error)
        if (error.code === '42P01' || /relation ["']?word_sets["']? does not exist/i.test(String(error.message))) {
          alert(
            'word_sets 테이블을 찾을 수 없습니다.\nSupabase에 supabase/snippets/word_sets.sql 스키마를 적용했는지 확인해 주세요.',
          )
        } else if (error.code === '23505' || /duplicate|unique/i.test(error.message)) {
          alert('같은 이름의 세트가 이미 있습니다.')
        } else {
          alert(`저장 실패: ${error.message}`)
        }
        return
      }

      const wordSetId = data?.id
      if (wordSetId && modes.test) {
        const { error: e2 } = await supabase.from('vocab_test_settings').upsert(
          {
            word_set_id: wordSetId,
            pass_score: Math.min(100, Math.max(0, Math.round(Number(passScore) || 80))),
            max_attempts: Math.max(1, Math.round(Number(maxAttempts) || 3)),
          },
          { onConflict: 'word_set_id' },
        )
        if (e2) {
          console.warn('[vocab_test_settings] 저장 실패 (테이블·RLS 확인):', e2.message)
        }
      }

      onClose()
      try {
        onSaved?.({ name: n, setType })
      } catch (e) {
        console.error('[NewWordSetModal] onSaved 콜백 오류', e)
      }
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
          width: 'min(480px, 100%)',
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
                    <input type="radio" name="set-type" checked={active} onChange={() => setSetType(opt.id)} style={{ marginTop: 3 }} />
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

            <LearningModesPicker
              setType={setType}
              modes={modes}
              requiredByMode={requiredByMode}
              passScore={passScore}
              maxAttempts={maxAttempts}
              hasImageWords={hasImageWords}
              onToggleMode={handleToggleMode}
              onRequiredChange={(key, required) => setRequiredByMode((r) => ({ ...r, [key]: required }))}
              onPassScoreChange={setPassScore}
              onMaxAttemptsChange={setMaxAttempts}
            />

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
