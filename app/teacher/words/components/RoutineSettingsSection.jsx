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
import RoutineApplicationsModal from './RoutineApplicationsModal'
import { COLORS, RADIUS } from '@/utils/tokens'
import {
  ALL_MODE_KEYS,
  MODE_LABELS,
  buildModesDataForWordSetSave,
  parseAvailableModes,
  splitModesForRoutine,
  normalizeSetType,
} from '../utils/learningModes'

/** @param {{ set_name?: string, routine_type?: string, routine_applications?: { set_name?: string, start_date?: string | null }[] }} r */
function formatRoutineApplicationsSummary(r) {
  const isWhole = r?.routine_type === 'whole_set'
  const apps = r?.routine_applications
  if (!Array.isArray(apps) || apps.length === 0) {
    return r?.set_name ? String(r.set_name) : '적용 세트 없음'
  }
  return apps
    .map((a) => {
      const sn = String(a.set_name || '').trim()
      if (isWhole) return `${sn} — 자율 전용`
      if (!a.start_date) return `${sn} — 학생별 가입일`
      const d = String(a.start_date)
      return `${sn} — ${d} 고정 시작`
    })
    .join(' · ')
}

/** 복습 방식 체크박스 키 — DB `routines.review_modes` JSONB 배열에 그대로 저장 (학생 앱과 동일 키).
 * 오답노트는 word_sets 학습모드로 제공 — 복습 큐에는 넣지 않는 것을 권장합니다(기존 루틴에 남아 있으면 로드만 됩니다). */
const REVIEW_MODE_OPTIONS = [
  { key: 'test', label: '테스트로 복습' },
  { key: 'reading', label: '직독직해로 복습' },
  { key: 'shadowing', label: '쉐도잉으로 복습' },
  { key: 'writing', label: '라이팅으로 복습' },
  { key: 'scramble', label: '스크램블로 복습' },
  { key: 'memorize', label: '암기(플래시카드)' },
  { key: 'recall', label: '리콜' },
  { key: 'booster', label: '🤖 AI 부스터 (별표 단어 복습)' },
  { key: 'wrong_note', label: '오답노트' },
]

/** whole_set 필수 활동 — UI 고정 표시·저장 시 항상 포함 (순서: booster → wrong_note) */
const WHOLE_SET_REQUIRED_DISPLAY = [
  { key: 'wrong_note', label: '오답노트' },
  { key: 'booster', label: 'AI 부스터 (별표 단어 복습)' },
]

const WHOLE_SET_REQUIRED_SAVE_STEPS = [
  { key: 'booster', wrongOnly: false },
  { key: 'wrong_note', wrongOnly: false },
]

/** whole_set 추가 활동 — 드롭다운·편집 목록 전용 */
const WHOLE_SET_OPTIONAL_STEP_OPTIONS = [
  { key: 'recall', label: '리콜' },
  { key: 'mypick', label: '⭐ 마이픽' },
  { key: 'test', label: '테스트로 복습' },
]

const WHOLE_SET_OPTIONAL_KEYS = new Set(['recall', 'mypick', 'test'])

const WHOLE_SET_CYCLE_OPTIONS = [
  { value: 'daily', label: '매일' },
  { value: 'cycle_1_3_7', label: '+1/+3/+7' },
  { value: 'weekly', label: '+7일' },
]

/** @param {unknown} v */
function parseWholeSetCycleValue(v) {
  const s = String(v ?? '').trim()
  if (s === 'daily' || s === 'cycle_1_3_7' || s === 'weekly') return s
  return 'daily'
}

/**
 * whole_set 편집 로드 — review_modes 에서 추가 활동만 추출 (필수는 UI 고정)
 * @param {unknown} rm
 * @returns {{ id: string, key: string, wrongOnly: boolean, cycle?: string }[]}
 */
