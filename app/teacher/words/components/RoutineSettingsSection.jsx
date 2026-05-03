'use client'

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { useTeacher } from '@/utils/useTeacher'
import {
  createRoutineWithDaysAndTasks,
  deleteRoutineForTeacher,
  fetchRoutineForEdit,
  fetchTeacherRoutinesWithStats,
  parseRestDayNumbers,
  parseReviewOffsets,
  updateRoutineWithDaysAndTasks,
} from '@/utils/routineAdmin'
import { COLORS, RADIUS } from '@/utils/tokens'
import {
  ALL_MODE_KEYS,
  MODE_LABELS,
  buildModesDataForWordSetSave,
  parseAvailableModes,
  splitModesForRoutine,
  normalizeSetType,
} from '../utils/learningModes'

/** 복습 방식 체크박스 키 — DB `routines.review_modes` JSONB 배열에 그대로 저장 (학생 앱과 동일 키) */
const REVIEW_MODE_OPTIONS = [
  { key: 'test', label: '테스트로 복습' },
  { key: 'reading', label: '직독직해로 복습' },
  { key: 'shadowing', label: '쉐도잉으로 복습' },
  { key: 'writing', label: '라이팅으로 복습' },
  { key: 'scramble', label: '스크램블로 복습' },
  { key: 'memorize', label: '암기(플래시카드)' },
  { key: 'recall', label: '리콜' },
  { key: 'wrong_note', label: '오답노트' },
]

/** 루틴 복습 단계 편집(순서 유지) — 드롭다운에 나올 옵션 */
const REVIEW_STEP_ADD_OPTIONS = [...REVIEW_MODE_OPTIONS]

/**
 * @param {unknown} rm routines.review_modes
 * @returns {{ id: string, key: string, wrongOnly: boolean }[]}
 */
function normalizeReviewModesToSteps(rm) {
  if (!Array.isArray(rm) || rm.length === 0) {
    return [{ id: `r-${Date.now()}`, key: 'test', wrongOnly: false }]
  }
  return rm.map((x, i) => {
    if (typeof x === 'string') {
      const k = x.trim().toLowerCase() || 'test'
      return { id: `r-${i}-${k}`, key: k, wrongOnly: false }
    }
    if (x && typeof x === 'object' && 'mode' in x) {
      const m = String(/** @type {{ mode?: unknown }} */ (x).mode ?? '')
        .trim()
        .toLowerCase()
      if (m === 'wrong_note') return { id: `r-${i}-wn`, key: 'wrong_note', wrongOnly: false }
      return { id: `r-${i}-${m}`, key: m || 'test', wrongOnly: Boolean(/** @type {{ wrongOnly?: unknown }} */ (x).wrongOnly) }
    }
    return { id: `r-${i}-f`, key: 'test', wrongOnly: false }
  })
}

/** UI/서버 메시지 — 객체가 그대로 나가면 [object Object] 방지 */
function formatRoutineError(err) {
  if (err == null) return '저장에 실패했습니다.'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && typeof err.message === 'string') return err.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

/**
 * 단어 세트 드롭다운: DB에서 가져온 이름 + 부모 prop + (편집 중) 현재 선택값 병합
 * @param {string[]} dbNames
 * @param {string[]} propNames
 * @param {string} [ensureVisible]
 */
function buildDropdownSetNames(dbNames, propNames, ensureVisible) {
  const s = new Set()
  for (const n of dbNames || []) {
    const t = String(n ?? '').trim()
    if (t) s.add(t)
  }
  for (const n of propNames || []) {
    const t = String(n ?? '').trim()
    if (t) s.add(t)
  }
  const v = String(ensureVisible ?? '').trim()
  if (v) s.add(v)
  return Array.from(s).sort((a, b) => a.localeCompare(b, 'ko'))
}

/** 추천 필수 모드 → word_sets.available_modes JSON */
function buildModesPayload(recommendedKeys, passScore, maxAttempts) {
  const modes = {}
  const requiredByMode = {}
  for (const k of ALL_MODE_KEYS) {
    const on = recommendedKeys.includes(k)
    modes[k] = on
    requiredByMode[k] = on
  }
  return buildModesDataForWordSetSave(modes, requiredByMode, passScore, maxAttempts)
}

