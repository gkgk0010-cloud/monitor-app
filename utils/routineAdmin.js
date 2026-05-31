import { supabase } from '@/utils/supabaseClient'

function errMessage(e) {
  if (e == null) return '알 수 없는 오류'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && typeof e.message === 'string') return e.message
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

/**
 * "+1+3+5" / "1,3,5" / "1 + 3 + 5" → 양수 배열
 */
export function parseReviewOffsets(input) {
  const s = String(input ?? '').trim()
  if (!s) return [1, 3, 5]
  const nums = s.match(/\d+/g)
  if (!nums || nums.length === 0) return [1, 3, 5]
  return [...new Set(nums.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n) && n > 0))].sort(
    (a, b) => a - b,
  )
}

/**
 * "DAY7, DAY14" / "7,14,21" → 양수 배열
 * 빈 문자열 = 휴식일 없음 (기본 [7,14,21] 자동 적용 금지 — 저장이 반영되지 않는 것처럼 보이던 버그 원인)
 */
export function parseRestDayNumbers(input, totalDays) {
  const td = Math.max(1, parseInt(String(totalDays), 10) || 1)
  const s = String(input ?? '').trim()
  if (!s) return []
  const nums = s.match(/\d+/g)
  if (!nums || nums.length === 0) return []
  const set = new Set(nums.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n) && n >= 1 && n <= td))
  return [...set].sort((a, b) => a - b)
}

/**
 * 비휴일 day_number 한 개에 대한 routine_tasks 행 (order_index 순)
 * @param {{ task_type: string, is_required: boolean }[]} [learningModeTasks] 세트 available_modes 기반 학습 모드 태스크 (암기·리콜 등)
 * @param {{ totalDays?: number, dayDirection?: 'forward' | 'reverse' }} [opts]
 */
export function buildTasksForStudyDay(dayNumber, reviewOffsets, learningModeTasks = [], opts = {}) {
  const td = opts.totalDays != null ? Math.max(1, parseInt(String(opts.totalDays), 10) || 1) : null
  const dayDirection = opts.dayDirection === 'reverse' ? 'reverse' : 'forward'
  const tasks = []
  let order = 0
  tasks.push({
    task_type: 'vocab_new',
    target_day: dayNumber,
    review_round: null,
    pass_score: null,
    order_index: order++,
    is_available: true,
  })
  for (const m of learningModeTasks) {
    tasks.push({
      task_type: m.task_type,
      target_day: dayNumber,
      review_round: null,
      pass_score: null,
      order_index: order++,
      is_available: true,
      is_required: m.is_required,
    })
  }
  for (let i = 0; i < reviewOffsets.length; i++) {
    const off = reviewOffsets[i]
    if (dayDirection === 'reverse') {
      const targetDay = dayNumber + off
      if (td == null || targetDay <= td) {
        tasks.push({
          task_type: 'vocab_review',
          target_day: targetDay,
          review_round: i + 1,
          pass_score: null,
          order_index: order++,
          is_available: true,
        })
      }
    } else if (dayNumber > off) {
      tasks.push({
        task_type: 'vocab_review',
        target_day: dayNumber - off,
        review_round: i + 1,
        pass_score: null,
        order_index: order++,
        is_available: true,
      })
    }
  }
  return tasks
}

export async function fetchTeacherRoutinesWithStats(teacherId) {
  if (!teacherId) return { routines: [], counts: {}, error: null }

  const { data: routines, error } = await supabase
    .from('routines')
    .select('id, title, set_name, total_days, created_at, reset_policy, day_direction, routine_applications(id, set_name, start_date)')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[routineAdmin] routines 조회:', error.message)
    return { routines: [], counts: {}, error }
  }

  const list = routines || []
  const rids = list.map((r) => r.id)
  if (rids.length === 0) return { routines: list, counts: {}, error: null }

  const activeQ = await supabase
    .from('student_routines')
    .select('routine_id')
    .in('routine_id', rids)
    .eq('is_active', true)

  let srs = activeQ.data
  if (activeQ.error) {
    const fb = await supabase.from('student_routines').select('routine_id').in('routine_id', rids)
    srs = fb.data
  }

  const counts = {}
  for (const row of srs || []) {
    const rid = row.routine_id
    if (rid == null) continue
    counts[rid] = (counts[rid] || 0) + 1
  }

  return { routines: list, counts, error: null }
}

