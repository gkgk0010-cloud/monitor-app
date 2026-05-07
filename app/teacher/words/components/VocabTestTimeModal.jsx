'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'

const DEFAULT_FALLBACK_SEC = 15

const QTYPE_KEYS = [
  { key: 'word_to_meaning', label: '단어 → 뜻' },
  { key: 'meaning_to_word', label: '뜻 → 단어' },
  { key: 'image_to_word', label: '이미지 → 단어' },
]

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeQuestionTypes(raw) {
  const allow = new Set(QTYPE_KEYS.map((x) => x.key))
  if (raw == null) return ['word_to_meaning']
  const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\s]+/) : []
  const next = arr.map((x) => String(x).trim()).filter((k) => allow.has(k))
  return next.length > 0 ? next : ['word_to_meaning']
}

/**
 * 세트별 객관식 테스트 규칙 + 문항당 시간.B
 * @param {{
 *   open: boolean
 *   onClose: () => void
 *   wordSetId: string
 *   teacherId: string
 *   initialSeconds: number | null
 *   academyDefaultSeconds: number | null
 *   academyDefaults: {
 *     questionCount: number | null
 *     passScore: number | null
 *     maxAttempts: number | null
 *     questionTypes: string[] | null
 *   }
 *   hasImageWords?: boolean
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
  academyDefaults,
  hasImageWords = false,
  onSaved,
}) {
  const [loading, setLoading] = useState(false)
  const [secondsStr, setSecondsStr] = useState('')
  const [questionCountStr, setQuestionCountStr] = useState('0')
  const [passScoreStr, setPassScoreStr] = useState('70')
  const [maxAttemptsStr, setMaxAttemptsStr] = useState('3')
  const [questionTypes, setQuestionTypes] = useState(() => ['word_to_meaning'])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const academyQ = academyDefaults ?? {}
  const defaultQCount =
    academyQ.questionCount != null && academyQ.questionCount !== ''
      ? Math.min(100, Math.max(0, Math.floor(Number(academyQ.questionCount))))
      : 0
  const defaultPass =
    academyQ.passScore != null && academyQ.passScore !== ''
      ? Math.min(100, Math.max(0, Math.floor(Number(academyQ.passScore))))
      : 70
  const defaultAttempts =
    academyQ.maxAttempts != null && academyQ.maxAttempts !== ''
      ? Math.max(1, Math.floor(Number(academyQ.maxAttempts)))
      : 3
  const qtKey = Array.isArray(academyQ.questionTypes) ? academyQ.questionTypes.join(',') : String(academyQ.questionTypes ?? '')
  const defaultTypes = useMemo(() => normalizeQuestionTypes(academyQ.questionTypes), [qtKey])

  useEffect(() => {
    if (!open || !wordSetId || !teacherId) return
    let cancelled = false

    const applyBaseline = () => {
      setError('')
      setSecondsStr(
        initialSeconds != null && Number.isFinite(Number(initialSeconds)) && Number(initialSeconds) > 0
          ? String(Math.floor(Number(initialSeconds)))
          : '',
      )
      setQuestionCountStr(String(defaultQCount))
      setPassScoreStr(String(defaultPass))
      setMaxAttemptsStr(String(defaultAttempts))
      setQuestionTypes([...defaultTypes])
    }

    ;(async () => {
      setLoading(true)
      applyBaseline()
      try {
        const { data: row, error: qe } = await supabase
          .from('vocab_test_settings')
          .select('question_count, pass_score, max_attempts, test_question_types')
          .eq('word_set_id', wordSetId)
          .maybeSingle()
        if (cancelled) return
        if (qe) {
          console.warn('[VocabTestTimeModal] vocab_test_settings', qe.message)
          return
        }
        if (row) {
          const qc =
            row.question_count != null && row.question_count !== ''
              ? Math.min(100, Math.max(0, Math.floor(Number(row.question_count))))
              : defaultQCount
          const ps =
            row.pass_score != null && row.pass_score !== ''
              ? Math.min(100, Math.max(0, Math.floor(Number(row.pass_score))))
              : defaultPass
          const ma =
            row.max_attempts != null && row.max_attempts !== ''
              ? Math.max(1, Math.floor(Number(row.max_attempts)))
              : defaultAttempts
          setQuestionCountStr(String(Number.isFinite(qc) ? qc : defaultQCount))
          setPassScoreStr(String(Number.isFinite(ps) ? ps : defaultPass))
          setMaxAttemptsStr(String(Number.isFinite(ma) ? ma : defaultAttempts))
          setQuestionTypes(normalizeQuestionTypes(row.test_question_types ?? defaultTypes))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    open,
    wordSetId,
    teacherId,
    initialSeconds,
    defaultQCount,
    defaultPass,
    defaultAttempts,
    defaultTypes,
  ])

  const save = useCallback(async () => {
    if (!wordSetId || !teacherId) return
    const t = String(secondsStr || '').trim()
    let testTimePayload = null
    if (t !== '') {
      const n = parseInt(t, 10)
      if (!Number.isFinite(n) || n < 1 || n > 600) {
        setError('문항당 시간은 1~600초이거나 비워 학원 기본을 씁니다.')
        return
      }
      testTimePayload = n
    }

    const qcRaw = String(questionCountStr || '').trim()
    const qc = qcRaw === '' ? defaultQCount : parseInt(qcRaw, 10)
    if (!Number.isFinite(qc) || qc < 0 || qc > 100) {
      setError('문항 수는 0(해당 Day 전체)~100 또는 비워 학원 기본입니다.')
      return
    }

    const psRaw = String(passScoreStr || '').trim()
    const ps = psRaw === '' ? defaultPass : parseInt(psRaw, 10)
    if (!Number.isFinite(ps) || ps < 0 || ps > 100) {
      setError('통과 점수는 0~100%입니다.')
      return
    }

    const maRaw = String(maxAttemptsStr || '').trim()
    const ma = maRaw === '' ? defaultAttempts : parseInt(maRaw, 10)
    if (!Number.isFinite(ma) || ma < 1 || ma > 99) {
      setError('최대 시도는 1~99회입니다.')
      return
    }

    const allow = new Set(QTYPE_KEYS.map((x) => x.key))
    const tqt = (questionTypes || []).map(String).filter((k) => allow.has(k))
    const tqtFinal = tqt.length > 0 ? tqt : ['word_to_meaning']

    setSaving(true)
    setError('')
    try {
      const { error: e1 } = await supabase
        .from('word_sets')
        .update({ test_time_per_word: testTimePayload })
        .eq('id', wordSetId)
        .eq('teacher_id', teacherId)
      if (e1) throw new Error(e1.message)

      const { error: e2 } = await supabase.from('vocab_test_settings').upsert(
        {
          word_set_id: wordSetId,
          question_count: Math.min(100, Math.max(0, qc)),
          pass_score: Math.min(100, Math.max(0, ps)),
          max_attempts: Math.max(1, ma),
          test_question_types: tqtFinal,
        },
        { onConflict: 'word_set_id' },
      )
      if (e2) throw new Error(e2.message)

      onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [
    secondsStr,
    questionCountStr,
    passScoreStr,
    maxAttemptsStr,
    questionTypes,
    wordSetId,
    teacherId,
    defaultQCount,
    defaultPass,
    defaultAttempts,
    onSaved,
    onClose,
  ])

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
      onClick={(e) => e.target === e.currentTarget && !saving && !loading && onClose()}
    >
      <div
        style={{
          width: 'min(460px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
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
          학생 앱·루틴 통과 판정에 쓰는 <strong>단일 규칙</strong>입니다. 비운 항목은 학원 기본값을 따릅니다(문항당 시간만 비우면 학원{' '}
          {effectiveAcademy}초, 학원도 없으면 {DEFAULT_FALLBACK_SEC}초).
        </p>

        {loading ? (
          <p style={{ color: COLORS.textSecondary, fontSize: 13 }}>불러오는 중…</p>
        ) : (
          <>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
              문항당 제한 시간 (초)
            </label>
            <input
              type="number"
              min={1}
              max={600}
              value={secondsStr}
              onChange={(e) => setSecondsStr(e.target.value)}
              placeholder="비우면 학원 기본"
              disabled={saving}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 15,
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                boxSizing: 'border-box',
                marginBottom: 14,
              }}
            />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
              출제 문항 수 (0 = 해당 Day 단어 전체)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={questionCountStr}
              onChange={(e) => setQuestionCountStr(e.target.value)}
              placeholder={`비우면 학원 기본 (${defaultQCount})`}
              disabled={saving}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 15,
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                boxSizing: 'border-box',
                marginBottom: 14,
              }}
            />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
              통과 점수 (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={passScoreStr}
              onChange={(e) => setPassScoreStr(e.target.value)}
              placeholder={`비우면 학원 기본 (${defaultPass}%)`}
              disabled={saving}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 15,
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                boxSizing: 'border-box',
                marginBottom: 14,
              }}
            />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
              최대 시도 횟수
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={maxAttemptsStr}
              onChange={(e) => setMaxAttemptsStr(e.target.value)}
              placeholder={`비우면 학원 기본 (${defaultAttempts})`}
              disabled={saving}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 15,
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                boxSizing: 'border-box',
                marginBottom: 14,
              }}
            />

            <div style={{ fontWeight: 800, color: COLORS.accentText, marginBottom: 8, fontSize: 13 }}>출제 방식 (복수 선택·무작위)</div>
            {hasImageWords ? (
              <p style={{ fontSize: 11, color: COLORS.textSecondary, margin: '0 0 10px' }}>
                이미지가 없는 단어는 「이미지 → 단어」 대신 다른 유형으로 대체됩니다.
              </p>
            ) : (
              <p style={{ fontSize: 11, color: COLORS.textSecondary, margin: '0 0 10px' }}>
                이 세트에 이미지 단어가 없으면 「이미지 → 단어」는 출제 시 다른 유형으로 바뀝니다.
              </p>
            )}
            <ul style={{ listStyle: 'none', margin: '0 0 16px', padding: 0, display: 'grid', gap: 8 }}>
              {QTYPE_KEYS.map(({ key, label }) => {
                const checked = (questionTypes || []).includes(key)
                return (
                  <li key={key}>
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={saving}
                        onChange={() => {
                          setQuestionTypes((prev) => {
                            const p = Array.isArray(prev) ? prev : ['word_to_meaning']
                            if (p.includes(key)) {
                              if (p.length <= 1) {
                                alert('출제 방식은 최소 한 가지를 선택해 주세요.')
                                return p
                              }
                              return p.filter((x) => x !== key)
                            }
                            return [...p, key]
                          })
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {error ? (
          <p style={{ color: COLORS.danger, fontSize: 13, margin: '0 0 12px' }} role="alert">
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={saving || loading}
            onClick={onClose}
            style={{
              padding: '10px 16px',
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.bg,
              fontWeight: 600,
              cursor: saving || loading ? 'wait' : 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save()}
            style={{
              padding: '10px 18px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: COLORS.headerGradient,
              color: COLORS.textOnGreen,
              fontWeight: 700,
              cursor: saving || loading ? 'wait' : 'pointer',
            }}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
