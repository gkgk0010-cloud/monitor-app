/**
 * 학생 × 선생 세트 단어 학습 현황 (Day 단위) — 모니터 보고용
 * word_learning_history, vocab_test_attempts, matching_scores, scramble_scores, 오답/졸업 집계
 */

/** @typedef {import('@supabase/supabase-js').SupabaseClient} SupabaseClient */

/** @typedef {{
 *   learning_mode: string
 *   attempts: number
 *   correct: number
 *   distinctWords: number
 *   lastStudiedAt: string | null
 * }} ModeAgg */

/** 모드 라벨(모니터 표시) */
export const VOCAB_MONITOR_MODE_LABELS = {
  flashcard: '암기',
  memorize: '암기',
  recall: '리콜',
  matching: '매칭',
  test: '테스트',
  vocabtest: '테스트',
  image: '이미지',
  writing: '라이팅',
  read_aloud: '낭독',
  readAloud: '낭독',
  shadowing: '쉐도잉',
  listening: '집중듣기',
  scramble: '스크램블',
  dictation: '딕테이션',
  translation: '말하기 번역',
  speaking_translation: '말하기 번역',
  composition: '입영작',
  reading: '직독직해',
  mypick: '마이픽',
  wrong_note: '오답노트',
}

function modeLabel(mode) {
  const m = String(mode || '').trim()
  return VOCAB_MONITOR_MODE_LABELS[m] ?? VOCAB_MONITOR_MODE_LABELS[m.toLowerCase()] ?? (m || '기타')
}

function normalizeWlMode(mode) {
  const m = String(mode || '').trim().toLowerCase()
  if (m === 'test') return 'vocabtest'
  return m || 'unknown'
}

/**
 * @param {SupabaseClient} supabase
 * @param {{ studentId: string, teacherId: string }} opts
 */