function extractWholeSetOptionalStepsFromReviewModes(rm) {
  if (!Array.isArray(rm) || rm.length === 0) return []
  const out = []
  for (let i = 0; i < rm.length; i++) {
    const x = rm[i]
    if (typeof x === 'string') {
      const k = x.trim().toLowerCase()
      if (!WHOLE_SET_OPTIONAL_KEYS.has(k)) continue
      out.push({ id: `ws-${i}-${k}`, key: k, wrongOnly: false, cycle: 'daily' })
      continue
    }
    if (x && typeof x === 'object' && 'mode' in x) {
      const o = /** @type {{ mode?: unknown, wrongOnly?: unknown, cycle?: unknown }} */ (x)
      const k = String(o.mode ?? '')
        .trim()
        .toLowerCase()
      if (!WHOLE_SET_OPTIONAL_KEYS.has(k)) continue
      out.push({
        id: `ws-${i}-${k}`,
        key: k,
        wrongOnly: Boolean(o.wrongOnly),
        cycle: parseWholeSetCycleValue(o.cycle),
      })
    }
  }
  return out
}

/**
 * @param {{ key: string, wrongOnly?: boolean, cycle?: string }[]} optionalSteps UI 추가 활동만
 * @returns {object[]}
 */
function buildWholeSetReviewModesForSave(optionalSteps) {
  return [...WHOLE_SET_REQUIRED_SAVE_STEPS, ...optionalSteps].map((s) => {
    if (s.key === 'wrong_note') return { mode: 'wrong_note' }
    if (s.key === 'booster') return { mode: 'booster' }
    const entry = { mode: s.key, cycle: parseWholeSetCycleValue(s.cycle) }
    if (s.key === 'test' && s.wrongOnly) entry.wrongOnly = true
    return entry
  })
}

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
      if (m === 'booster' || m === 'ai_booster') return { id: `r-${i}-booster`, key: 'booster', wrongOnly: false }
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
  /** @type {'day_split' | 'whole_set'} */
  const [routineType, setRoutineType] = useState('day_split')
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
  /** 세트 적용 관리 모달 — { id, title, total_days } | null */
  const [appsModalRoutine, setAppsModalRoutine] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [totalDaysInput, setTotalDaysInput] = useState('28')
  const [reviewCycleInput, setReviewCycleInput] = useState('+1+3+7')
  const [restDaysInput, setRestDaysInput] = useState('DAY7, DAY14, DAY21')
  const [resetPolicy, setResetPolicy] = useState('none')
  const [dayDirection, setDayDirection] = useState('forward')
  const [editApplications, setEditApplications] = useState([])
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

  const isWholeSet = routineType === 'whole_set'
  const reviewStepOptions = REVIEW_STEP_ADD_OPTIONS

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

  /** 신규 day_split 루틴 폼: 세트 선택 시 모드 로드. whole_set·편집 진입은 제외 */
  useEffect(() => {
    if (!formOpen || !selectedSet || editingRoutineId || isWholeSet) return
    void loadModesForSet(selectedSet)
  }, [formOpen, selectedSet, loadModesForSet, editingRoutineId, isWholeSet])

  const resetForm = () => {
    setEditingRoutineId(null)
    setRoutineName('')
    setSelectedSet(defaultSetNames[0] || '')
    setRoutineType('day_split')
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
    setResetPolicy('none')
    setDayDirection('forward')
    setEditApplications([])
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
      setRoutineType(d.routineType === 'whole_set' ? 'whole_set' : 'day_split')
      setRoutineName(d.title || '')
      setSelectedSet(d.setName || '')
      setTotalDaysInput(String(d.totalDays ?? 28))
      setReviewCycleInput(d.reviewOffsets?.length ? `+${d.reviewOffsets.join('+')}` : '+1+3+7')
      setRestDaysInput(d.restDayNumbers?.length ? d.restDayNumbers.map((n) => `DAY${n}`).join(', ') : '')
      setReviewSteps(
        d.routineType === 'whole_set'
          ? extractWholeSetOptionalStepsFromReviewModes(d.reviewModes)
          : normalizeReviewModesToSteps(d.reviewModes),
      )
      setResetPolicy(d.resetPolicy === 'monthly_kst' ? 'monthly_kst' : 'none')
      setDayDirection(d.dayDirection === 'reverse' ? 'reverse' : 'forward')
      setEditApplications(Array.isArray(d.applications) ? d.applications : [])
      setFormOpen(true)
      if (d.routineType !== 'whole_set') {
        const keys = await loadModesForSet(d.setName)
        const optionalKeys = keys?.optionalKeys ?? []
        const inc = {}
        for (const k of optionalKeys) {
          inc[k] = d.learningModeTasks.some((t) => t.task_type === k)
        }
        setIncludeOptional(inc)
      }
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

    if (!isWholeSet && !reviewSteps.length) {
      setSaveError('복습 방식(단계)을 1개 이상 추가하세요.')
      return
    }

    if (isWholeSet) {
      const invalid = reviewSteps.some((s) => !WHOLE_SET_OPTIONAL_KEYS.has(s.key))
      if (invalid) {
        setSaveError('추가 활동은 리콜·마이픽·테스트만 선택할 수 있습니다.')
        return
      }
    }

    const review_modes = isWholeSet
      ? buildWholeSetReviewModesForSave(reviewSteps)
      : reviewSteps.map((s) =>
          s.key === 'wrong_note'
            ? { mode: 'wrong_note' }
            : s.key === 'booster'
              ? { mode: 'booster' }
              : { mode: s.key, wrongOnly: Boolean(s.wrongOnly) },
        )

    setSaving(true)
    let result
    if (isWholeSet) {
      result = editingRoutineId
        ? await updateRoutineWithDaysAndTasks(editingRoutineId, teacherId, {
            title,
            setName,
            totalDays: 1,
            reviewOffsets: [],
            restDayNumbers: [],
            learningModeTasks: [],
            reviewModes: review_modes,
            resetPolicy: 'none',
            dayDirection: 'forward',
            routineType: 'whole_set',
          })
        : await createRoutineWithDaysAndTasks({
            teacherId,
            title,
            setName,
            totalDays: 1,
            reviewOffsets: [],
            restDayNumbers: [],
            learningModeTasks: [],
            reviewModes: review_modes,
            resetPolicy: 'none',
            dayDirection: 'forward',
            routineType: 'whole_set',
          })
    } else {
      const reviewOffsets = parseReviewOffsets(reviewCycleInput)
      const restDayNumbers = parseRestDayNumbers(restDaysInput, totalDays)
      const learningModeTasks = [
        ...requiredModeKeys.map((k) => ({ task_type: k, is_required: true })),
        ...optionalModeKeys.filter((k) => includeOptional[k]).map((k) => ({ task_type: k, is_required: false })),
      ]
      result = editingRoutineId
        ? await updateRoutineWithDaysAndTasks(editingRoutineId, teacherId, {
            title,
            setName,
            totalDays,
            reviewOffsets,
            restDayNumbers,
            learningModeTasks,
            reviewModes: review_modes,
            resetPolicy,
            dayDirection,
            routineType: 'day_split',
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
            resetPolicy,
            dayDirection,
            routineType: 'day_split',
          })
    }
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

      {appsModalRoutine ? (
        <RoutineApplicationsModal
          open={Boolean(appsModalRoutine)}
          onClose={() => setAppsModalRoutine(null)}
          teacherId={teacherId}
          routineId={String(appsModalRoutine.id)}
          routineTitle={appsModalRoutine.title}
          routineType={appsModalRoutine.routine_type === 'whole_set' ? 'whole_set' : 'day_split'}
          totalDays={appsModalRoutine.total_days}
          wordSetNames={defaultSetNames}
          onChanged={() => {
            void load()
            if (editingRoutineId && teacherId) {
              void fetchRoutineForEdit(editingRoutineId, teacherId).then((res) => {
                if (res.ok && res.data?.applications) {
                  setEditApplications(res.data.applications)
                }
              })
            }
          }}
        />
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
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>적용 단어세트</div>
                <div style={{ fontWeight: 600, fontSize: 13, color: COLORS.accentText, lineHeight: 1.45 }}>
                  {formatRoutineApplicationsSummary(r)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>루틴 타입</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {r.routine_type === 'whole_set' ? (
                    <span style={{ color: '#0d9488' }}>전체 (유지·복습)</span>
                  ) : (
                    <span>DAY 분할</span>
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>총 DAY</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {r.routine_type === 'whole_set' ? '—' : r.total_days != null ? String(r.total_days) : '—'}
                </div>
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
                  onClick={() =>
                    setAppsModalRoutine({
                      id: r.id,
                      title: r.title || '',
                      total_days: r.total_days,
                      routine_type: r.routine_type,
                    })
                  }
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADIUS.sm,
                    border: `1px solid ${COLORS.border}`,
                    background: COLORS.bg,
                    color: COLORS.textPrimary,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: editLoading || saving ? 'wait' : 'pointer',
                    opacity: editLoading || saving ? 0.65 : 1,
                  }}
                >
                  세트 적용
                </button>
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
                if (teacherId && v.trim() && !isWholeSet) void loadModesForSet(v.trim())
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

          <fieldset
            style={{
              margin: 0,
              padding: '14px 16px',
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              background: 'rgba(249, 250, 251, 0.95)',
            }}
            disabled={Boolean(editingRoutineId)}
          >
            <legend style={{ fontSize: 14, fontWeight: 800, color: COLORS.accentText, padding: '0 6px' }}>
              루틴 타입
            </legend>
            {editingRoutineId ? (
              <p style={{ margin: '0 0 8px', fontSize: 12, color: COLORS.textHint }}>
                저장된 루틴은 타입을 변경할 수 없습니다.
              </p>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: editingRoutineId ? 'default' : 'pointer', fontSize: 13 }}>
                <input
                  type="radio"
                  name="routineType"
                  checked={routineType === 'day_split'}
                  onChange={() => setRoutineType('day_split')}
                  disabled={Boolean(editingRoutineId)}
                />
                <span>
                  <strong>DAY 분할 (기본)</strong>
                  <span style={{ display: 'block', fontSize: 12, color: COLORS.textHint, marginTop: 2 }}>
                    신규 학습 DAY + 복습 주기. 기존 루틴과 동일합니다.
                  </span>
                </span>
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: editingRoutineId ? 'default' : 'pointer', fontSize: 13 }}>
                <input
                  type="radio"
                  name="routineType"
                  checked={routineType === 'whole_set'}
                  onChange={() => {
                    setRoutineType('whole_set')
                    setReviewSteps((prev) =>
                      prev
                        .filter((s) => WHOLE_SET_OPTIONAL_KEYS.has(s.key))
                        .map((s) => ({ ...s, cycle: s.cycle ?? 'daily' })),
                    )
                  }}
                  disabled={Boolean(editingRoutineId)}
                />
                <span>
                  <strong>전체 (유지·복습)</strong>
                  <span style={{ display: 'block', fontSize: 12, color: COLORS.textHint, marginTop: 2 }}>
                    DAY 없이 세트 전체에서 활동을 반복합니다. 오답노트·AI부스터는 매일, 나머지는 주기를 설정할 수 있습니다. 자율 모드 전용.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          {!isWholeSet ? (
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
                    void applyRecommendedModes(
                      ['flashcard', 'recall', 'matching', 'test', 'mypick'],
                      '단어 세트 추천',
                    )
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
                      ['reading', 'dictation', 'writing', 'scramble', 'mypick'],
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
                      ['dictation', 'listening', 'shadowing', 'scramble', 'mypick'],
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
          ) : null}

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
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.accentText }}>
              {isWholeSet ? '활동 구성' : '복습 단계 구성 (순서대로 실행)'}
            </div>
            {isWholeSet ? (
              <>
                <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary }}>
                  필수 활동은 매일 자동 포함됩니다. 아래에서 추가 활동·주기·순서를 설정하세요.
                </p>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: RADIUS.sm,
                    border: `1px solid ${COLORS.border}`,
                    background: 'rgba(240, 253, 250, 0.85)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f766e' }}>필수 활동 — 매일</div>
                  <ul
                    style={{
                      margin: 0,
                      padding: 0,
                      listStyle: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    {WHOLE_SET_REQUIRED_DISPLAY.map((item) => (
                      <li key={item.key} style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>
                        ✓ {item.label}
                      </li>
                    ))}
                  </ul>
                </div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: COLORS.textSecondary }}>
                  추가 활동 (선택 · 순서대로 실행)
                </p>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary }}>(1단계 이상 · 위에서 아래 순서)</p>
                <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.45 }}>
                  값은 <span style={{ fontWeight: 600 }}>routines.review_modes</span>(JSON 배열)에 저장됩니다. 모드·오답노트·&quot;틀린
                  단어만&quot; 옵션을 사용할 수 있어요.
                </p>
              </>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isWholeSet
                ? reviewSteps.map((row, idx) => (
                    <div
                      key={row.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        padding: '10px 12px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${COLORS.border}`,
                        background: '#fff',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textHint, minWidth: 24 }}>{idx + 1}.</span>
                        <select
                          value={row.key}
                          onChange={(e) => {
                            const v = e.target.value
                            setReviewSteps((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? {
                                      ...r,
                                      key: v,
                                      wrongOnly: v === 'test' ? r.wrongOnly : false,
                                      cycle: r.cycle ?? 'daily',
                                    }
                                  : r,
                              ),
                            )
                          }}
                          style={{ flex: 1, minWidth: 160, padding: '8px 10px', fontSize: 14, fontWeight: 600 }}
                        >
                          {WHOLE_SET_OPTIONAL_STEP_OPTIONS.map((o) => (
                            <option key={o.key} value={o.key}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {row.key === 'test' ? (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                            <input
                              type="checkbox"
                              checked={!!row.wrongOnly}
                              onChange={() =>
                                setReviewSteps((prev) =>
                                  prev.map((r) => (r.id === row.id ? { ...r, wrongOnly: !r.wrongOnly } : r)),
                                )
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
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          paddingLeft: 32,
                        }}
                      >
                        <span style={{ color: COLORS.textSecondary, minWidth: 36 }}>주기</span>
                        <select
                          value={row.cycle ?? 'daily'}
                          onChange={(e) =>
                            setReviewSteps((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, cycle: e.target.value } : r)),
                            )
                          }
                          style={{ minWidth: 140, padding: '6px 10px', fontSize: 13, fontWeight: 600 }}
                          aria-label="활동 주기"
                        >
                          {WHOLE_SET_CYCLE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))
                : reviewSteps.map((row, idx) => (
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
                        prev.map((r) =>
                          r.id === row.id
                            ? { ...r, key: v, wrongOnly: v === 'wrong_note' || v === 'booster' ? false : r.wrongOnly }
                            : r,
                        ),
                      )
                    }}
                    style={{ flex: 1, minWidth: 160, padding: '8px 10px', fontSize: 14, fontWeight: 600 }}
                  >
                    {reviewStepOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {row.key !== 'wrong_note' && row.key !== 'booster' ? (
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
                  isWholeSet
                    ? { id: `a-${Date.now()}`, key: 'test', wrongOnly: false, cycle: 'daily' }
                    : { id: `a-${Date.now()}`, key: 'test', wrongOnly: false },
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
              {isWholeSet ? '+ 추가 활동' : '+ 단계 추가'}
            </button>
          </div>

          {!isWholeSet ? (
          <>
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
            <span style={{ fontSize: 12, color: COLORS.textHint }}>
              비워 두면 휴식일 없음으로 저장됩니다. 총 DAY 수를 넘는 번호는 무시됩니다.
            </span>
          </label>

          <div
            style={{
              marginTop: 8,
              padding: '16px 14px',
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              background: 'rgba(248,250,252,0.9)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>고급 설정</p>

            <fieldset style={{ margin: 0, padding: 0, border: 'none' }}>
              <legend style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>
                월 초기화 정책
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="routineResetPolicy"
                    checked={resetPolicy === 'none'}
                    onChange={() => setResetPolicy('none')}
                  />
                  <span>
                    <strong>누적 (기본)</strong>
                    <span style={{ display: 'block', fontSize: 12, color: COLORS.textHint, marginTop: 2 }}>
                      DAY 진행이 계속 이어집니다.
                    </span>
                  </span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="routineResetPolicy"
                    checked={resetPolicy === 'monthly_kst'}
                    onChange={() => setResetPolicy('monthly_kst')}
                  />
                  <span>
                    <strong>매월 1일 초기화 (KST)</strong>
                    <span style={{ display: 'block', fontSize: 12, color: COLORS.textHint, marginTop: 2 }}>
                      학생별 가입일(자율) 루틴에 적용됩니다. 매월 1일 DAY가 처음으로 돌아가며 완료 기록은 보존됩니다. 고정
                      시작일(단체) 세트는 날짜 달력이 우선합니다.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            <fieldset style={{ margin: 0, padding: 0, border: 'none' }}>
              <legend style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>
                진행 방향
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="routineDayDirection"
                    checked={dayDirection === 'forward'}
                    onChange={() => setDayDirection('forward')}
                  />
                  <span>
                    <strong>정방향 (기본)</strong>
                    <span style={{ display: 'block', fontSize: 12, color: COLORS.textHint, marginTop: 2 }}>
                      DAY 1 → 총 DAY 수까지 진행
                    </span>
                  </span>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="routineDayDirection"
                    checked={dayDirection === 'reverse'}
                    onChange={() => setDayDirection('reverse')}
                  />
                  <span>
                    <strong>역방향</strong>
                    <span style={{ display: 'block', fontSize: 12, color: COLORS.textHint, marginTop: 2 }}>
                      DAY N(총 DAY) → 1까지 내려갑니다. 복습 주기(+1·+3·+7)는 며칠 뒤 다시 보기로 동일합니다.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
          </div>
          </>
          ) : null}

          {editingRoutineId && editApplications.length > 0 && !isWholeSet ? (
            <div
              style={{
                padding: '14px 14px',
                borderRadius: RADIUS.md,
                border: `1px dashed ${COLORS.border}`,
                background: 'rgba(255,255,255,0.95)',
              }}
            >
              <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
                시작일 적용 상태
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: COLORS.textSecondary }}>
                {editApplications.map((a) => {
                  const sn = String(a.set_name || '').trim() || '—'
                  const label = a.start_date
                    ? `${String(a.start_date).slice(0, 10)} 고정`
                    : '학생 가입일 기준'
                  return (
                    <li key={sn}>
                      <strong style={{ color: COLORS.textPrimary }}>{sn}</strong>: {label}
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                onClick={() => {
                  const row = routines.find((r) => String(r.id) === String(editingRoutineId))
                  if (row) {
                    setAppsModalRoutine({
                      id: row.id,
                      title: row.title || '',
                      total_days: row.total_days,
                      routine_type: row.routine_type,
                    })
                  }
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: RADIUS.sm,
                  border: `1px solid ${COLORS.primary}`,
                  background: COLORS.bg,
                  color: COLORS.primary,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                시작일 변경하기 →
              </button>
            </div>
          ) : null}

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
              {saving ? '저장 중…' : editingRoutineId ? '저장 (수정)' : isWholeSet ? '저장 (전체 루틴)' : '저장 (routine_days + routine_tasks 생성)'}
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