/**
 * routines 1행 + routine_days N행 + routine_tasks 자동 생성
 * @param {{ task_type: string, is_required: boolean }[]} [learningModeTasks] 세트 필수/선택 학습 모드 (routine_tasks.task_type)
 * @returns {{ ok: boolean, error?: string, routineId?: string }}
 */
export async function createRoutineWithDaysAndTasks({
  teacherId,
  title,
  setName,
  totalDays,
  reviewOffsets,
  restDayNumbers,
  learningModeTasks = [],
  /** @type {string[]} 복습 방식 키 (예: ['test','reading']) */
  reviewModes = ['test'],
  /** @type {'none' | 'monthly_kst'} */
  resetPolicy = 'none',
  /** @type {'forward' | 'reverse'} */
  dayDirection = 'forward',
}) {
  const td = Math.max(1, parseInt(String(totalDays), 10) || 1)
  const restSet = new Set(restDayNumbers.filter((d) => d >= 1 && d <= td))

  const review_modes = Array.isArray(reviewModes) && reviewModes.length > 0 ? reviewModes : ['test']
  const reset_policy = resetPolicy === 'monthly_kst' ? 'monthly_kst' : 'none'
  const day_direction = dayDirection === 'reverse' ? 'reverse' : 'forward'

  const { data: routineRow, error: e1 } = await supabase
    .from('routines')
    .insert({
      teacher_id: teacherId,
      title: String(title).trim(),
      set_name: String(setName).trim(),
      total_days: td,
      review_modes,
      reset_policy,
      day_direction,
    })
    .select('id')
    .single()

  if (e1 || !routineRow?.id) {
    return { ok: false, error: errMessage(e1) || '루틴을 저장하지 못했습니다.' }
  }

  const routineId = routineRow.id

  const dayRows = []
  for (let d = 1; d <= td; d++) {
    const isRest = restSet.has(d)
    dayRows.push({
      routine_id: routineId,
      day_number: d,
      is_rest: isRest,
      label: isRest ? '휴식' : null,
    })
  }

  const { data: insertedDays, error: e2 } = await supabase.from('routine_days').insert(dayRows).select('id, day_number, is_rest')

  if (e2 || !insertedDays?.length) {
    await supabase.from('routines').delete().eq('id', routineId)
    return { ok: false, error: errMessage(e2) || 'routine_days 생성에 실패했습니다.' }
  }

  const sortedDays = [...insertedDays].sort((a, b) => Number(a.day_number) - Number(b.day_number))

  try {
    for (const day of sortedDays) {
      if (day.is_rest) continue
      const dn = Number(day.day_number)
      const taskDefs = buildTasksForStudyDay(dn, reviewOffsets, learningModeTasks, {
        totalDays: td,
        dayDirection: day_direction,
      })
      if (taskDefs.length === 0) continue

      const taskRows = taskDefs.map((t) => {
        const row = {
          routine_day_id: day.id,
          task_type: t.task_type,
          target_day: t.target_day,
          review_round: t.review_round,
          pass_score: t.pass_score,
          order_index: t.order_index,
          is_available: t.is_available,
        }
        if (Object.prototype.hasOwnProperty.call(t, 'is_required')) {
          row.is_required = t.is_required
        }
        return row
      })

      const { error: e3 } = await supabase.from('routine_tasks').insert(taskRows)
      if (e3) throw new Error(errMessage(e3))
    }
  } catch (err) {
    await supabase.from('routine_days').delete().eq('routine_id', routineId)
    await supabase.from('routines').delete().eq('id', routineId)
    return { ok: false, error: errMessage(err) }
  }

  const { error: eApp } = await supabase.from('routine_applications').insert({
    routine_id: routineId,
    set_name: String(setName).trim(),
    start_date: null,
  })
  if (eApp) {
    await supabase.from('routine_days').delete().eq('routine_id', routineId)
    await supabase.from('routines').delete().eq('id', routineId)
    return { ok: false, error: errMessage(eApp) || '세트 적용 등록에 실패했습니다.' }
  }

  return { ok: true, routineId }
}