export async function fetchStudentVocabDayReports(supabase, { studentId, teacherId }) {
  const uid = String(studentId || '').replace(/\s+/g, '').trim()
  const tid = String(teacherId || '').trim()
  if (!supabase || !uid || !tid) {
    return { error: null, setNames: [], reports: {}, wordsPerDay: {} }
  }

  /** @type {Record<string, number>} 키: `${setName}\t${day}` */
  const wordsPerDay = {}

  try {
    const { data: wRows, error: wErr } = await supabase
      .from('words')
      .select('set_name, day')
      .eq('teacher_id', tid)
      .limit(200000)

    if (wErr) {
      console.warn('[studentVocabDayReports] words', wErr.message)
    } else {
      for (const r of wRows || []) {
        const sn = String(r.set_name ?? '').trim()
        const d = Math.floor(Number(r.day) || 0)
        if (!sn || d < 1) continue
        const k = `${sn}\t${d}`
        wordsPerDay[k] = (wordsPerDay[k] || 0) + 1
      }
    }
  } catch (e) {
    console.warn('[studentVocabDayReports] words exception', e)
  }

  const setNamesSorted = [...new Set(Object.keys(wordsPerDay).map((k) => k.split('\t')[0]))].sort((a, b) =>
    a.localeCompare(b, 'ko'),
  )

  /** @type {Record<string, {
   *    setName: string
   *    day: number
   *    wordsInDay: number
   *    distinctWordsStudied: number
   *    overallProgressPct: number
   *    wlEvents: number
   *    overallCorrectRate: number | null
   *    lastStudiedAt: string | null
   *    modes: Record<string, ModeAgg>
   *    vocabTests: { count: number, avgPct: number | null, lastAt: string | null, avgCorrectRatio: number | null }
   *    matchingBest: number | null
   *    matchingAttempts: number
   *    matchingLastAt: string | null
   *    scrambleBest: number | null
   *    scrambleAttempts: number
   *    scrambleLastAt: string | null
   *    wrongInDayCount: number
   *    graduatedFromDayCount: number
   * }>}
   */
  const reports = {}

  function ensureReport(setName, day) {
    const k = `${setName}\t${day}`
    if (!reports[k]) {
      const wordsInDay = wordsPerDay[k] || 0
      reports[k] = {
        setName,
        day,
        wordsInDay,
        distinctWordsStudied: 0,
        overallProgressPct: 0,
        wlEvents: 0,
        overallCorrectRate: null,
        lastStudiedAt: null,
        modes: {},
        vocabTests: { count: 0, avgPct: null, lastAt: null, avgCorrectRatio: null },
        matchingBest: null,
        matchingAttempts: 0,
        matchingLastAt: null,
        scrambleBest: null,
        scrambleAttempts: 0,
        scrambleLastAt: null,
        wrongInDayCount: 0,
        graduatedFromDayCount: 0,
      }
    }
    return reports[k]
  }

  // 학생 활동만 있는 조합까지 행 만들기 위해, 이후 각 소스에서 ensureReport 호출

  const { data: hist, error: hErr } = await supabase
    .from('word_learning_history')
    .select('learning_mode,set_name,day,word_id,is_correct,studied_at')
    .eq('user_id', uid)
    .not('set_name', 'is', null)
    .not('day', 'is', null)
    .order('studied_at', { ascending: false })
    .limit(15000)

  if (hErr) console.warn('[studentVocabDayReports] word_learning_history', hErr.message)

  const wlWordSets = new Map() /* key -> Set word_id */
  /** @type {Map<string, Map<string, Set<string>>>} 키: set\tday → mode → word_ids */
  const wlModeWords = new Map()

  function addWlModeWord(setName, day, mode, wordId) {
    const wk = `${setName}\t${day}`
    let tm = wlModeWords.get(wk)
    if (!tm) {
      tm = new Map()
      wlModeWords.set(wk, tm)
    }
    let s = tm.get(mode)
    if (!s) {
      s = new Set()
      tm.set(mode, s)
    }
    if (wordId) s.add(String(wordId))
  }

  for (const r of hist || []) {
    const sn = String(r.set_name ?? '').trim()
    const day = Math.floor(Number(r.day) || 0)
    if (!sn || day < 1) continue
    const rep = ensureReport(sn, day)
    const mode = normalizeWlMode(r.learning_mode)
    addWlModeWord(sn, day, mode, r.word_id)
    if (!rep.modes[mode]) {
      rep.modes[mode] = {
        learning_mode: mode,
        attempts: 0,
        correct: 0,
        distinctWords: 0,
        lastStudiedAt: null,
      }
    }
    const m = rep.modes[mode]
    m.attempts += 1
    if (r.is_correct === true) m.correct += 1
    const st = r.studied_at != null ? String(r.studied_at) : null
    if (st && (!m.lastStudiedAt || st > m.lastStudiedAt)) m.lastStudiedAt = st
    rep.wlEvents += 1
    if (!rep.lastStudiedAt || (st && st > rep.lastStudiedAt)) rep.lastStudiedAt = st

    const wk = `${sn}\t${day}`
    let ws = wlWordSets.get(wk)
    if (!ws) {
      ws = new Set()
      wlWordSets.set(wk, ws)
    }
    if (r.word_id) ws.add(String(r.word_id))
  }

  const { data: vt, error: vtErr } = await supabase
    .from('vocab_test_attempts')
    .select('set_name,day,score_percent,correct,total,created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(2000)

  if (vtErr) console.warn('[studentVocabDayReports] vocab_test_attempts', vtErr.message)

  for (const r of vt || []) {
    const sn = String(r.set_name ?? '').trim()
    const day = Math.floor(Number(r.day) || 0)
    if (!sn || day < 1) continue
    const rep = ensureReport(sn, day)
    const pct = Number(r.score_percent)
    const cor = Number(r.correct)
    const tot = Number(r.total)
    rep.vocabTests.count += 1
    rep.vocabTests._sumPct = (rep.vocabTests._sumPct || 0) + (Number.isFinite(pct) ? pct : 0)
    rep.vocabTests._nPct = (rep.vocabTests._nPct || 0) + (Number.isFinite(pct) ? 1 : 0)
    if (Number.isFinite(cor) && Number.isFinite(tot) && tot > 0) {
      rep.vocabTests._sumRatio = (rep.vocabTests._sumRatio || 0) + cor / tot
      rep.vocabTests._nRatio = (rep.vocabTests._nRatio || 0) + 1
    }
    const ca = r.created_at != null ? String(r.created_at) : null
    if (ca && (!rep.vocabTests.lastAt || ca > rep.vocabTests.lastAt)) rep.vocabTests.lastAt = ca
    if (!rep.lastStudiedAt || (ca && ca > rep.lastStudiedAt)) rep.lastStudiedAt = ca
  }

  const { data: ms, error: msErr } = await supabase
    .from('matching_scores')
    .select('set_name,day,score,created_at')
    .eq('user_id', uid)
    .limit(3000)

  if (msErr) console.warn('[studentVocabDayReports] matching_scores', msErr.message)

  for (const r of ms || []) {
    const sn = String(r.set_name ?? '').trim()
    const day = Math.floor(Number(r.day) || 0)
    if (!sn || day < 1) continue
    const rep = ensureReport(sn, day)
    const sc = Number(r.score)
    rep.matchingAttempts += 1
    if (Number.isFinite(sc)) {
      if (rep.matchingBest == null || sc > rep.matchingBest) rep.matchingBest = sc
    }
    const ca = r.created_at != null ? String(r.created_at) : null
    if (ca && (!rep.matchingLastAt || ca > rep.matchingLastAt)) rep.matchingLastAt = ca
    if (!rep.lastStudiedAt || (ca && ca > rep.lastStudiedAt)) rep.lastStudiedAt = ca
  }

  const { data: ss, error: ssErr } = await supabase
    .from('scramble_scores')
    .select('set_name,day,score,created_at')
    .eq('user_id', uid)
    .limit(2000)

  if (ssErr) console.warn('[studentVocabDayReports] scramble_scores', ssErr.message)

  for (const r of ss || []) {
    const sn = String(r.set_name ?? '').trim()
    const day = Math.floor(Number(r.day) || 0)
    if (!sn || day < 1) continue
    const rep = ensureReport(sn, day)
    const sc = Number(r.score)
    rep.scrambleAttempts += 1
    if (Number.isFinite(sc)) {
      if (rep.scrambleBest == null || sc > rep.scrambleBest) rep.scrambleBest = sc
    }
    const ca = r.created_at != null ? String(r.created_at) : null
    if (ca && (!rep.scrambleLastAt || ca > rep.scrambleLastAt)) rep.scrambleLastAt = ca
    if (!rep.lastStudiedAt || (ca && ca > rep.lastStudiedAt)) rep.lastStudiedAt = ca
  }

  // 오답 / 졸업 — 해당 선생 세트 단어만 words 조회 후 Day 집계
  try {
    const { data: waRows } = await supabase.from('vocab_wrong_answers').select('word_id').eq('user_id', uid).limit(8000)

    const wids = [...new Set((waRows || []).map((r) => r.word_id).filter(Boolean))]
    const chunks = []
    for (let i = 0; i < wids.length; i += 80) chunks.push(wids.slice(i, i + 80))

    const wordMeta = []
    for (const ch of chunks) {
      if (ch.length === 0) continue
      const { data: wd, error: wdErr } = await supabase
        .from('words')
        .select('id,set_name,day')
        .eq('teacher_id', tid)
        .in('id', ch)

      if (wdErr) {
        console.warn('[studentVocabDayReports] words lookup wrong', wdErr.message)
      } else {
        wordMeta.push(...(wd || []))
      }
    }
    for (const w of wordMeta) {
      const sn = String(w.set_name ?? '').trim()
      const day = Math.floor(Number(w.day) || 0)
      if (!sn || day < 1) continue
      ensureReport(sn, day).wrongInDayCount += 1
    }
  } catch (e) {
    console.warn('[studentVocabDayReports] wrong aggregation', e)
  }

  try {
    const { data: wgRows } = await supabase.from('vocab_wrong_graduated').select('word_id').eq('user_id', uid).limit(8000)

    const gids = [...new Set((wgRows || []).map((r) => r.word_id).filter(Boolean))]
    const chunksG = []
    for (let i = 0; i < gids.length; i += 80) chunksG.push(gids.slice(i, i + 80))

    const metaG = []
    for (const ch of chunksG) {
      if (ch.length === 0) continue
      const { data: wd, error: wdErr } = await supabase
        .from('words')
        .select('id,set_name,day')
        .eq('teacher_id', tid)
        .in('id', ch)

      if (wdErr) console.warn('[studentVocabDayReports] words lookup graduated', wdErr.message)
      else metaG.push(...(wd || []))
    }
    for (const w of metaG) {
      const sn = String(w.set_name ?? '').trim()
      const day = Math.floor(Number(w.day) || 0)
      if (!sn || day < 1) continue
      ensureReport(sn, day).graduatedFromDayCount += 1
    }
  } catch (e) {
    console.warn('[studentVocabDayReports] graduated aggregation', e)
  }

  // 후처리: distinct 단어수, 진행률, 정답률, 테스트 평균
  const allSets = new Set(setNamesSorted)
  for (const k of Object.keys(reports)) {
    allSets.add(k.split('\t')[0])
  }
  const setNamesMerged = [...allSets].sort((a, b) => a.localeCompare(b, 'ko'))

  for (const [, rep] of Object.entries(reports)) {
    const wk = `${rep.setName}\t${rep.day}`
    rep.wordsInDay = wordsPerDay[wk] ?? rep.wordsInDay
    const ws = wlWordSets.get(wk)
    rep.distinctWordsStudied = ws ? ws.size : 0
    if (rep.wordsInDay > 0) {
      rep.overallProgressPct = Math.min(100, Math.round((rep.distinctWordsStudied / rep.wordsInDay) * 100))
    } else if (rep.distinctWordsStudied > 0) {
      rep.overallProgressPct = null
    } else rep.overallProgressPct = 0

    let att = 0
    let cor = 0
    const modeWordMap = wlModeWords.get(wk)
    for (const mk of Object.keys(rep.modes)) {
      const agg = rep.modes[mk]
      att += agg.attempts
      cor += agg.correct
      const s = modeWordMap?.get(mk)
      agg.distinctWords = s ? s.size : 0
    }
    rep.overallCorrectRate = att > 0 ? Math.round((cor / att) * 1000) / 10 : null

    if (rep.vocabTests._nPct) {
      rep.vocabTests.avgPct = Math.round((rep.vocabTests._sumPct / rep.vocabTests._nPct) * 10) / 10
    }
    if (rep.vocabTests._nRatio) {
      rep.vocabTests.avgCorrectRatio = Math.round((rep.vocabTests._sumRatio / rep.vocabTests._nRatio) * 1000) / 10
    }
    delete rep.vocabTests._sumPct
    delete rep.vocabTests._nPct
    delete rep.vocabTests._sumRatio
    delete rep.vocabTests._nRatio

    if (!rep.modes.matching && (rep.matchingAttempts > 0 || rep.matchingBest != null)) {
      rep.modes.matching = {
        learning_mode: 'matching',
        attempts: rep.matchingAttempts,
        correct: rep.matchingAttempts,
        distinctWords: 0,
        lastStudiedAt: rep.matchingLastAt,
      }
    }
    if (!rep.modes.scramble && rep.scrambleAttempts > 0) {
      rep.modes.scramble = {
        learning_mode: 'scramble',
        attempts: rep.scrambleAttempts,
        correct: rep.scrambleAttempts,
        distinctWords: 0,
        lastStudiedAt: rep.scrambleLastAt,
      }
    }
  }

  /**
   * 세트별 max day (카드 목록 스켈레톤)
   * @type {Record<string, number>}
   */
  const maxDayBySet = {}
  for (const k of Object.keys(wordsPerDay)) {
    const [sn, dStr] = k.split('\t')
    const d = Number(dStr)
    if (!sn || !Number.isFinite(d)) continue
    maxDayBySet[sn] = Math.max(maxDayBySet[sn] || 0, d)
  }

  return {
    error: null,
    setNames: setNamesMerged,
    maxDayBySet,
    wordsPerDay,
    reports,
    modeLabel,
  }
}

export function listDayNumbersForSet(setName, { wordsPerDay, reports, maxDayBySet }) {
  const s = String(setName || '').trim()
  if (!s) return []
  const ds = new Set()
  const max = maxDayBySet[s] || 0
  for (let d = 1; d <= max; d += 1) ds.add(d)
  for (const k of Object.keys(reports || {})) {
    const [sn, dStr] = k.split('\t')
    if (sn === s) {
      const n = Number(dStr)
      if (Number.isFinite(n) && n >= 1) ds.add(Math.floor(n))
    }
  }
  for (const k of Object.keys(wordsPerDay || {})) {
    const [sn, dStr] = k.split('\t')
    if (sn === s) {
      const n = Number(dStr)
      if (Number.isFinite(n) && n >= 1) ds.add(Math.floor(n))
    }
  }
  return [...ds].sort((a, b) => a - b)
}

/** Day 카드용 — 활동 없을 때 플레이스홀더 */
export function getDayReportViewRow(reports, wordsPerDay, setName, day) {
  const sn = String(setName || '').trim()
  const d = Math.floor(Number(day) || 0)
  if (!sn || d < 1) return null
  const k = `${sn}\t${d}`
  const baseWords = wordsPerDay[k] || 0
  const hit = reports[k]
  if (hit) return { ...hit, wordsInDay: baseWords || hit.wordsInDay }
  return {
    setName: sn,
    day: d,
    wordsInDay: baseWords,
    distinctWordsStudied: 0,
    overallProgressPct: 0,
    wlEvents: 0,
    overallCorrectRate: null,
    lastStudiedAt: null,
    modes: {},
    vocabTests: { count: 0, avgPct: null, lastAt: null, avgCorrectRatio: null },
    matchingBest: null,
    matchingAttempts: 0,
    matchingLastAt: null,
    scrambleBest: null,
    scrambleAttempts: 0,
    scrambleLastAt: null,
    wrongInDayCount: 0,
    graduatedFromDayCount: 0,
    _empty: baseWords === 0,
  }
}

/** 복사용 텍스트 (한 학생 × 한 세트) */
export function formatVocabDayReportsCopy(studentName, setName, list) {
  const name = String(studentName || '').trim() || '학생'
  const lines = [
    `📗 [똑패스 단어] 개별 Day 보고서`,
    `${name} · 세트 「${setName}」`,
    '',
  ]
  for (const row of list) {
    lines.push(`── Day ${row.day} ──`)
    lines.push(`  단어 수(교재): ${row.wordsInDay}개`)
    lines.push(
      `  학습한 단어(추정): ${row.distinctWordsStudied}개 · 진행률 ${row.wordsInDay > 0 ? (row.overallProgressPct == null ? '—' : `${row.overallProgressPct}%`) : '─'}`,
    )
    lines.push(`  학습 로그 건수: ${row.wlEvents}건 (정오답률 ${row.overallCorrectRate != null ? `${row.overallCorrectRate}%` : '─'})`)
    if (row.vocabTests.count)
      lines.push(
        `  테스트: ${row.vocabTests.count}회 · 평균 ${row.vocabTests.avgPct ?? '─'}% (문항정답률 ${row.vocabTests.avgCorrectRatio ?? '─'}%)`,
      )
    if (row.matchingAttempts)
      lines.push(`  매칭: ${row.matchingAttempts}회 · 최고 ${row.matchingBest ?? '─'}점`)
    if (row.scrambleAttempts)
      lines.push(`  스크램블: ${row.scrambleAttempts}회 · 최고 ${row.scrambleBest ?? '─'}점`)
    lines.push(`  오답노트(해당 Day 단어): ${row.wrongInDayCount}개 · 졸업 누적(해당 Day): ${row.graduatedFromDayCount}개`)
    lines.push(`  최근 학습: ${row.lastStudiedAt ? new Date(row.lastStudiedAt).toLocaleString('ko-KR') : '─'}`)
    const modes = Object.values(row.modes || {}).sort((a, b) => b.attempts - a.attempts)
    if (modes.length) {
      lines.push('  모드별:')
      for (const m of modes) {
        const rate = m.attempts ? Math.round((m.correct / m.attempts) * 1000) / 10 : 0
        lines.push(
          `    · ${modeLabel(m.learning_mode)}: ${m.attempts}건 · 정답률 ${rate}% · 단어 노출 ${m.distinctWords}개`,
        )
      }
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}
