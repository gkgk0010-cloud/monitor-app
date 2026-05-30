'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS } from '@/utils/tokens'

const COUNT_OPTIONS = [
  { value: '', label: '학생 선택' },
  { value: '20', label: '20문항' },
  { value: '50', label: '50문항' },
  { value: '100', label: '100문항' },
  { value: '0', label: '전체' },
]

function clampDailyMin(raw) {
  const n = Math.floor(Number(raw))
  if (Number.isNaN(n)) return 20
  return Math.min(500, Math.max(1, n))
}

/**
 * 족보 기본 문항수 · 일일 인증 최소 문항 — teachers 테이블
 */
export default function JogboSettingsSection({
  teacherId,
  defaultJogboQuestionCount,
  jogboDailyCompleteMinQuestions,
  onSaved,
}) {
  const [countSelect, setCountSelect] = useState('')
  const [dailyMinInput, setDailyMinInput] = useState('20')
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState(null)

  useEffect(() => {
    if (defaultJogboQuestionCount == null || defaultJogboQuestionCount === '') {
      setCountSelect('')
      return
    }
    const n = Number(defaultJogboQuestionCount)
    if (n === 0) setCountSelect('0')
    else setCountSelect(String(n))
  }, [teacherId, defaultJogboQuestionCount])

  useEffect(() => {
    const q =
      jogboDailyCompleteMinQuestions != null && jogboDailyCompleteMinQuestions !== ''
        ? clampDailyMin(jogboDailyCompleteMinQuestions)
        : 20
    setDailyMinInput(String(q))
  }, [teacherId, jogboDailyCompleteMinQuestions])

  const handleSave = useCallback(async () => {
    if (!teacherId) return
    setSaving(true)
    setStatusMsg(null)
    let countVal = null
    if (countSelect === '0') countVal = 0
    else if (countSelect !== '') countVal = parseInt(countSelect, 10)
    const dailyMin = clampDailyMin(dailyMinInput)
    const { error } = await supabase
      .from('teachers')
      .update({
        default_jogbo_question_count: countVal,
        jogbo_daily_complete_min_questions: dailyMin,
      })
      .eq('id', teacherId)
    setSaving(false)
    if (error) {
      console.warn('[JogboSettings]', error.message)
      setStatusMsg('저장 실패: ' + error.message)
      return
    }
    setStatusMsg('저장되었습니다.')
    onSaved?.()
  }, [teacherId, countSelect, dailyMinInput, onSaved])

  return (
    <section
      aria-label="족보 설정"
      style={{
        marginTop: 24,
        padding: 20,
        borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 16px', color: COLORS.textPrimary }}>
        족보 설정
      </h2>

      <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8, color: COLORS.textPrimary }}>
        기본 문항수
      </label>
      <select
        value={countSelect}
        onChange={(e) => setCountSelect(e.target.value)}
        style={{
          width: '100%',
          maxWidth: 280,
          padding: '10px 12px',
          borderRadius: RADIUS.md,
          border: `1px solid ${COLORS.border}`,
          fontSize: 15,
          marginBottom: 16,
        }}
      >
        {COUNT_OPTIONS.map((opt) => (
          <option key={opt.value || 'student'} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 20px', lineHeight: 1.5 }}>
        「학생 선택」이면 학습 시작 화면에서 학생이 직접 고릅니다.
      </p>

      <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8, color: COLORS.textPrimary }}>
        오늘 학습 인증 최소 문항수
      </label>
      <input
        type="number"
        min={1}
        max={500}
        value={dailyMinInput}
        onChange={(e) => setDailyMinInput(e.target.value)}
        style={{
          width: 120,
          padding: '10px 12px',
          borderRadius: RADIUS.md,
          border: `1px solid ${COLORS.border}`,
          fontSize: 15,
        }}
      />
      <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '8px 0 20px', lineHeight: 1.5 }}>
        홈 화면 「오늘 ✅」 인증에 필요한 최소 풀이 문항 수입니다. (기본 20)
      </p>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        style={{
          padding: '12px 24px',
          borderRadius: RADIUS.md,
          border: 'none',
          background: COLORS.primary,
          color: COLORS.textOnGreen,
          fontWeight: 700,
          fontSize: 15,
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? '저장 중…' : '족보 설정 저장'}
      </button>
      {statusMsg ? (
        <p style={{ marginTop: 12, fontSize: 14, color: COLORS.textSecondary }}>{statusMsg}</p>
      ) : null}
    </section>
  )
}