/**
 * 수정 폼 채우기용 — 선생님 소유 루틴 + day/task에서 복습 주기·휴식일·첫날 학습모드 스냅샷
 * @returns {Promise<{ ok: boolean, error?: string, data?: {
 *   routineId: string,
 *   title: string,
 *   setName: string,
 *   totalDays: number,
 *   reviewModes: string[],
 *   restDayNumbers: number[],
 *   reviewOffsets: number[],
 *   learningModeTasks: { task_type: string, is_required: boolean }[],
 * } }>}
 */
export async function fetchRoutineForEdit(routineId, teacherId) {
  if (!routineId || !teacherId) {
    return { ok: false, error: '잘못된 요청입니다.' }
  }

  const { data: r, error: er } = await supabase
    .from('routines')
    .select('id, title, set_name, total_days, review_modes, teacher_id, reset_policy, day_direction')
    .eq('id', routineId)
    .eq('teacher_id', teacherId)
    .maybeSingle()

  if (er) {
    return { ok: false, error: errMessage(er) }
  }
  if (!r) {
    return { ok: false, error: '루틴을 찾을 수 없습니다.' }
  }

  const { data: days, error: ed } = await supabase
    .from('routine_days')
    .select('id, day_number, is_rest, label')
    .eq('routine_id', routineId)
    .order('day_number', { ascending: true })

  if (ed) {
    return { ok: false, error: errMessage(ed) }
  }

  const dayList = days || []
  const dayIds = dayList.map((d) => d.id)
  let tasks = []
  if (dayIds.length > 0) {
    const { data: tt, error: et } = await supabase
      .from('routine_tasks')
      .select('routine_day_id, task_type, target_day, review_round, order_index, is_required, is_available')
      .in('routine_day_id', dayIds)
    if (et) {
      return { ok: false, error: errMessage(et) }
    }
    tasks = tt || []
  }

  const tasksByDay = {}
  for (const t of tasks) {
    const id = t.routine_day_id
    if (!tasksByDay[id]) tasksByDay[id] = []
    tasksByDay[id].push(t)
  }

  const restDayNumbers = dayList
    .filter((d) => d.is_rest)
    .map((d) => Number(d.day_number))
    .sort((a, b) => a - b)

  const offsets = new Set()
  const dayDir = r.day_direction === 'reverse' ? 'reverse' : 'forward'
  for (const d of dayList) {
    if (d.is_rest) continue
    const dn = Number(d.day_number)
    const list = (tasksByDay[d.id] || []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    for (const t of list) {
      const tt = String(t.task_type || '').toLowerCase()
      if (tt === 'vocab_review' && t.target_day != null) {
        const td = Number(t.target_day)
        const off = dayDir === 'reverse' ? td - dn : dn - td
        if (off > 0) offsets.add(off)
      }
    }
  }
  const reviewOffsets = [...offsets].sort((a, b) => a - b)

  const firstStudy = dayList.find((d) => !d.is_rest)
  const learningModeTasks = []
  if (firstStudy) {
    const list = (tasksByDay[firstStudy.id] || []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    for (const t of list) {
      const tt = String(t.task_type || '').toLowerCase()
      if (tt === 'vocab_new' || tt === 'vocab_review') continue
      learningModeTasks.push({
        task_type: String(t.task_type),
        is_required: t.is_required !== false,
      })
    }
  }

  const rawRm = r.review_modes
  /** @type {unknown[]} 문자열 / {mode,wrongOnly?} / {mode:wrong_note} 혼용 */
  const reviewModes = Array.isArray(rawRm) ? rawRm : []

  const { data: appFirst, error: eApp } = await supabase
    .from('routine_applications')
    .select('set_name')
    .eq('routine_id', routineId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (eApp) {
    return { ok: false, error: errMessage(eApp) }
  }

  const setNameFromApp = appFirst?.[0]?.set_name != null ? String(appFirst[0].set_name) : ''

  const { data: appRows, error: eAppList } = await supabase
    .from('routine_applications')
    .select('set_name, start_date')
    .eq('routine_id', routineId)
    .order('created_at', { ascending: true })

  if (eAppList) {
    return { ok: false, error: errMessage(eAppList) }
  }

  const applications = (appRows || []).map((a) => ({
    set_name: a.set_name != null ? String(a.set_name) : '',
    start_date: a.start_date != null ? String(a.start_date).slice(0, 10) : null,
  }))

  return {
    ok: true,
    data: {
      routineId: String(r.id),
      title: r.title != null ? String(r.title) : '',
      setName: setNameFromApp || (r.set_name != null ? String(r.set_name) : ''),
      totalDays: Math.max(1, parseInt(String(r.total_days), 10) || 1),
      reviewModes,
      restDayNumbers,
      reviewOffsets: reviewOffsets.length > 0 ? reviewOffsets : [1, 3, 7],
      learningModeTasks,
      resetPolicy: r.reset_policy === 'monthly_kst' ? 'monthly_kst' : 'none',
      dayDirection: r.day_direction === 'reverse' ? 'reverse' : 'forward',
      applications,
    },
  }
}

/**
 * 기존 루틴 UPDATE + routine_days / routine_tasks 전체 재생성 (student_routines.current_day 유지)
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function updateRoutineWithDaysAndTasks(
  routineId,
  teacherId,
  {
    title,
    setName,
    totalDays,
    reviewOffsets,
    restDayNumbers,
    learningModeTasks = [],
    /** @type {string[]} */
    reviewModes = ['test'],
    /** @type {'none' | 'monthly_kst'} */
    resetPolicy = 'none',
    /** @type {'forward' | 'reverse'} */
    dayDirection = 'forward',
  },
) {
  if (!routineId || !teacherId) {
    return { ok: false, error: '잘못된 요청입니다.' }
  }

  const { data: owner, error: eo } = await supabase
    .from('routines')
    .select('id')
    .eq('id', routineId)
    .eq('teacher_id', teacherId)
    .maybeSingle()

  if (eo) {
    return { ok: false, error: errMessage(eo) }
  }
  if (!owner) {
    return { ok: false, error: '루틴을 찾을 수 없거나 권한이 없습니다.' }
  }

  const td = Math.max(1, parseInt(String(totalDays), 10) || 1)
  const restSet = new Set(restDayNumbers.filter((d) => d >= 1 && d <= td))
  const review_modes = Array.isArray(reviewModes) && reviewModes.length > 0 ? reviewModes : ['test']
  const reset_policy = resetPolicy === 'monthly_kst' ? 'monthly_kst' : 'none'
  const day_direction = dayDirection === 'reverse' ? 'reverse' : 'forward'

  const { data: existingDays, error: eDay } = await supabase
    .from('routine_days')
    .select('id')
    .eq('routine_id', routineId)

  if (eDay) {
    return { ok: false, error: errMessage(eDay) }
  }

  const { error: eUp } = await supabase
    .from('routines')
    .update({
      title: String(title).trim(),
      total_days: td,
      review_modes,
      reset_policy,
      day_direction,
    })
    .eq('id', routineId)
    .eq('teacher_id', teacherId)

  if (eUp) {
    return { ok: false, error: errMessage(eUp) || '루틴 정보를 갱신하지 못했습니다.' }
  }

  const oldDayIds = (existingDays || []).map((d) => d.id).filter(Boolean)
  if (oldDayIds.length > 0) {
    const { error: eDelT } = await supabase.from('routine_tasks').delete().in('routine_day_id', oldDayIds)
    if (eDelT) {
      return { ok: false, error: errMessage(eDelT) || '기존 태스크 삭제에 실패했습니다.' }
    }
  }

  const { error: eDelD } = await supabase.from('routine_days').delete().eq('routine_id', routineId)
  if (eDelD) {
    return { ok: false, error: errMessage(eDelD) || '기존 일차 삭제에 실패했습니다.' }
  }

  const dayRows = []
  for (let d = 1; d <= td; d++) {
    const isRest = restSet.has(d)
    dayRows.push({
      routine_id: routineId,
      day_number: d,
      is_rest: isRest,
      label: isRest ? '휴식' : null,
    })
  }

  const { data: insertedDays, error: e2 } = await supabase.from('routine_days').insert(dayRows).select('id, day_number, is_rest')

  if (e2 || !insertedDays?.length) {
    return { ok: false, error: errMessage(e2) || 'routine_days 재생성에 실패했습니다.' }
  }

  const sortedDays = [...insertedDays].sort((a, b) => Number(a.day_number) - Number(b.day_number))

  try {
    for (const day of sortedDays) {
      if (day.is_rest) continue
      const dn = Number(day.day_number)
      const taskDefs = buildTasksForStudyDay(dn, reviewOffsets, learningModeTasks, {
        totalDays: td,
        dayDirection: day_direction,
      })
      if (taskDefs.length === 0) continue

      const taskRows = taskDefs.map((t) => {
        const row = {
          routine_day_id: day.id,
          task_type: t.task_type,
          target_day: t.target_day,
          review_round: t.review_round,
          pass_score: t.pass_score,
          order_index: t.order_index,
          is_available: t.is_available,
        }
        if (Object.prototype.hasOwnProperty.call(t, 'is_required')) {
          row.is_required = t.is_required
        }
        return row
      })

      const { error: e3 } = await supabase.from('routine_tasks').insert(taskRows)
      if (e3) throw new Error(errMessage(e3))
    }
  } catch (err) {
    return { ok: false, error: errMessage(err) }
  }

  return { ok: true }
}

/**
 * 루틴 완전 삭제 — student_routines → routine_tasks → routine_days → routines
 * (FK·CASCADE 설정과 무관하게 일관되게 정리)
 * @param {string} routineId
 * @param {string} teacherId
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function deleteRoutineForTeacher(routineId, teacherId) {
  if (!routineId || !teacherId) {
    return { ok: false, error: '잘못된 요청입니다.' }
  }

  const { data: owner, error: eo } = await supabase
    .from('routines')
    .select('id')
    .eq('id', routineId)
    .eq('teacher_id', teacherId)
    .maybeSingle()

  if (eo) {
    return { ok: false, error: errMessage(eo) }
  }
  if (!owner) {
    return { ok: false, error: '루틴을 찾을 수 없거나 권한이 없습니다.' }
  }

  const { error: eSr } = await supabase.from('student_routines').delete().eq('routine_id', routineId)
  if (eSr) {
    return { ok: false, error: errMessage(eSr) || '학생에게 연결된 루틴을 해제하지 못했습니다.' }
  }

  const { data: dayRows, error: eDayQ } = await supabase.from('routine_days').select('id').eq('routine_id', routineId)
  if (eDayQ) {
    return { ok: false, error: errMessage(eDayQ) }
  }
  const dayIds = (dayRows || []).map((d) => d.id).filter(Boolean)
  if (dayIds.length > 0) {
    const { error: eT } = await supabase.from('routine_tasks').delete().in('routine_day_id', dayIds)
    if (eT) {
      return { ok: false, error: errMessage(eT) || '루틴 태스크를 삭제하지 못했습니다.' }
    }
  }

  const { error: eD } = await supabase.from('routine_days').delete().eq('routine_id', routineId)
  if (eD) {
    return { ok: false, error: errMessage(eD) || '루틴 일차를 삭제하지 못했습니다.' }
  }

  const { error: eR } = await supabase
    .from('routines')
    .delete()
    .eq('id', routineId)
    .eq('teacher_id', teacherId)
  if (eR) {
    return { ok: false, error: errMessage(eR) || '루틴을 삭제하지 못했습니다.' }
  }

  return { ok: true }
}

/**
 * 루틴에 연결된 단어세트 적용 목록
 * @returns {Promise<{ ok: boolean, error?: string, rows?: { id: string, set_name: string, start_date: string | null, created_at: string }[] }>}
 */
export async function fetchRoutineApplications(routineId, teacherId) {
  if (!routineId || !teacherId) {
    return { ok: false, error: '잘못된 요청입니다.', rows: [] }
  }
  const { data: owner, error: eo } = await supabase
    .from('routines')
    .select('id')
    .eq('id', routineId)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (eo) return { ok: false, error: errMessage(eo), rows: [] }
  if (!owner) return { ok: false, error: '루틴을 찾을 수 없습니다.', rows: [] }

  const { data, error } = await supabase
    .from('routine_applications')
    .select('id, set_name, start_date, created_at')
    .eq('routine_id', routineId)
    .order('created_at', { ascending: true })
  if (error) return { ok: false, error: errMessage(error), rows: [] }
  return { ok: true, rows: data || [] }
}

/**
 * @param {{ teacherId: string, routineId: string, setName: string, startDate: string | null }} p startDate null = 가입일 기준
 */
export async function addRoutineApplication({ teacherId, routineId, setName, startDate }) {
  if (!teacherId || !routineId || !String(setName || '').trim()) {
    return { ok: false, error: '잘못된 요청입니다.' }
  }
  const { data: owner, error: eo } = await supabase
    .from('routines')
    .select('id')
    .eq('id', routineId)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (eo) return { ok: false, error: errMessage(eo) }
  if (!owner) return { ok: false, error: '루틴을 찾을 수 없습니다.' }

  const sd = startDate != null && String(startDate).trim() !== '' ? String(startDate).trim() : null
  const { error } = await supabase.from('routine_applications').insert({
    routine_id: routineId,
    set_name: String(setName).trim(),
    start_date: sd,
  })
  if (error) return { ok: false, error: errMessage(error) }
  return { ok: true }
}

/**
 * @param {{ teacherId: string, applicationId: string, startDate: string | null }} p
 */
export async function updateRoutineApplicationStart({ teacherId, applicationId, startDate }) {
  if (!teacherId || !applicationId) return { ok: false, error: '잘못된 요청입니다.' }
  const { data: appRow, error: ea } = await supabase
    .from('routine_applications')
    .select('routine_id')
    .eq('id', applicationId)
    .maybeSingle()
  if (ea) return { ok: false, error: errMessage(ea) }
  if (!appRow?.routine_id) return { ok: false, error: '적용 행을 찾을 수 없습니다.' }

  const { data: owner } = await supabase
    .from('routines')
    .select('id')
    .eq('id', appRow.routine_id)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (!owner) return { ok: false, error: '권한이 없습니다.' }

  const sd = startDate != null && String(startDate).trim() !== '' ? String(startDate).trim() : null
  const { error } = await supabase.from('routine_applications').update({ start_date: sd }).eq('id', applicationId)
  if (error) return { ok: false, error: errMessage(error) }
  return { ok: true }
}

/**
 * 적용 해제 — FK CASCADE 로 해당 세트 학생 진행 행 삭제. 마지막 1개는 삭제 불가.
 */
export async function deleteRoutineApplication({ teacherId, applicationId }) {
  if (!teacherId || !applicationId) return { ok: false, error: '잘못된 요청입니다.' }
  const { data: appRow, error: ea } = await supabase
    .from('routine_applications')
    .select('routine_id')
    .eq('id', applicationId)
    .maybeSingle()
  if (ea) return { ok: false, error: errMessage(ea) }
  const rid = appRow?.routine_id
  if (!rid) return { ok: false, error: '적용 행을 찾을 수 없습니다.' }

  const { data: owner } = await supabase.from('routines').select('id').eq('id', rid).eq('teacher_id', teacherId).maybeSingle()
  if (!owner) return { ok: false, error: '권한이 없습니다.' }

  const { count, error: ec } = await supabase
    .from('routine_applications')
    .select('*', { count: 'exact', head: true })
    .eq('routine_id', rid)
  if (ec) return { ok: false, error: errMessage(ec) }
  if ((count ?? 0) <= 1) {
    return { ok: false, error: '마지막 적용 세트는 해제할 수 없습니다. 루틴 전체 삭제를 이용해 주세요.' }
  }

  const { error } = await supabase.from('routine_applications').delete().eq('id', applicationId)
  if (error) return { ok: false, error: errMessage(error) }
  return { ok: true }
}
