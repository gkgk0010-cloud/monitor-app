import { supabase } from '@/utils/supabaseClient'

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
 */
export function parseRestDayNumbers(input, totalDays) {
  const s = String(input ?? '').trim()
  if (!s) return [7, 14, 21].filter((d) => d <= totalDays)
  const nums = s.match(/\d+/g)
  if (!nums || nums.length === 0) return [7, 14, 21].filter((d) => d <= totalDays)
  const set = new Set(
    nums.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n) && n >= 1 && n <= totalDays),
  )
  return [...set].sort((a, b) => a - b)
}

/**
 * 비휴일 day_number 한 개에 대한 routine_tasks 행 (order_index 순)
 * @param {{ task_type: string, is_required: boolean }[]} [learningModeTasks] 세트 available_modes 기반 학습 모드 태스크 (암기·리콜 등)
 */
export function buildTasksForStudyDay(dayNumber, reviewOffsets, learningModeTasks = []) {
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
    if (dayNumber > off) {
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
    .select('id, title, set_name, total_days, created_at')
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
}) {
  const td = Math.max(1, parseInt(String(totalDays), 10) || 1)
  const restSet = new Set(restDayNumbers.filter((d) => d >= 1 && d <= td))

  const review_modes = Array.isArray(reviewModes) && reviewModes.length > 0 ? reviewModes : ['test']

  const { data: routineRow, error: e1 } = await supabase
    .from('routines')
    .insert({
      teacher_id: teacherId,
      title: String(title).trim(),
      set_name: String(setName).trim(),
      total_days: td,
      review_modes,
    })
    .select('id')
    .single()

  if (e1 || !routineRow?.id) {
    return { ok: false, error: e1?.message || '루틴을 저장하지 못했습니다.' }
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
    return { ok: false, error: e2?.message || 'routine_days 생성에 실패했습니다.' }
  }

  const sortedDays = [...insertedDays].sort((a, b) => Number(a.day_number) - Number(b.day_number))

  try {
    for (const day of sortedDays) {
      if (day.is_rest) continue
      const dn = Number(day.day_number)
      const taskDefs = buildTasksForStudyDay(dn, reviewOffsets, learningModeTasks)
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
      if (e3) throw new Error(e3.message)
    }
  } catch (err) {
    await supabase.from('routine_days').delete().eq('routine_id', routineId)
    await supabase.from('routines').delete().eq('id', routineId)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  return { ok: true, routineId }
}