/**
 * @param {{ teacherId?: string, setNames: string[], sectionTitle?: string, deepLinkEditRoutineId?: string, deepLinkNewRoutine?: boolean, onDeepLinkConsumed?: () => void }} props
 */
export default function RoutineSettingsSection({
  teacherId: teacherIdProp,
  setNames,
  sectionTitle = '루틴 설정',
  deepLinkEditRoutineId = '',
  deepLinkNewRoutine = false,
  onDeepLinkConsumed,
}) {
  const { teacher } = useTeacher()
  const teacherId = teacherIdProp || teacher?.id || ''
  const [routines, setRoutines] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  /** 수정 중일 때만 설정 (신규 생성은 null) */
  const [editingRoutineId, setEditingRoutineId] = useState(null)
  const [editLoading, setEditLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [routineName, setRoutineName] = useState('')
  const [selectedSet, setSelectedSet] = useState('')
  const [modesLoading, setModesLoading] = useState(false)
  const [currentSetType, setCurrentSetType] = useState('word')
  const [testPassScore, setTestPassScore] = useState(80)
  const [testMaxAttempts, setTestMaxAttempts] = useState(3)
  const [requiredModeKeys, setRequiredModeKeys] = useState([])
  const [optionalModeKeys, setOptionalModeKeys] = useState([])
  const [includeOptional, setIncludeOptional] = useState({})
  /** 루틴 복습 모드 단계(순서 = 실행 순서) */
  const [reviewSteps, setReviewSteps] = useState(() => [
    { id: 'n1', key: 'test', wrongOnly: false },
  ])
  const [toast, setToast] = useState(null)
  const [recommendSaving, setRecommendSaving] = useState(false)
  /** 루틴 삭제 확인 — { id, title } | null */
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [totalDaysInput, setTotalDaysInput] = useState('28')
  const [reviewCycleInput, setReviewCycleInput] = useState('+1+3+7')
  const [restDaysInput, setRestDaysInput] = useState('DAY7, DAY14, DAY21')
  /** 해당 선생님 word_sets.name 전부 — 세트 상세에서만 넘어오는 setNames 한 줄 문제 보완 */
  const [wordSetNamesFromDb, setWordSetNamesFromDb] = useState([])

  const defaultSetNames = useMemo(
    () => buildDropdownSetNames(wordSetNamesFromDb, setNames, ''),
    [wordSetNamesFromDb, setNames],
  )
  const dropdownSetNames = useMemo(
    () => buildDropdownSetNames(wordSetNamesFromDb, setNames, selectedSet),
    [wordSetNamesFromDb, setNames, selectedSet],
  )

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
    if (!teacherId) {
      setWordSetNamesFromDb([])
      return
    }
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('word_sets')
        .select('name')
        .eq('teacher_id', teacherId)
        .order('name', { ascending: true })
      if (cancelled) return
      if (error) {
        console.warn('[RoutineSettingsSection] word_sets names', error.message)
        setWordSetNamesFromDb([])
        return
      }
      const names = (data || []).map((r) => String(r?.name ?? '').trim()).filter(Boolean)
      setWordSetNamesFromDb(names)
    })()
    return () => {
      cancelled = true
    }
  }, [teacherId])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!deleteTarget) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !deleting) setDeleteTarget(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [deleteTarget, deleting])

  useEffect(() => {
    if (formOpen && defaultSetNames.length && !selectedSet) {
      setSelectedSet(defaultSetNames[0])
    }
  }, [formOpen, defaultSetNames, selectedSet])

  const loadModesForSet = useCallback(async (setName) => {
    const sn = String(setName || '').trim()
    if (!teacherId || !sn) {
      setRequiredModeKeys([])
      setOptionalModeKeys([])
      setIncludeOptional({})
      setCurrentSetType('word')
      return { requiredKeys: [], optionalKeys: [] }
    }
    setModesLoading(true)
    try {
      const { data: ws } = await supabase
        .from('word_sets')
        .select('available_modes, set_type')
        .eq('teacher_id', teacherId)
        .eq('name', sn)
        .maybeSingle()
      setCurrentSetType(normalizeSetType(ws?.set_type))
      const parsed = parseAvailableModes(ws?.available_modes, normalizeSetType(ws?.set_type))
      setTestPassScore(parsed.passScore ?? 80)
      setTestMaxAttempts(parsed.maxAttempts ?? 3)
      const { requiredKeys, optionalKeys } = splitModesForRoutine(parsed)
      setRequiredModeKeys(requiredKeys)
      setOptionalModeKeys(optionalKeys)
      /** 세트에 켜져 있는 선택 모드 → 체크 유지 (available_modes 반영) */
      const inc = {}
      for (const k of optionalKeys) {
        inc[k] = !!parsed.modes[k]
      }
      setIncludeOptional(inc)
      return { requiredKeys, optionalKeys }
    } finally {
      setModesLoading(false)
    }
  }, [teacherId])

  /** 신규 루틴 폼: 세트 선택 시 모드 로드. 편집 진입은 handleStartEdit에서만 로드해 덮어쓰기 방지 */
  useEffect(() => {
    if (!formOpen || !selectedSet || editingRoutineId) return
    void loadModesForSet(selectedSet)
  }, [formOpen, selectedSet, loadModesForSet, editingRoutineId])

  const resetForm = () => {
    setEditingRoutineId(null)
    setRoutineName('')
    setSelectedSet(defaultSetNames[0] || '')
    setRequiredModeKeys([])
    setOptionalModeKeys([])
    setIncludeOptional({})
    setCurrentSetType('word')
    setTestPassScore(80)
    setTestMaxAttempts(3)
    setReviewSteps([{ id: `n-${Date.now()}`, key: 'test', wrongOnly: false }])
    setTotalDaysInput('28')
    setReviewCycleInput('+1+3+7')
    setRestDaysInput('DAY7, DAY14, DAY21')
    setSaveError(null)
  }

  const handleStartEdit = async (routineId) => {
    if (!teacherId || !routineId) return
    setEditLoading(true)
    setSaveError(null)
    try {
      const res = await fetchRoutineForEdit(routineId, teacherId)
      if (!res.ok) {
        setToast({ tone: 'err', message: formatRoutineError(res.error) })
        return
      }
      const d = res.data
      setEditingRoutineId(d.routineId)
      setRoutineName(d.title || '')
      setSelectedSet(d.setName || '')
      setTotalDaysInput(String(d.totalDays ?? 28))
      setReviewCycleInput(d.reviewOffsets?.length ? `+${d.reviewOffsets.join('+')}` : '+1+3+7')
      setRestDaysInput(d.restDayNumbers?.length ? d.restDayNumbers.map((n) => `DAY${n}`).join(', ') : '')
      setReviewSteps(normalizeReviewModesToSteps(d.reviewModes))
      setFormOpen(true)
      const keys = await loadModesForSet(d.setName)
      const optionalKeys = keys?.optionalKeys ?? []
      const inc = {}
      for (const k of optionalKeys) {
        inc[k] = d.learningModeTasks.some((t) => t.task_type === k)
      }
      setIncludeOptional(inc)
    } catch (err) {
      setToast({ tone: 'err', message: formatRoutineError(err) })
    } finally {
      setEditLoading(false)
    }
  }

  const lastDeepEditId = useRef('')
  useEffect(() => {
    const id = String(deepLinkEditRoutineId || '').trim()
    if (!id) {
      lastDeepEditId.current = ''
      return
    }
    if (loading || !teacherId) return
    if (lastDeepEditId.current === id) return
    lastDeepEditId.current = id
    void handleStartEdit(id).finally(() => {
      onDeepLinkConsumed?.()
    })
  }, [loading, teacherId, deepLinkEditRoutineId, onDeepLinkConsumed])

  const lastDeepNew = useRef(false)
  useEffect(() => {
    if (!deepLinkNewRoutine) {
      lastDeepNew.current = false
      return
    }
    if (loading || !defaultSetNames.length) return
    if (lastDeepNew.current) return
    lastDeepNew.current = true
    resetForm()
    setEditingRoutineId(null)
    const sn0 = defaultSetNames[0] || ''
    setSelectedSet(sn0)
    setFormOpen(true)
    void loadModesForSet(sn0)
    onDeepLinkConsumed?.()
  }, [loading, deepLinkNewRoutine, defaultSetNames, onDeepLinkConsumed])

  const applyRecommendedModes = async (recommendedKeys, label) => {
    const sn = String(selectedSet || '').trim()
    if (!teacherId || !sn) {
      setToast({ tone: 'err', message: '세트를 선택하세요.' })
      return
    }
    setRecommendSaving(true)
    try {
      const modesData = buildModesPayload(recommendedKeys, testPassScore, testMaxAttempts)
      const { data, error } = await supabase
        .from('word_sets')
        .upsert(
          {
            teacher_id: teacherId,
            name: sn,
            set_type: currentSetType,
            available_modes: modesData,
          },
          { onConflict: 'teacher_id,name' },
        )
        .select('id')
        .maybeSingle()

      if (error) {
        console.error('[RoutineSettingsSection] word_sets 업데이트 실패', error)
        setToast({ tone: 'err', message: formatRoutineError(error) })
        return
      }

      console.log('[RoutineSettingsSection] word_sets 업데이트 성공', {
        setName: sn,
        setType: currentSetType,
        label,
        modes: recommendedKeys,
        rowId: data?.id ?? null,
      })

      setToast({ tone: 'ok', message: `${label} 적용됨 · 세트 학습 모드가 저장되었습니다.` })
      await loadModesForSet(sn)
    } catch (e) {
      console.error('[RoutineSettingsSection] 추천 적용 예외', e)
      setToast({ tone: 'err', message: formatRoutineError(e) })
    } finally {
      setRecommendSaving(false)
    }
  }

  const handleSubmit = async (e) => {
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

    if (!reviewSteps.length) {
      setSaveError('복습 방식(단계)을 1개 이상 추가하세요.')
      return
    }
    const review_modes = reviewSteps.map((s) =>
      s.key === 'wrong_note' ? { mode: 'wrong_note' } : { mode: s.key, wrongOnly: Boolean(s.wrongOnly) },
    )

    const learningModeTasks = [
      ...requiredModeKeys.map((k) => ({ task_type: k, is_required: true })),
      ...optionalModeKeys.filter((k) => includeOptional[k]).map((k) => ({ task_type: k, is_required: false })),
    ]

    setSaving(true)
    const result = editingRoutineId
      ? await updateRoutineWithDaysAndTasks(editingRoutineId, teacherId, {
          title,
          setName,
          totalDays,
          reviewOffsets,
          restDayNumbers,
          learningModeTasks,
          reviewModes: review_modes,
        })
      : await createRoutineWithDaysAndTasks({
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
      const msg = formatRoutineError(result.error)
      setSaveError(msg)
      setToast({ tone: 'err', message: msg })
      return
    }

    setToast({ tone: 'ok', message: editingRoutineId ? '루틴이 수정되었습니다.' : '루틴이 저장되었습니다.' })
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

  const handleConfirmDeleteRoutine = async () => {
    if (!deleteTarget || !teacherId) return
    setDeleting(true)
    try {
      const res = await deleteRoutineForTeacher(String(deleteTarget.id), teacherId)
      if (!res.ok) {
        setToast({ tone: 'err', message: formatRoutineError(res.error) })
        return
      }
      if (editingRoutineId && String(editingRoutineId) === String(deleteTarget.id)) {
        setFormOpen(false)
        resetForm()
      }
      setDeleteTarget(null)
      setToast({ tone: 'ok', message: '루틴이 삭제되었습니다.' })
      void load()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section
      id="routine-settings"
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
        position: 'relative',
      }}
    >
      {deleteTarget ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="routine-delete-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10050,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            boxSizing: 'border-box',
          }}
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(400px, 100%)',
              padding: 22,
              borderRadius: 14,
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
          >
            <h3
              id="routine-delete-title"
              style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 800, color: COLORS.textPrimary }}
            >
              이 루틴을 삭제할까요?
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 1.55, color: COLORS.textSecondary }}>
              연결된 학생들의 루틴도 함께 사라집니다.
            </p>
            {deleteTarget.title ? (
              <p
                style={{
                  margin: '0 0 16px',
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.accentText,
                }}
              >
                「{String(deleteTarget.title).trim() || '이름 없음'}」
              </p>
            ) : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                style={{
                  padding: '10px 18px',
                  borderRadius: RADIUS.md,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.bg,
                  color: COLORS.textPrimary,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: deleting ? 'wait' : 'pointer',
                }}
              >
                취소
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDeleteRoutine()}
                style={{
                  padding: '10px 18px',
                  borderRadius: RADIUS.md,
                  border: 'none',
                  background: COLORS.danger,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: deleting ? 'wait' : 'pointer',
                  opacity: deleting ? 0.85 : 1,
                }}
              >
                {deleting ? '삭제 중…' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            maxWidth: 'min(420px, 92vw)',
            textAlign: 'center',
            background: toast.tone === 'ok' ? '#065f46' : '#991b1b',
            color: '#fff',
          }}
        >
          {toast.message}
        </div>
      ) : null}

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
          {sectionTitle}
        </h2>
        <button
          type="button"
          onClick={() => {
            setSaveError(null)
            if (formOpen) {
              setFormOpen(false)
              resetForm()
            } else {
              resetForm()
              setFormOpen(true)
            }
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
        {editLoading ? (
          <span style={{ fontSize: 13, color: COLORS.textSecondary }}>불러오는 중…</span>
        ) : null}
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
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  disabled={editLoading || saving}
                  onClick={() => void handleStartEdit(r.id)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADIUS.sm,
                    border: `1px solid ${COLORS.primary}`,
                    background: 'rgba(102, 126, 234, 0.08)',
                    color: COLORS.primary,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: editLoading || saving ? 'wait' : 'pointer',
                    opacity: editLoading || saving ? 0.65 : 1,
                  }}
                >
                  수정
                </button>
                <button
                  type="button"
                  disabled={editLoading || saving || deleting}
                  onClick={() => setDeleteTarget({ id: r.id, title: r.title || '' })}
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADIUS.sm,
                    border: `1px solid ${COLORS.danger}`,
                    background: COLORS.dangerBg,
                    color: COLORS.danger,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: editLoading || saving || deleting ? 'wait' : 'pointer',
                    opacity: editLoading || saving || deleting ? 0.65 : 1,
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen ? (
        <form
          onSubmit={handleSubmit}
          style={{
            marginTop: 8,
            paddingTop: 20,
            borderTop: `1px solid ${COLORS.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>
              {editingRoutineId ? '루틴 수정' : '새 루틴'}
            </div>
            {editingRoutineId ? (
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  background: 'rgba(102, 126, 234, 0.12)',
                  color: COLORS.primary,
                  border: `1px solid rgba(102, 126, 234, 0.35)`,
                }}
              >
                편집 중: {routineName.trim() || '루틴'}
              </span>
            ) : null}
          </div>

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
              onChange={(e) => {
                const v = e.target.value
                setSelectedSet(v)
                if (teacherId && v.trim()) void loadModesForSet(v.trim())
              }}
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
              {dropdownSetNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {dropdownSetNames.length === 0 ? (
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {currentSetType === 'word' ? (
                <button
                  type="button"
                  disabled={recommendSaving || !selectedSet}
                  onClick={() =>
                    void applyRecommendedModes(['flashcard', 'recall', 'matching', 'test'], '단어 세트 추천')
                  }
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADIUS.sm,
                    border: `1px solid ${COLORS.primary}`,
                    background: 'rgba(102, 126, 234, 0.08)',
                    color: COLORS.primary,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: recommendSaving || !selectedSet ? 'not-allowed' : 'pointer',
                    opacity: recommendSaving || !selectedSet ? 0.55 : 1,
                  }}
                >
                  단어 세트 추천
                </button>
              ) : null}
              {currentSetType === 'sentence_writing' ? (
                <button
                  type="button"
                  disabled={recommendSaving || !selectedSet}
                  onClick={() =>
                    void applyRecommendedModes(
                      ['reading', 'dictation', 'writing', 'scramble'],
                      '문장 세트 라이팅 추천',
                    )
                  }
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADIUS.sm,
                    border: `1px solid #0d9488`,
                    background: 'rgba(13, 148, 136, 0.08)',
                    color: '#0f766e',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: recommendSaving || !selectedSet ? 'not-allowed' : 'pointer',
                    opacity: recommendSaving || !selectedSet ? 0.55 : 1,
                  }}
                >
                  문장 세트 라이팅 추천
                </button>
              ) : null}
              {currentSetType === 'sentence_speaking' ? (
                <button
                  type="button"
                  disabled={recommendSaving || !selectedSet}
                  onClick={() =>
                    void applyRecommendedModes(
                      ['dictation', 'listening', 'shadowing', 'scramble'],
                      '문장 세트 스피킹 추천',
                    )
                  }
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADIUS.sm,
                    border: `1px solid #c2410c`,
                    background: 'rgba(234, 88, 12, 0.08)',
                    color: '#c2410c',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: recommendSaving || !selectedSet ? 'not-allowed' : 'pointer',
                    opacity: recommendSaving || !selectedSet ? 0.55 : 1,
                  }}
                >
                  문장 세트 스피킹 추천
                </button>
              ) : null}
            </div>
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
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.accentText }}>복습 단계 구성 (순서대로 실행)</div>
            <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary }}>(1단계 이상 · 위에서 아래 순서)</p>
            <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.45 }}>
              값은 <span style={{ fontWeight: 600 }}>routines.review_modes</span>(JSON 배열)에 저장됩니다. 모드·오답노트·&quot;틀린
              단어만&quot; 옵션을 사용할 수 있어요.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reviewSteps.map((row, idx) => (
                <div
                  key={row.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: RADIUS.sm,
                    border: `1px solid ${COLORS.border}`,
                    background: '#fff',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textHint, minWidth: 24 }}>{idx + 1}.</span>
                  <select
                    value={row.key}
                    onChange={(e) => {
                      const v = e.target.value
                      setReviewSteps((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, key: v, wrongOnly: v === 'wrong_note' ? false : r.wrongOnly } : r)),
                      )
                    }}
                    style={{ flex: 1, minWidth: 160, padding: '8px 10px', fontSize: 14, fontWeight: 600 }}
                  >
                    {REVIEW_STEP_ADD_OPTIONS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {row.key !== 'wrong_note' ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={!!row.wrongOnly}
                        onChange={() =>
                          setReviewSteps((prev) => prev.map((r) => (r.id === row.id ? { ...r, wrongOnly: !r.wrongOnly } : r)))
                        }
                      />
                      틀린 단어만
                    </label>
                  ) : null}
                  <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => {
                        if (idx === 0) return
                        setReviewSteps((prev) => {
                          const next = [...prev]
                          const t = next[idx - 1]
                          next[idx - 1] = next[idx]
                          next[idx] = t
                          return next
                        })
                      }}
                      style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700 }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={idx >= reviewSteps.length - 1}
                      onClick={() => {
                        if (idx >= reviewSteps.length - 1) return
                        setReviewSteps((prev) => {
                          const next = [...prev]
                          const t = next[idx + 1]
                          next[idx + 1] = next[idx]
                          next[idx] = t
                          return next
                        })
                      }}
                      style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700 }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewSteps((prev) => prev.filter((r) => r.id !== row.id))}
                      style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#b91c1c' }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setReviewSteps((prev) => [
                  ...prev,
                  { id: `a-${Date.now()}`, key: 'test', wrongOnly: false },
                ])
              }
              style={{
                alignSelf: 'flex-start',
                marginTop: 4,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 700,
                borderRadius: RADIUS.sm,
                border: `1px dashed ${COLORS.border}`,
                background: 'white',
                cursor: 'pointer',
              }}
            >
              + 단계 추가
            </button>
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
              disabled={saving || dropdownSetNames.length === 0 || editLoading}
              style={{
                padding: '12px 22px',
                borderRadius: RADIUS.md,
                border: 'none',
                background: dropdownSetNames.length === 0 ? COLORS.border : COLORS.headerGradient,
                color: COLORS.textOnGreen,
                fontWeight: 700,
                fontSize: 15,
                cursor: dropdownSetNames.length === 0 || editLoading ? 'not-allowed' : 'pointer',
                boxShadow: dropdownSetNames.length === 0 ? 'none' : '0 4px 16px rgba(102, 126, 234, 0.28)',
              }}
            >
              {saving ? '저장 중…' : editingRoutineId ? '저장 (수정)' : '저장 (routine_days + routine_tasks 생성)'}
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
