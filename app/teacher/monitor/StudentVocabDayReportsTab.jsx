'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { COLORS, RADIUS } from '@/utils/tokens'
import { supabase } from '@/utils/supabaseClient'
import {
  fetchStudentVocabDayReports,
  formatVocabDayReportsCopy,
  getDayReportViewRow,
  listDayNumbersForSet,
} from '@/utils/studentVocabDayReports'

function hasDayActivity(row) {
  if (!row) return false
  return (
    (row.wlEvents || 0) > 0 ||
    (row.vocabTests?.count || 0) > 0 ||
    (row.matchingAttempts || 0) > 0 ||
    (row.scrambleAttempts || 0) > 0 ||
    (row.wrongInDayCount || 0) > 0 ||
    (row.graduatedFromDayCount || 0) > 0
  )
}

function MiniProgress({ pct }) {
  const p = pct == null || Number.isNaN(Number(pct)) ? 0 : Math.min(100, Math.max(0, Number(pct)))
  return (
    <div
      style={{
        height: 6,
        borderRadius: 999,
        background: COLORS.border,
        overflow: 'hidden',
      }}
      title={`${p}%`}
    >
      <div style={{ height: '100%', width: `${p}%`, background: COLORS.primary, borderRadius: 999 }} />
    </div>
  )
}

