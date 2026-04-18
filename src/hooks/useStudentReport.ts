'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import type { StudentReportData } from '@/src/types/report'

/** KST 달력 날짜 YYYY-MM-DD */
function kstYmd(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

function kstDayStartUtcIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00+09:00`).toISOString()
}

function kstDayEndUtcIso(ymd: string): string {
  return new Date(`${ymd}T23:59:59.999+09:00`).toISOString()
}

function daysElapsedKstFromIso(startedAt: string | null): number {
  if (!startedAt) return 0
  const s = kstYmd(new Date(startedAt))
  const t = kstYmd(new Date())
  const d0 = Date.parse(`${s}T12:00:00+09:00`)
  const d1 = Date.parse(`${t}T12:00:00+09:00`)
  if (Number.isNaN(d0) || Number.isNaN(d1)) return 0
  return Math.max(0, Math.round((d1 - d0) / 86400000))
}

type StudentRow = Record<string, unknown>

function pickStudentFields(row: StudentRow, studentId: string): StudentReportData['student'] {
  const uid =
    row['User ID'] != null
      ? String(row['User ID'])
      : row.user_id != null
        ? String(row.user_id)
        : studentId
  const name =
    row.Name != null ? String(row.Name) : row.name != null ? String(row.name) : ''
  const className =
    row.class != null ? String(row.class) : row.Class != null ? String(row.Class) : ''
  const score =
    row.Score != null ? String(row.Score) : row.score != null ? String(row.score) : '0'
  const teacherId =
    row.teacher_id != null ? String(row.teacher_id) : row.teacherId != null ? String(row.teacherId) : null
  const academyId =
    row.academy_id != null ? String(row.academy_id) : row.academyId != null ? String(row.academyId) : null
  return {
    id: uid,
    name,
    className,
    score,
    academyId,
    teacherId,
  }
}

async function fetchStudentByUserId(studentId: string): Promise<{ row: StudentRow | null; err: string | null }> {
  const q1 = await supabase.from('students').select('*').eq('User ID', studentId).maybeSingle()
  if (!q1.error && q1.data) return { row: q1.data as StudentRow, err: null }
  const q2 = await supabase.from('students').select('*').filter('"User ID"', 'eq', studentId).maybeSingle()
  if (!q2.error && q2.data) return { row: q2.data as StudentRow, err: null }
  const errMsg = q1.error?.message || q2.error?.message || '학생을 찾을 수 없습니다.'
  return { row: null, err: errMsg }
}

async function fetchTeacherToeicFlags(teacherId: string | null): Promise<boolean> {
  if (!teacherId) return false
  const { data, error } = await supabase.from('teachers').select('visible_menus').eq('id', teacherId).maybeSingle()
  if (error || !data) return false
  const vm = data.visible_menus as Record<string, unknown> | null | undefined
  if (!vm || typeof vm !== 'object') return false
  return vm.quiz === true || vm.jokbo === true
}

async function fetchTodayAnswerStats(studentId: string): Promise<{
  rate: number | null
  attempts: number
}> {
  const ymd = kstYmd()
  const lo = kstDayStartUtcIso(ymd)
  const hi = kstDayEndUtcIso(ymd)
  const { data, error } = await supabase
    .from('answer_logs')
    .select('correct')
    .eq('student_id', studentId)
    .gte('created_at', lo)
    .lte('created_at', hi)
  if (error) return { rate: null, attempts: 0 }
  const attempts = data?.length ?? 0
  if (attempts === 0) return { rate: null, attempts: 0 }
  const correct = (data || []).filter((r) => r.correct === true).length
  return { rate: Math.round((correct / attempts) * 1000) / 10, attempts }
}

async function fetchTopWrongTags(
  studentId: string,
): Promise<StudentReportData['todayScore']['topWrongTags']> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data, error } = await supabase
    .from('answer_logs')
    .select('tag, correct')
    .eq('student_id', studentId)
    .gte('created_at', since)
  if (error || !data?.length) return []
  const byTag = new Map<string, { wrong: number; total: number }>()
  for (const r of data) {
    const tag = (r.tag && String(r.tag).trim()) || '(태그없음)'
    const cur = byTag.get(tag) || { wrong: 0, total: 0 }
    cur.total += 1
    if (r.correct === false) cur.wrong += 1
    byTag.set(tag, cur)
  }
  const list = [...byTag.entries()]
    .filter(([, v]) => v.wrong > 0)
    .map(([tag, v]) => ({
      tag,
      wrongCount: v.wrong,
      totalCount: v.total,
      wrongRate: v.total ? Math.round((v.wrong / v.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .slice(0, 3)
  return list
}

type RoutineRep = {
  srId: string
  routineId: string
  currentDay: number
  startedAt: string | null
  title: string | null
  totalDays: number
}

async function fetchPrimaryActiveRoutine(studentId: string): Promise<RoutineRep | null> {
  const { data, error } = await supabase
    .from('student_routines')
    .select(
      `
      id,
      current_day,
      started_at,
      routine_id,
      is_active,
      last_activity_at,
      routine:routines ( id, title, total_days )
    `,
    )
    .eq('student_id', studentId)
    .eq('is_active', true)

  if (error || !data?.length) return null
  const rows = [...data].sort((a, b) => {
    const ta = a.last_activity_at ? new Date(String(a.last_activity_at)).getTime() : 0
    const tb = b.last_activity_at ? new Date(String(b.last_activity_at)).getTime() : 0
    return tb - ta
  })
  const r0 = rows[0] as Record<string, unknown>
  const rid = r0.routine_id != null ? String(r0.routine_id) : ''
  const routine = r0.routine as Record<string, unknown> | Record<string, unknown>[] | undefined
  const one = Array.isArray(routine) ? routine[0] : routine
  const title = one?.title != null ? String(one.title) : null
  const totalDays = one?.total_days != null ? Math.max(1, Number(one.total_days) || 1) : 1
  const cd = r0.current_day != null ? Math.max(1, Number(r0.current_day) || 1) : 1
  return {
    srId: String(r0.id ?? ''),
    routineId: rid,
    currentDay: cd,
    startedAt: r0.started_at != null ? String(r0.started_at) : null,
    title,
    totalDays,
  }
}

async function fetchRoutineDayId(routineId: string, dayNumber: number): Promise<string | null> {
  const { data, error } = await supabase
    .from('routine_days')
    .select('id')
    .eq('routine_id', routineId)
    .eq('day_number', dayNumber)
    .maybeSingle()
  if (error || !data?.id) return null
  return String(data.id)
}

async function fetchRequiredTasksForDay(routineDayId: string): Promise<{ id: string; task_type: string }[]> {
  const { data, error } = await supabase
    .from('routine_tasks')
    .select('id, task_type, is_required, is_available')
    .eq('routine_day_id', routineDayId)
  if (error || !data) return []
  return data
    .filter((t) => t.is_available !== false && t.is_required !== false)
    .map((t) => ({ id: String(t.id), task_type: String(t.task_type ?? '') }))
}

async function fetchCompletionsForDay(
  studentId: string,
  routineId: string,
  dayNumber: number,
): Promise<Map<string, { score: number | null; completedAt: string | null }>> {
  const { data, error } = await supabase
    .from('routine_completions')
    .select('task_id, score, completed_at')
    .eq('student_id', studentId)
    .eq('routine_id', routineId)
    .eq('day_number', dayNumber)
  const map = new Map<string, { score: number | null; completedAt: string | null }>()
  if (error || !data) return map
  for (const row of data) {
    const tid = row.task_id != null ? String(row.task_id) : ''
    if (!tid) continue
    const sc = row.score != null && row.score !== '' ? Number(row.score) : null
    const completedAt = row.completed_at != null ? String(row.completed_at) : null
    map.set(tid, {
      score: Number.isFinite(sc as number) ? (sc as number) : null,
      completedAt,
    })
  }
  return map
}

async function buildDailyScores(
  studentId: string,
  rep: RoutineRep,
): Promise<StudentReportData['overallReport']['dailyScores']> {
  const out: StudentReportData['overallReport']['dailyScores'] = []
  const maxDay = Math.min(rep.currentDay, rep.totalDays)
  for (let day = 1; day <= maxDay; day++) {
    const dayRowId = await fetchRoutineDayId(rep.routineId, day)
    if (!dayRowId) {
      out.push({
        day,
        score: 0,
        status: 'missed',
        tasksTotal: 0,
        tasksCompleted: 0,
        tasks: [],
      })
      continue
    }
    const tasks = await fetchRequiredTasksForDay(dayRowId)
    const comp = await fetchCompletionsForDay(studentId, rep.routineId, day)
    const taskDetails: StudentReportData['overallReport']['dailyScores'][0]['tasks'] = []
    let sum = 0
    let n = 0
    let completedN = 0
    for (const t of tasks) {
      const c = comp.get(t.id)
      const sc = c?.score
      const has = c != null
      if (has) completedN += 1
      const scoreVal = has && sc != null && Number.isFinite(sc) ? sc : has ? 0 : null
      if (scoreVal != null) {
        sum += scoreVal
        n += 1
      }
      taskDetails.push({
        taskType: t.task_type,
        score: scoreVal,
        completedAt: c?.completedAt ?? null,
      })
    }
    const avg = n > 0 ? Math.round((sum / n) * 10) / 10 : 0
    let status: 'complete' | 'partial' | 'missed' = 'missed'
    if (avg >= 100) status = 'complete'
    else if (avg > 0) status = 'partial'
    out.push({
      day,
      score: avg,
      status,
      tasksTotal: tasks.length,
      tasksCompleted: completedN,
      tasks: taskDetails,
    })
  }
  return out
}

async function fetchWordLearningAggregates(
  userId: string,
  sinceIso: string | null,
): Promise<StudentReportData['overallReport']['modeStats']> {
  const out: StudentReportData['overallReport']['modeStats'] = {}
  if (!sinceIso) return out
  let q = supabase
    .from('word_learning_history')
    .select('learning_mode, is_correct, studied_at')
    .eq('user_id', userId)
    .gte('studied_at', sinceIso)
    .limit(10000)
  const { data, error } = await q
  if (error || !data) return out
  const byMode = new Map<string, { attempts: number; correct: number; last: string | null }>()
  for (const row of data) {
    const m = String(row.learning_mode ?? 'unknown')
    const cur = byMode.get(m) || { attempts: 0, correct: 0, last: null }
    cur.attempts += 1
    if (row.is_correct === true) cur.correct += 1
    const st = row.studied_at != null ? String(row.studied_at) : null
    if (st && (!cur.last || st > cur.last)) cur.last = st
    byMode.set(m, cur)
  }
  for (const [mode, v] of byMode) {
    const rate = v.attempts ? Math.round((v.correct / v.attempts) * 1000) / 10 : 0
    out[mode] = {
      totalAttempts: v.attempts,
      correctCount: v.correct,
      correctRate: rate,
      avgScore: null,
      maxScore: null,
      lastStudiedAt: v.last,
    }
  }
  return out
}

async function mergeVocabTestModeStats(
  userId: string,
  sinceIso: string | null,
  modeStats: StudentReportData['overallReport']['modeStats'],
): Promise<void> {
  if (!sinceIso) return
  const { data, error } = await supabase
    .from('vocab_test_attempts')
    .select('score_percent, created_at')
    .eq('user_id', userId)
    .gte('created_at', sinceIso)
    .limit(5000)
  if (error || !data?.length) return
  const scores = data.map((r) => Number(r.score_percent)).filter((n) => Number.isFinite(n))
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  const max = scores.length ? Math.max(...scores) : null
  const last = data
    .map((r) => (r.created_at != null ? String(r.created_at) : null))
    .filter(Boolean)
    .sort()
    .pop() as string | undefined
  const key = 'vocabtest'
  const target = modeStats[key] ?? {
    totalAttempts: 0,
    correctCount: 0,
    correctRate: 0,
    avgScore: null,
    maxScore: null,
    lastStudiedAt: null,
  }
  target.totalAttempts = data.length
  target.avgScore = avg != null ? Math.round(avg * 10) / 10 : null
  target.maxScore = max != null ? max : null
  target.lastStudiedAt = last ?? null
  modeStats[key] = target
}

async function mergeMatchingModeStats(
  userId: string,
  sinceIso: string | null,
  modeStats: StudentReportData['overallReport']['modeStats'],
): Promise<void> {
  if (!sinceIso) return
  const { data, error } = await supabase
    .from('matching_scores')
    .select('score, created_at')
    .eq('user_id', userId)
    .gte('created_at', sinceIso)
    .limit(5000)
  if (error || !data?.length) return
  const scores = data.map((r) => Number(r.score)).filter((n) => Number.isFinite(n))
  const maxRaw = scores.length ? Math.max(...scores) : null
  const avgRaw = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  const last = data
    .map((r) => (r.created_at != null ? String(r.created_at) : null))
    .filter(Boolean)
    .sort()
    .pop() as string | undefined
  const m = modeStats.matching || {
    totalAttempts: 0,
    correctCount: 0,
    correctRate: 0,
    avgScore: null,
    maxScore: null,
    lastStudiedAt: null,
  }
  m.totalAttempts += data.length
  m.maxScore = maxRaw
  m.avgScore = avgRaw != null ? Math.round(avgRaw * 10) / 10 : null
  m.lastStudiedAt = last || m.lastStudiedAt
  modeStats.matching = m
}

async function buildToeicDetail(studentId: string): Promise<NonNullable<StudentReportData['toeicDetail']>> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data, error } = await supabase
    .from('answer_logs')
    .select('created_at, correct, tag')
    .eq('student_id', studentId)
    .gte('created_at', since)
    .limit(8000)
  const recentJokboStats: NonNullable<StudentReportData['toeicDetail']>['recentJokboStats'] = []
  const tagMap = new Map<string, { tot: number; cor: number }>()
  if (error || !data?.length) {
    return { recentJokboStats, tagStats: [] }
  }
  const byDate = new Map<string, { tot: number; cor: number }>()
  for (const row of data) {
    const d = row.created_at ? new Date(row.created_at) : new Date()
    const ymd = kstYmd(d)
    const cur = byDate.get(ymd) || { tot: 0, cor: 0 }
    cur.tot += 1
    if (row.correct === true) cur.cor += 1
    byDate.set(ymd, cur)
    const tag = (row.tag && String(row.tag).trim()) || '(태그없음)'
    const tm = tagMap.get(tag) || { tot: 0, cor: 0 }
    tm.tot += 1
    if (row.correct === true) tm.cor += 1
    tagMap.set(tag, tm)
  }
  const sortedDates = [...byDate.keys()].sort()
  for (const date of sortedDates) {
    const v = byDate.get(date)!
    recentJokboStats.push({
      date,
      attempts: v.tot,
      correctRate: v.tot ? Math.round((v.cor / v.tot) * 1000) / 10 : 0,
    })
  }
  const tagStats = [...tagMap.entries()].map(([tag, v]) => ({
    tag,
    totalCount: v.tot,
    correctCount: v.cor,
    correctRate: v.tot ? Math.round((v.cor / v.tot) * 1000) / 10 : 0,
  }))
  return { recentJokboStats, tagStats }
}

async function loadReport(studentId: string): Promise<StudentReportData> {
  const { row, err } = await fetchStudentByUserId(studentId)
  if (err || !row) {
    throw new Error(err || '학생 정보를 불러올 수 없습니다.')
  }
  const student = pickStudentFields(row, studentId)

  const [isToeic, todayAns, topWrong, rep] = await Promise.all([
    fetchTeacherToeicFlags(student.teacherId),
    fetchTodayAnswerStats(studentId),
    fetchTopWrongTags(studentId),
    fetchPrimaryActiveRoutine(studentId),
  ])

  const isToeicFinal = isToeic

  let todayRoutine: StudentReportData['todayRoutine'] = {
    hasActiveRoutine: false,
    routineTitle: null,
    currentDay: null,
    totalDays: null,
    todayProgress: 0,
    requiredTasksTotal: 0,
    requiredTasksCompleted: 0,
  }

  let overall: StudentReportData['overallReport'] = {
    startedAt: null,
    totalDaysElapsed: 0,
    currentDay: 0,
    dailyScores: [],
    modeStats: {},
  }

  if (rep) {
    const dayRowId = await fetchRoutineDayId(rep.routineId, rep.currentDay)
    let reqTasks: { id: string; task_type: string }[] = []
    if (dayRowId) reqTasks = await fetchRequiredTasksForDay(dayRowId)
    const comp = await fetchCompletionsForDay(studentId, rep.routineId, rep.currentDay)
    const completed = reqTasks.filter((t) => comp.has(t.id)).length
    const total = reqTasks.length
    const progress = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0
    todayRoutine = {
      hasActiveRoutine: true,
      routineTitle: rep.title,
      currentDay: rep.currentDay,
      totalDays: rep.totalDays,
      todayProgress: progress,
      requiredTasksTotal: total,
      requiredTasksCompleted: completed,
    }
    const since = rep.startedAt || new Date(0).toISOString()
    overall.startedAt = rep.startedAt
    overall.totalDaysElapsed = daysElapsedKstFromIso(rep.startedAt)
    overall.currentDay = rep.currentDay
    const [dailyScores, modeStats] = await Promise.all([
      buildDailyScores(studentId, rep),
      fetchWordLearningAggregates(studentId, since),
    ])
    overall.dailyScores = dailyScores
    overall.modeStats = modeStats
    await mergeVocabTestModeStats(studentId, since, overall.modeStats)
    await mergeMatchingModeStats(studentId, since, overall.modeStats)
  } else {
    const sinceDefault = new Date(Date.now() - 365 * 86400000).toISOString()
    overall.modeStats = await fetchWordLearningAggregates(studentId, sinceDefault)
    await mergeVocabTestModeStats(studentId, sinceDefault, overall.modeStats)
    await mergeMatchingModeStats(studentId, sinceDefault, overall.modeStats)
  }

  const toeicDetail = isToeicFinal ? await buildToeicDetail(studentId) : null

  return {
    student,
    isToeic: isToeicFinal,
    todayScore: {
      cumulativeScore: student.score,
      todayCorrectRate: todayAns.rate,
      todayAttempts: todayAns.attempts,
      topWrongTags: topWrong,
    },
    todayRoutine,
    overallReport: overall,
    toeicDetail,
  }
}

export function useStudentReport(studentId: string | null): {
  loading: boolean
  error: string | null
  data: StudentReportData | null
  refetch: () => void
} {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<StudentReportData | null>(null)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => {
    setTick((t) => t + 1)
  }, [])

  useEffect(() => {
    if (!studentId || !String(studentId).trim()) {
      setLoading(false)
      setError(null)
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void loadReport(String(studentId).trim())
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setData(null)
          setError(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [studentId, tick])

  return { loading, error, data, refetch }
}
