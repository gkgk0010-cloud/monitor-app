/** 모드별 학습 통계 (overallReport.modeStats 값) */
export interface ModeStats {
  totalAttempts: number
  correctCount: number
  correctRate: number // %
  /** 'vocabtest'는 0~100%, 'matching'은 누적점수(원본), 그 외는 null */
  avgScore: number | null
  /** 'vocabtest'는 0~100%, 'matching'은 누적점수(원본), 그 외는 null */
  maxScore: number | null
  lastStudiedAt: string | null
}

export interface StudentReportData {
  student: {
    id: string
    name: string
    className: string
    score: string
    academyId: string | null
    teacherId: string | null
  }

  isToeic: boolean

  todayScore: {
    cumulativeScore: string
    todayCorrectRate: number | null
    todayAttempts: number
    /** KST 오늘, quiz_type=input(족보)만, 태그별 시도·정답 (시도 수 내림차순 상위) */
    todayJokboTagBreakdown: Array<{
      tag: string
      attempts: number
      correctCount: number
      correctRate: number
    }>
    topWrongTags: Array<{
      tag: string
      wrongCount: number
      totalCount: number
      wrongRate: number
    }>
  }

  todayRoutine: {
    hasActiveRoutine: boolean
    routineTitle: string | null
    currentDay: number | null
    /** routines.total_days (활성 루틴이 있을 때만) */
    totalDays: number | null
    todayProgress: number
    requiredTasksTotal: number
    requiredTasksCompleted: number
  }

  overallReport: {
    startedAt: string | null
    totalDaysElapsed: number
    currentDay: number
    dailyScores: Array<{
      day: number
      score: number
      status: 'complete' | 'partial' | 'missed'
      tasksTotal: number
      tasksCompleted: number
      tasks: Array<{
        taskType: string
        score: number | null
        completedAt: string | null
      }>
    }>
    modeStats: {
      [mode: string]: ModeStats
    }
  }

  toeicDetail: {
    recentJokboStats: Array<{
      date: string
      attempts: number
      correctRate: number
    }>
    tagStats: Array<{
      tag: string
      totalCount: number
      correctCount: number
      correctRate: number
    }>
  } | null
}