/** @param {{ studentId: string, teacherId: string, studentName: string, onCopyReady?: (fn: () => string) => void }} props */
export default function StudentVocabDayReportsTab({ studentId, teacherId, studentName, onCopyReady }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [payload, setPayload] = useState(null)
  const [selectedSet, setSelectedSet] = useState('')
  const [openDays, setOpenDays] = useState(() => new Set())

  const load = useCallback(async () => {
    const sid = String(studentId || '').replace(/\s+/g, '').trim()
    const tid = String(teacherId || '').trim()
    if (!sid || !tid) return
    setLoading(true)
    setErr(null)
    try {
      const r = await fetchStudentVocabDayReports(supabase, { studentId: sid, teacherId: tid })
      setPayload(r)
      if (Array.isArray(r.setNames) && r.setNames.length > 0) {
        setSelectedSet((prev) => (prev && r.setNames.includes(prev) ? prev : r.setNames[0]))
      } else setSelectedSet('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [studentId, teacherId])

  useEffect(() => {
    void load()
  }, [load])

  const dayNumbers = useMemo(() => {
    if (!payload || !selectedSet) return []
    const nums = listDayNumbersForSet(selectedSet, payload)
    return nums
      .map((d) => getDayReportViewRow(payload.reports, payload.wordsPerDay, selectedSet, d))
      .filter(Boolean)
      .filter((row) => (row.wordsInDay || 0) > 0 || hasDayActivity(row))
  }, [payload, selectedSet])

  const copySection = useCallback(() => {
    if (!studentName || !selectedSet || !payload) return ''
    const list = listDayNumbersForSet(selectedSet, payload)
      .map((d) => getDayReportViewRow(payload.reports, payload.wordsPerDay, selectedSet, d))
      .filter(Boolean)
      .filter((row) => (row.wordsInDay || 0) > 0 || hasDayActivity(row))
    return formatVocabDayReportsCopy(studentName, selectedSet, list)
  }, [studentName, selectedSet, payload])

  useEffect(() => {
    if (!onCopyReady) return undefined
    onCopyReady(copySection)
    return () => onCopyReady(null)
  }, [onCopyReady, copySection])

  const modeLabelFn = payload?.modeLabel || ((x) => x)

  if (!teacherId || !studentId) {
    return (
      <p style={{ margin: '8px 0', color: COLORS.textSecondary, fontSize: 13 }}>교사 또는 학생 식별이 없어요.</p>
    )
  }

  return (
    <div style={{ marginTop: 4 }}>
      <p style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.55, marginBottom: 12 }}>
        루틴 진행 여부와 관계 없이 단어 세트별·Day별로 앱 학습 로그가 쌓이면 표시합니다. 소요 시간은 DB에 저장되지
        않을 수 있습니다(로그 건수로 활동량을 참고하세요).
      </p>

      {loading ? (
        <p style={{ color: COLORS.textSecondary, fontSize: 13 }}>불러오는 중...</p>
      ) : err ? (
        <p style={{ color: '#b91c1c', fontSize: 13 }}>{err}</p>
      ) : !payload?.setNames?.length ? (
        <p style={{ color: COLORS.textSecondary, fontSize: 13 }}>
          해당 선생 계정 세트 교재(words) 또는 학생 학습 로그가 없어요.
        </p>
      ) : (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary }}>세트 선택</span>
            <select
              value={selectedSet}
              onChange={(e) => {
                setSelectedSet(e.target.value)
                setOpenDays(new Set())
              }}
              style={{
                padding: '8px 10px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {payload.setNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          {dayNumbers.length === 0 ? (
            <p style={{ fontSize: 13, color: COLORS.textSecondary }}>표시할 Day가 없어요.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {dayNumbers.map((row) => {
                const open = openDays.has(row.day)
                const modes = Object.values(row.modes || {}).sort((a, b) => b.attempts - a.attempts)

                const toggle = () => {
                  const next = new Set(openDays)
                  if (open) next.delete(row.day)
                  else next.add(row.day)
                  setOpenDays(next)
                }

                const progTxt =
                  row.wordsInDay > 0
                    ? row.overallProgressPct == null
                      ? '—'
                      : `${row.overallProgressPct}%`
                    : '—'

                return (
                  <div
                    key={`${selectedSet}-${row.day}`}
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: RADIUS.md,
                      overflow: 'hidden',
                      background: COLORS.bg,
                    }}
                  >
                    <button
                      type="button"
                      onClick={toggle}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        border: 'none',
                        background: open ? COLORS.primarySoft : '#fff',
                        cursor: 'pointer',
                        fontSize: 14,
                      }}
                    >
                      <div style={{ fontWeight: 800, color: COLORS.accentText, marginBottom: 6 }}>
                        Day {row.day}
                        {(row.wordsInDay || 0) > 0 ? (
                          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                            {row.wordsInDay}단어
                          </span>
                        ) : null}
                      </div>
                      <MiniProgress pct={row.wordsInDay > 0 ? row.overallProgressPct : 0} />
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 8,
                          marginTop: 8,
                          fontSize: 11,
                          fontWeight: 600,
                          color: COLORS.textSecondary,
                          lineHeight: 1.4,
                        }}
                      >
                        <span>학습 진행(단어): {progTxt}</span>
                        <span>
                          테스트:{' '}
                          {row.vocabTests?.count ? `${row.vocabTests.avgPct ?? '—'}% · ${row.vocabTests.count}회` : '—'}
                        </span>
                        <span>
                          학습 로그: {row.wlEvents ?? 0}건
                          {row.overallCorrectRate != null ? ` · 정답률 ${row.overallCorrectRate}%` : ''}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          최근:{' '}
                          {row.lastStudiedAt ? new Date(row.lastStudiedAt).toLocaleString('ko-KR') : '—'}
                        </span>
                        <span>
                          매칭:{' '}
                          {row.matchingAttempts
                            ? `최고 ${row.matchingBest ?? '—'} · ${row.matchingAttempts}회`
                            : '—'}
                        </span>
                        <span>
                          오답/졸업: {row.wrongInDayCount ?? 0}/{row.graduatedFromDayCount ?? 0}
                        </span>
                      </div>
                      <span style={{ display: 'block', marginTop: 6, fontSize: 10, fontWeight: 700, color: COLORS.primary }}>
                        {open ? '▴ 모드 상세 접기' : '▾ 모드 상세 펼치기'}
                      </span>
                    </button>

                    {open ? (
                      <div style={{ padding: '12px 12px 14px', borderTop: `1px solid ${COLORS.border}`, background: '#fff' }}>
                        {row.vocabTests?.count > 0 ? (
                          <div style={{ marginBottom: 12, fontSize: 12 }}>
                            <strong style={{ color: COLORS.accentText }}>객관식 테스트 기록:</strong>{' '}
                            {row.vocabTests.count}회 시도 · 평균 {row.vocabTests.avgPct ?? '—'}% · 물림 정답률 평균{' '}
                            {row.vocabTests.avgCorrectRatio != null ? `${row.vocabTests.avgCorrectRatio}%` : '—'}
                          </div>
                        ) : null}
                        {(row.matchingAttempts > 0 || row.scrambleAttempts > 0) && (
                          <div style={{ marginBottom: 12, fontSize: 12, color: '#374151' }}>
                            매칭: 최고 점수 {row.matchingBest ?? '—'}점 · 스크램블 최고 {row.scrambleBest ?? '—'}점
                          </div>
                        )}
                        {modes.length === 0 ? (
                          <p style={{ fontSize: 12, color: COLORS.textSecondary }}>word_learning_history 모드별 로그 없음.</p>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: COLORS.accentText, lineHeight: 1.65 }}>
                            {modes.map((m) => {
                              const rate = m.attempts ? Math.round((m.correct / m.attempts) * 1000) / 10 : 0
                              return (
                                <li key={`${row.day}-${m.learning_mode}`}>
                                  <strong>{modeLabelFn(m.learning_mode)}</strong> — {m.attempts}건 · 정답률{' '}
                                  {rate}% · 학습 노출 단어≈{m.distinctWords}개
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
          <button
            type="button"
            style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.primarySoft,
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
            }}
            onClick={() => void load()}
          >
            새로고침
          </button>
        </>
      )}
    </div>
  )
}
