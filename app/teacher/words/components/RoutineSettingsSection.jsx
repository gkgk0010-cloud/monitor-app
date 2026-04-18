'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { useTeacher } from '@/utils/useTeacher'
import {
  createRoutineWithDaysAndTasks,
  fetchTeacherRoutinesWithStats,
  parseRestDayNumbers,
  parseReviewOffsets,
} from '@/utils/routineAdmin'
import { COLORS, RADIUS } from '@/utils/tokens'
import { MODE_LABELS, parseAvailableModes, splitModesForRoutine } from '../utils/learningModes'

/** routines.review_modes JSON 배열에 들어가는 키 */
const REVIEW_MODE_OPTIONS = [
  { key: 'test', label: '테스트로 복습' },
  { key: 'reading', label: '직독직해로 복습' },
  { key: 'shadowing', label: '쉐도잉으로 복습' },
  { key: 'writing', label: '라이팅으로 복습' },
]

const defaultReviewModePick = () => ({
  test: true,
  reading: false,
  shadowing: false,
  writing: false,
})

/**
 * @param {{ teacherId?: string, setNames: string[] }} props
 */
export default function RoutineSettingsSection({ teacherId: teacherIdProp, setNames }) {
  const { teacher } = useTeacher()
  const teacherId = teacherIdProp || teacher?.id || ''
  const [routines, setRoutines] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [routineName, setRoutineName] = useState('')
  const [selectedSet, setSelectedSet] = useState('')
  const [modesLoading, setModesLoading] = useState(false)
  const [requiredModeKeys, setRequiredModeKeys] = useState([])
  const [optionalModeKeys, setOptionalModeKeys] = useState([])
  const [includeOptional, setIncludeOptional] = useState({})
  const [reviewModePick, setReviewModePick] = useState(defaultReviewModePick)
  const [totalDaysInput, setTotalDaysInput] = useState('28')
  const [reviewCycleInput, setReviewCycleInput] = useState('+1+3+7')
  const [restDaysInput, setRestDaysInput] = useState('DAY7, DAY14, DAY21')

  const load = useCallback(async () => {
    if (!teacherId) {
      setRoutines([])
      setCounts({})
      setLoading(false)
      return
    }
    setLoading(true)
    setListError(null)
    const { routines: rows, counts: c, error } = await fetchTeacherRoutinesWithStats(teacherId)
    if (error) {
      setListError(error.message || '루틴 목록을 불러오지 못했습니다.')
      setRoutines([])
      setCounts({})
    } else {
      setRoutines(rows)
      setCounts(c)
    }
    setLoading(false)
  }, [teacherId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (formOpen && setNames.length && !selectedSet) {
      setSelectedSet(setNames[0])
    }
  }, [formOpen, setNames, selectedSet])

  const loadModesForSet = useCallback(async (setName) => {
    const sn = String(setName || '').trim()
    if (!teacherId || !sn) {
      setRequiredModeKeys([])
      setOptionalModeKeys([])
      setIncludeOptional({})
      return
    }
    setModesLoading(true)
    try {
      const { data: ws } = await supabase
        .from('word_sets')
        .select('available_modes, set_type')
        .eq('teacher_id', teacherId)
        .eq('name', sn)
        .maybeSingle()
      const st = ws?.set_type === 'sentence' || ws?.set_type === 'image' ? ws.set_type : 'word'
      const parsed = parseAvailableModes(ws?.available_modes, st)
      const { requiredKeys, optionalKeys } = splitModesForRoutine(parsed)
      setRequiredModeKeys(requiredKeys)
      setOptionalModeKeys(optionalKeys)
      setIncludeOptional({})
    } finally {
      setModesLoading(false)
    }
  }, [teacherId])

  useEffect(() => {
    if (!formOpen || !selectedSet) return
    void loadModesForSet(selectedSet)
  }, [formOpen, selectedSet, loadModesForSet])

  const resetForm = () => {
    setRoutineName('')
    setSelectedSet(setNames[0] || '')
    setRequiredModeKeys([])
    setOptionalModeKeys([])
    setIncludeOptional({})
    setReviewModePick(defaultReviewModePick())
    setTotalDaysInput('28')
    setReviewCycleInput('+1+3+7')
    setRestDaysInput('DAY7, DAY14, DAY21')
    setSaveError(null)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaveError(null)
    const title = routineName.trim()
    const setName = selectedSet.trim()
    const totalDays = Math.max(1, parseInt(String(totalDaysInput).trim(), 10) || 1)

    if (!title) {
      setSaveError('루틴 이름을 입력하세요.')
      return
    }
    if (!setName) {
      setSaveError('단어 세트를 선택하세요.')
      return
    }
    if (!teacherId) {
      setSaveError('선생님 정보(teacher)를 확인할 수 없습니다.')
      return
    }

    const reviewOffsets = parseReviewOffsets(reviewCycleInput)
    const restDayNumbers = parseRestDayNumbers(restDaysInput, totalDays)

    const review_modes = REVIEW_MODE_OPTIONS.map((o) => o.key).filter((k) => reviewModePick[k])
    if (review_modes.length === 0) {
      setSaveError('복습 방식을 1개 이상 선택하세요.')
      return
    }

    const learningModeTasks = [
      ...requiredModeKeys.map((k) => ({ task_type: k, is_required: true })),
      ...optionalModeKeys.filter((k) => includeOptional[k]).map((k) => ({ task_type: k, is_required: false })),
    ]

    setSaving(true)
    const result = await createRoutineWithDaysAndTasks({
      teacherId,
      title,
      setName,
      totalDays,
      reviewOffsets,
      restDayNumbers,
      learningModeTasks,
      reviewModes: review_modes,
    })
    setSaving(false)

    if (!result.ok) {
      setSaveError(result.error || '저장에 실패했습니다.')
      return
    }

    setFormOpen(false)
    resetForm()
    void load()
  }

  const fmtDate = (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
    } catch {
      return String(iso)
    }
  }

  return (
    <section
      aria-label="루틴 설정"
      style={{
        width: '100%',
        maxWidth: '100%',
        margin: '24px 0 0',
        padding: '22px 24px 24px',
        borderRadius: RADIUS.xl,
        border: `1px solid ${COLORS.border}`,
        borderLeft: '4px solid #667eea',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: '0 8px 32px rgba(31, 38, 135, 0.06)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <h2
          style={{
            margin: 0,
            fontSize: '1rem',
            fontWeight: 700,
            color: '#374151',
            paddingLeft: 2,
          }}
        >
          루틴 설정
        </h2>
        <button
          type="button"
          onClick={() => {
            setFormOpen((o) => !o)
            setSaveError(null)
            if (!formOpen) resetForm()
          }}
          style={{
            padding: '10px 18px',
            borderRadius: RADIUS.md,
            border: 'none',
            background: COLORS.headerGradient,
            color: COLORS.textOnGreen,
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(102, 126, 234, 0.28)',
          }}
        >
          {formOpen ? '닫기' : '새 루틴 만들기'}
        </button>
      </div>

      {listError ? (
        <p style={{ color: COLORS.danger, marginBottom: 12, fontSize: 14 }}>{listError}</p>
      ) : null}

      {loading ? (
        <p style={{ color: COLORS.textSecondary, margin: 0 }}>루틴 목록 불러오는 중…</p>
      ) : routines.length === 0 ? (
        <p style={{ color: COLORS.textSecondary, margin: '0 0 16px', fontSize: 14 }}>
          등록된 루틴이 없습니다. 아래에서 새 루틴을 만들 수 있습니다.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: formOpen ? 20 : 0 }}>
          {routines.map((r) => (
            <div
              key={r.id}
              style={{
                padding: '16px 18px',
                borderRadius: RADIUS.lg,
                border: `1px solid rgba(229, 231, 235, 0.9)`,
                background: 'rgba(255,255,255,0.88)',
                boxShadow: '0 1px 3px rgba(91, 124, 250, 0.08)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>루틴 이름</div>
                <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.textPrimary }}>{r.title || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>세트명</div>
                <div style={{ fontWeight: 600, fontSize: 15, color: COLORS.accentText }}>{r.set_name || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>총 DAY</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{r.total_days != null ? String(r.total_days) : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>진행 중 학생</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.primary }}>
                  {counts[r.id] != null ? `${counts[r.id]}명` : '0명'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: COLORS.textHint }}>생성 {fmtDate(r.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {formOpen ? (
        <form
          onSubmit={handleCreate}
          style={{
            marginTop: 8,
            paddingTop: 20,
            borderTop: `1px solid ${COLORS.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>새 루틴</div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>루틴 이름</span>
            <input
              value={routineName}
              onChange={(e) => setRoutineName(e.target.value)}
              placeholder="예: 2025 봄 토익 루틴"
              required
              style={{
                padding: '10px 12px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                fontSize: 15,
                maxWidth: 480,
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>단어 세트 (words.set_name)</span>
            <select
              value={selectedSet}
              onChange={(e) => setSelectedSet(e.target.value)}
              required
              style={{
                padding: '10px 12px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                fontSize: 15,
                maxWidth: 480,
              }}
            >
              <option value="">선택하세요</option>
              {setNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {setNames.length === 0 ? (
              <span style={{ fontSize: 13, color: COLORS.warning }}>먼저 단어를 등록해 세트가 생기면 선택할 수 있습니다.</span>
            ) : null}
          </label>

          <div
            style={{
              padding: '14px 16px',
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              background: 'rgba(249, 250, 251, 0.95)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.accentText }}>신규 학습 모드</div>
            <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.45 }}>
              필수 모드는 세트의 <span style={{ fontWeight: 600 }}>word_sets.available_modes</span>에서 <span style={{ fontWeight: 600 }}>required: true</span>인
              항목이 자동 반영됩니다. 선택 모드는 체크 시 루틴 DAY에 추가됩니다.
            </p>
            {modesLoading ? (
              <span style={{ fontSize: 13, color: COLORS.textSecondary }}>세트 모드 불러오는 중…</span>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, letterSpacing: 0.02 }}>필수 (자동 설정됨)</div>
                {requiredModeKeys.length === 0 && optionalModeKeys.length === 0 ? (
                  <span style={{ fontSize: 13, color: COLORS.textSecondary }}>표시할 학습 모드가 없습니다.</span>
                ) : null}
                {requiredModeKeys.map((key) => (
                  <div
                    key={`req-${key}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: 14,
                      fontWeight: 600,
                      color: COLORS.textPrimary,
                    }}
                  >
                    <span style={{ width: 18, textAlign: 'center', color: COLORS.primary, fontWeight: 800 }} aria-hidden>
                      ✓
                    </span>
                    <span>{MODE_LABELS[key] || key}</span>
                  </div>
                ))}
                <div
                  style={{
                    marginTop: 4,
                    paddingTop: 10,
                    borderTop: `1px solid ${COLORS.border}`,
                    fontSize: 12,
                    fontWeight: 700,
                    color: COLORS.textSecondary,
                    letterSpacing: 0.02,
                  }}
                >
                  선택 추가 가능
                </div>
                {optionalModeKeys.map((key) => (
                  <label
                    key={`opt-${key}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: 14,
                      fontWeight: 600,
                      color: COLORS.textPrimary,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!includeOptional[key]}
                      onChange={() => setIncludeOptional((prev) => ({ ...prev, [key]: !prev[key] }))}
                      style={{ width: 18, height: 18, accentColor: COLORS.primary }}
                    />
                    <span>{MODE_LABELS[key] || key}</span>
                  </label>
                ))}
              </>
            )}
          </div>

          <div
            style={{
              padding: '14px 16px',
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              background: 'rgba(249, 250, 251, 0.95)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.accentText }}>복습 방식 선택</div>
            <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary }}>(1개 이상 선택)</p>
            <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.45 }}>
              선택한 방식이 <span style={{ fontWeight: 600 }}>routines.review_modes</span>(JSON)에 저장됩니다.
            </p>
            {REVIEW_MODE_OPTIONS.map(({ key, label }) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  color: COLORS.textPrimary,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!reviewModePick[key]}
                  onChange={() => setReviewModePick((prev) => ({ ...prev, [key]: !prev[key] }))}
                  style={{ width: 18, height: 18, accentColor: COLORS.primary }}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>총 DAY 수</span>
            <input
              type="number"
              min={1}
              max={365}
              value={totalDaysInput}
              onChange={(e) => setTotalDaysInput(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                fontSize: 15,
                maxWidth: 160,
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>복습 주기 (일 간격, 예: +1일·+3일·+7일 후 복습)</span>
            <input
              value={reviewCycleInput}
              onChange={(e) => setReviewCycleInput(e.target.value)}
              placeholder="+1+3+7"
              style={{
                padding: '10px 12px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                fontSize: 15,
                maxWidth: 320,
              }}
            />
            <span style={{ fontSize: 12, color: COLORS.textHint }}>숫자만 추출합니다. 예: +1+3+7</span>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>휴식일 (DAY 번호)</span>
            <input
              value={restDaysInput}
              onChange={(e) => setRestDaysInput(e.target.value)}
              placeholder="DAY7, DAY14, DAY21"
              style={{
                padding: '10px 12px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                fontSize: 15,
                maxWidth: 400,
              }}
            />
            <span style={{ fontSize: 12, color: COLORS.textHint }}>총 DAY 수를 넘는 번호는 무시됩니다.</span>
          </label>

          {saveError ? (
            <p style={{ color: COLORS.danger, margin: 0, fontSize: 14, fontWeight: 600 }}>{saveError}</p>
          ) : null}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="submit"
              disabled={saving || setNames.length === 0}
              style={{
                padding: '12px 22px',
                borderRadius: RADIUS.md,
                border: 'none',
                background: setNames.length === 0 ? COLORS.border : COLORS.headerGradient,
                color: COLORS.textOnGreen,
                fontWeight: 700,
                fontSize: 15,
                cursor: setNames.length === 0 ? 'not-allowed' : 'pointer',
                boxShadow: setNames.length === 0 ? 'none' : '0 4px 16px rgba(102, 126, 234, 0.28)',
              }}
            >
              {saving ? '저장 중…' : '저장 (routine_days + routine_tasks 생성)'}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false)
                resetForm()
              }}
              style={{
                padding: '12px 18px',
                borderRadius: RADIUS.md,
                border: `1px solid rgba(107, 114, 128, 0.28)`,
                background: 'rgba(255,255,255,0.95)',
                color: '#374151',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              취소
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
