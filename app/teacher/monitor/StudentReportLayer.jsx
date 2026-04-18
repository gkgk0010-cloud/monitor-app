'use client';

import { useEffect } from 'react';

const Z_LAYER = 10050;

const MODE_LABEL = {
  flashcard: '플래시카드',
  recall: '리콜',
  matching: '매칭',
  test: '테스트',
  dictation: '딕테이션',
  scramble: '스크램블',
  writing: '라이팅',
  listening: '리스닝',
  read_aloud: '낭독',
  shadowing: '쉐도잉',
  image: '이미지',
  speaking_translation: '입영작',
  composition: '입영작',
  reading: '직독직해',
  vocabtest: '단어시험',
  unknown: '분류 없음',
};

function modeLabel(key) {
  return MODE_LABEL[key] || key;
}

function statusEmoji(status) {
  if (status === 'complete') return '✅';
  if (status === 'partial') return '△';
  return '❌';
}

/** ISO → KST yyyy-MM-dd */
function formatStartedAtKst(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  } catch {
    return '—';
  }
}

function formatModeNote(mode, m) {
  if (mode === 'unknown') {
    return '구버전 기록';
  }
  if (mode === 'matching') {
    const mx = m.maxScore != null ? m.maxScore : '—';
    const av = m.avgScore != null ? m.avgScore : '—';
    return `최고 ${mx} / 평균 ${av} (누적점수)`;
  }
  if (mode === 'vocabtest' || mode === 'test') {
    const mx = m.maxScore != null ? m.maxScore : '—';
    const av = m.avgScore != null ? m.avgScore : '—';
    return `최고 ${mx}% / 평균 ${av}%`;
  }
  return '';
}

/** 루틴 보유 학생: DAY 평균 점수 기준 (기존과 동일) */
function getEncouragementMessageFromRoutine(avgDayScore) {
  if (avgDayScore >= 90) return '훌륭합니다! 꾸준히 잘 해내고 있어요.';
  if (avgDayScore >= 70) return '성실히 진행 중입니다. 계속 응원합니다.';
  if (avgDayScore >= 50) return '꾸준한 참여가 중요합니다. 함께 노력해봐요.';
  return '학습 관심이 필요해 보입니다. 교사와 상담 권장.';
}

/**
 * 최근 30일 족보 일자별 통계로부터 가중 평균 정답률(%).
 * (일자별 correctRate·attempts로부터 sum(시도×정답률)/sum(시도) 와 동치)
 */
function computeAvgJokboRatePercent(recentJokboStats) {
  if (!recentJokboStats?.length) return null;
  let sumAttempts = 0;
  let sumCorrectWeighted = 0;
  for (const row of recentJokboStats) {
    const a = Number(row.attempts) || 0;
    if (a <= 0) continue;
    sumAttempts += a;
    sumCorrectWeighted += (a * (Number(row.correctRate) || 0)) / 100;
  }
  if (sumAttempts <= 0) return null;
  return (sumCorrectWeighted / sumAttempts) * 100;
}

/** 루틴 없음 + 족보 30일 데이터가 있을 때 */
function getEncouragementMessageNoRoutineFromJokbo(avgJokboRate) {
  if (avgJokboRate >= 70) return '꾸준히 학습하고 있습니다.';
  if (avgJokboRate >= 50) return '꾸준히 학습 중이며, 정답률 향상이 과제입니다.';
  return '꾸준히 학습 중이나 기본기 보강이 필요합니다.';
}

function hasAnswerLogsOrModeActivity(todayAttempts, modeStats, todayJokboTagBreakdown) {
  if (todayAttempts > 0) return true;
  const jokboToday = (todayJokboTagBreakdown || []).reduce((a, x) => a + (x.attempts || 0), 0);
  if (jokboToday > 0) return true;
  return Object.values(modeStats || {}).some((v) => v && v.totalAttempts > 0);
}

/**
 * 학부모 요약 격려 문구
 * @param {object} p
 * @param {boolean} p.hasActiveRoutine — todayRoutine.hasActiveRoutine
 * @param {number} p.avgDayScore — DAY 평균 점수 (%)
 * @param {Array<{ date: string, attempts: number, correctRate: number }>|null|undefined} p.recentJokboStats
 * @param {number} p.todayAttempts — 오늘 answer_logs 시도 수 (오늘의연구: output·grammar)
 * @param {Record<string, { totalAttempts?: number }>|undefined} p.modeStats
 * @param {Array<{ attempts?: number }>|undefined} p.todayJokboTagBreakdown — 오늘 족보(input)
 */
function getParentEncouragementMessage({
  hasActiveRoutine,
  avgDayScore,
  recentJokboStats,
  todayAttempts,
  modeStats,
  todayJokboTagBreakdown,
}) {
  if (hasActiveRoutine) {
    return getEncouragementMessageFromRoutine(avgDayScore);
  }
  const avgJokbo = computeAvgJokboRatePercent(recentJokboStats);
  if (avgJokbo != null) {
    return getEncouragementMessageNoRoutineFromJokbo(avgJokbo);
  }
  if (!hasAnswerLogsOrModeActivity(todayAttempts, modeStats, todayJokboTagBreakdown)) {
    return '학습 관심이 필요해 보입니다. 교사와 상담 권장.';
  }
  return '학습 활동이 기록되고 있습니다. 계속 응원합니다.';
}

/** matching / vocabtest / test 는 is_correct 기반이 아니어서 정답률 % 대신 대시 */
function formatModeCorrectRateDisplay(mode, correctRate) {
  if (mode === 'matching' || mode === 'vocabtest' || mode === 'test') {
    return '—';
  }
  return `${correctRate}%`;
}

export default function StudentReportLayer({
  studentDisplayName,
  onClose,
  loading,
  error,
  data,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name = (studentDisplayName || '').trim() || '—';

  let body = null;
  if (loading) {
    body = <p style={s.muted}>리포트 로딩 중…</p>;
  } else if (error) {
    body = <p style={s.errorText}>{error}</p>;
  } else if (!data) {
    body = <p style={s.muted}>데이터 없음</p>;
  } else {
    const tr = data.todayRoutine;
    const ov = data.overallReport;
    const ds = ov.dailyScores || [];
    const totalDays = tr.totalDays;
    const hasRoutine = tr.hasActiveRoutine && totalDays != null && totalDays > 0;
    const curDay = ov.currentDay || 0;
    const progressPct =
      hasRoutine && totalDays ? Math.min(100, Math.round((curDay / totalDays) * 1000) / 10) : null;

    const avgDayScore = ds.length
      ? Math.round((ds.reduce((a, row) => a + row.score, 0) / ds.length) * 10) / 10
      : 0;

    let nComplete = 0;
    let nPartial = 0;
    let nMissed = 0;
    ds.forEach((row) => {
      if (row.status === 'complete') nComplete += 1;
      else if (row.status === 'partial') nPartial += 1;
      else nMissed += 1;
    });

    const modeEntries = Object.entries(ov.modeStats || {}).filter(
      ([, v]) => v && v.totalAttempts > 0,
    );

    const jokboRows = data.toeicDetail?.recentJokboStats
      ? [...data.toeicDetail.recentJokboStats].sort((a, b) => b.date.localeCompare(a.date))
      : [];

    const tagWeak = data.toeicDetail?.tagStats
      ? [...data.toeicDetail.tagStats].sort((a, b) => a.correctRate - b.correctRate).slice(0, 5)
      : [];

    const researchRows = data.toeicDetail?.recentResearchStats
      ? [...data.toeicDetail.recentResearchStats].sort((a, b) => b.date.localeCompare(a.date))
      : [];

    const researchTagWeak = data.toeicDetail?.researchTagStats
      ? [...data.toeicDetail.researchTagStats].sort((a, b) => a.correctRate - b.correctRate).slice(0, 5)
      : [];

    const summaryLine = hasRoutine && totalDays
      ? `현재 루틴 ${curDay}/${totalDays} DAY 진행 중, 평균 성취도 ${avgDayScore}%`
      : `배정된 활성 루틴이 없습니다. 기록된 평균 DAY 점수는 ${avgDayScore}%입니다.`;

    body = (
      <>
        <section style={s.parentSummary} className="sr-parent-summary">
          <h3 style={s.parentSummaryTitle}>학부모 요약</h3>
          <p style={s.parentSummaryLine}>
            <strong>{data.student.name}</strong>
            {' / '}
            반
            {' '}
            {data.student.className || '—'}
            {' / '}
            시작일
            {' '}
            {formatStartedAtKst(ov.startedAt)}
            {' / '}
            현재 DAY
            {' '}
            {hasRoutine && tr.currentDay != null ? tr.currentDay : '—'}
          </p>
          <p style={s.parentSummaryHighlight}>{summaryLine}</p>
          <p style={s.parentSummaryEncourage}>
            {getParentEncouragementMessage({
              hasActiveRoutine: tr.hasActiveRoutine,
              avgDayScore,
              recentJokboStats: data.toeicDetail?.recentJokboStats,
              todayAttempts: data.todayScore.todayAttempts,
              modeStats: ov.modeStats,
              todayJokboTagBreakdown: data.todayScore.todayJokboTagBreakdown,
            })}
          </p>
        </section>

        <div style={s.metaBar} className="sr-meta-bar">
          이름: <strong>{data.student.name}</strong>
          {' '}
          | 반:
          {' '}
          {data.student.className || '—'}
          {' '}
          | 누적 Score:
          {' '}
          <strong>{data.todayScore.cumulativeScore}</strong>
          <br />
          루틴:
          {' '}
          {hasRoutine ? (
            <>
              {tr.routineTitle || '—'}
              {' '}
              | DAY
              {' '}
              {tr.currentDay}
              {' '}
              /
              {' '}
              {totalDays}
            </>
          ) : (
            '배정된 루틴 없음'
          )}
          <br />
          시작일:
          {' '}
          {formatStartedAtKst(ov.startedAt)}
          {' '}
          (
          {ov.totalDaysElapsed}
          일차)
        </div>

        <section style={s.section} className="sr-section-summary">
          <h3 style={s.h3}>🎯 종합 지표</h3>
          <p style={s.p}>
            진행률:
            {' '}
            {hasRoutine && progressPct != null ? (
              <>
                {curDay}
                {' '}
                /
                {' '}
                {totalDays}
                {' '}
                DAY (
                {progressPct}
                %)
              </>
            ) : (
              '— (루틴 없음)'
            )}
          </p>
          <p style={s.p}>
            평균 DAY 점수:
            {' '}
            <strong>{avgDayScore}%</strong>
          </p>
          <p style={s.p}>
            완료 현황:
            {' '}
            <span>✅ {nComplete}개</span>
            {'  '}
            <span>△ {nPartial}개</span>
            {'  '}
            <span>❌ {nMissed}개</span>
          </p>
        </section>

        <section style={s.section} className="sr-section-day">
          <h3 style={s.h3}>📆 DAY별 현황</h3>
          <div style={s.tableWrap} className="sr-table-wrap-print">
            <table style={s.table} className="sr-table-day">
              <thead>
                <tr>
                  <th style={s.th}>DAY</th>
                  <th style={s.th}>점수</th>
                  <th style={s.th}>상태</th>
                  <th style={s.th}>완료/전체</th>
                </tr>
              </thead>
              <tbody>
                {ds.map((row) => (
                  <tr key={row.day}>
                    <td style={s.td}>{row.day}</td>
                    <td style={s.td}>{row.score}%</td>
                    <td style={s.td}>{statusEmoji(row.status)}</td>
                    <td style={s.td}>
                      {row.tasksCompleted}
                      /
                      {row.tasksTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={s.section} className="sr-section-mode">
          <h3 style={s.h3}>📚 모드별 통계</h3>
          {modeEntries.length === 0 ? (
            <p style={s.muted}>표시할 모드가 없습니다.</p>
          ) : (
            <div style={s.tableWrap} className="sr-table-wrap-print">
              <table style={s.table} className="sr-table-mode">
                <thead>
                  <tr>
                    <th style={s.th}>모드</th>
                    <th style={s.th}>시도</th>
                    <th style={s.th}>정답률</th>
                    <th style={s.th}>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {modeEntries.map(([mode, m]) => (
                    <tr key={mode}>
                      <td style={s.td}>{modeLabel(mode)}</td>
                      <td style={s.td}>{m.totalAttempts}</td>
                      <td style={s.td}>{formatModeCorrectRateDisplay(mode, m.correctRate)}</td>
                      <td style={{ ...s.td, fontSize: 12, color: '#6b7280' }}>{formatModeNote(mode, m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {data.isToeic && data.toeicDetail && (
          <section style={s.section} className="sr-section-toeic">
            <h3 style={s.h3}>📘 토익 상세</h3>

            <h4 style={s.toeicBlockTitle}>━━━ 족보 ━━━</h4>
            <h5 style={s.h5}>최근 30일 족보</h5>
            {jokboRows.length === 0 ? (
              <p style={s.muted}>기록이 없습니다.</p>
            ) : (
              <div style={s.tableWrap} className="sr-table-wrap-print">
                <table style={s.table} className="sr-table-toeic">
                  <thead>
                    <tr>
                      <th style={s.th}>날짜</th>
                      <th style={s.th}>시도</th>
                      <th style={s.th}>정답률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jokboRows.map((row) => (
                      <tr key={row.date}>
                        <td style={s.td}>{row.date}</td>
                        <td style={s.td}>{row.attempts}</td>
                        <td style={s.td}>{row.correctRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h5 style={s.h5}>태그별 누적 (약점 TOP 5)</h5>
            {tagWeak.length === 0 ? (
              <p style={s.muted}>기록이 없습니다.</p>
            ) : (
              <div style={s.tableWrap} className="sr-table-wrap-print">
                <table style={s.table} className="sr-table-toeic">
                  <thead>
                    <tr>
                      <th style={s.th}>태그</th>
                      <th style={s.th}>시도</th>
                      <th style={s.th}>정답률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tagWeak.map((row) => (
                      <tr key={row.tag}>
                        <td style={s.td}>{row.tag}</td>
                        <td style={s.td}>{row.totalCount}</td>
                        <td style={s.td}>{row.correctRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h4 style={s.toeicBlockTitle}>━━━ 오늘의연구 ━━━</h4>
            <h5 style={s.h5}>최근 30일 오늘의연구</h5>
            {researchRows.length === 0 ? (
              <p style={s.muted}>기록이 없습니다.</p>
            ) : (
              <div style={s.tableWrap} className="sr-table-wrap-print">
                <table style={s.table} className="sr-table-toeic">
                  <thead>
                    <tr>
                      <th style={s.th}>날짜</th>
                      <th style={s.th}>시도</th>
                      <th style={s.th}>정답률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {researchRows.map((row) => (
                      <tr key={row.date}>
                        <td style={s.td}>{row.date}</td>
                        <td style={s.td}>{row.attempts}</td>
                        <td style={s.td}>{row.correctRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h5 style={s.h5}>태그별 누적 (약점 TOP 5)</h5>
            {researchTagWeak.length === 0 ? (
              <p style={s.muted}>기록이 없습니다.</p>
            ) : (
              <div style={s.tableWrap} className="sr-table-wrap-print">
                <table style={s.table} className="sr-table-toeic">
                  <thead>
                    <tr>
                      <th style={s.th}>태그</th>
                      <th style={s.th}>시도</th>
                      <th style={s.th}>정답률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {researchTagWeak.map((row) => (
                      <tr key={row.tag}>
                        <td style={s.td}>{row.tag}</td>
                        <td style={s.td}>{row.totalCount}</td>
                        <td style={s.td}>{row.correctRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </>
    );
  }

  return (
    <div
      className="sr-root"
      style={s.root}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sr-title"
    >
      <style>
        {`
          @page {
            size: A4 portrait;
            margin: 15mm;
            @bottom-right {
              content: counter(page) " / " counter(pages);
            }
          }

          .sr-print-only {
            display: none !important;
          }

          @media print {
            .sr-root {
              position: static !important;
              inset: auto !important;
              z-index: auto !important;
              min-height: 0 !important;
              height: auto !important;
              overflow: visible !important;
              background: #fff !important;
              color: #000 !important;
              font-size: 11pt !important;
              line-height: 1.45 !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              color-adjust: exact;
            }
            .sr-scroll {
              max-width: none !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
              overflow: visible !important;
            }
            .sr-sticky-header {
              position: static !important;
              box-shadow: none !important;
              border-bottom: 1px solid #000 !important;
              padding: 0 0 8pt 0 !important;
              margin-bottom: 8pt !important;
              background: #fff !important;
            }
            .sr-no-print {
              display: none !important;
            }
            .sr-print-only {
              display: block !important;
              margin: 6pt 0 0 0 !important;
              font-size: 9pt !important;
              font-weight: 500 !important;
              color: #000 !important;
            }
            .sr-parent-summary {
              page-break-after: always !important;
              break-after: page !important;
              border: 1px solid #374151 !important;
              background: #fff !important;
              padding: 10pt !important;
              margin-bottom: 0 !important;
            }
            .sr-meta-bar {
              page-break-after: avoid !important;
              break-after: avoid !important;
            }
            .sr-section-summary {
              page-break-inside: avoid !important;
            }
            .sr-section-day .sr-table-day thead,
            .sr-section-mode .sr-table-mode thead,
            .sr-section-toeic .sr-table-toeic thead {
              display: table-header-group !important;
            }
            .sr-section-day .sr-table-day tr,
            .sr-section-mode .sr-table-mode tr,
            .sr-section-toeic .sr-table-toeic tr {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .sr-section-toeic {
              page-break-before: auto !important;
            }
            .sr-table-day,
            .sr-table-mode,
            .sr-table-toeic {
              font-size: 10pt !important;
            }
            .sr-table-wrap-print {
              background: #fff !important;
              border: 1px solid #9ca3af !important;
            }
          }
        `}
      </style>

      <header className="sr-sticky-header" style={s.header}>
        <div style={s.headerLeft}>
          <h2 id="sr-title" style={s.title}>
            📊
            {' '}
            {name}
            {' '}
            리포트
          </h2>
          <p className="sr-print-only" style={s.printHeaderSub}>
            똑패스 개인 리포트 | 인쇄일:
            {' '}
            {new Date().toLocaleDateString('ko-KR')}
          </p>
        </div>
        <div style={s.headerBtns}>
          <button
            type="button"
            className="sr-no-print"
            style={s.btn}
            onClick={() => window.print()}
          >
            📄 PDF 출력
          </button>
          <button type="button" className="sr-no-print" style={s.btnClose} onClick={onClose}>
            ✕ 닫기
          </button>
        </div>
      </header>

      <div className="sr-scroll" style={s.scroll}>{body}</div>
    </div>
  );
}

const s = {
  root: {
    position: 'fixed',
    inset: 0,
    zIndex: Z_LAYER,
    background: '#f9fafb',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    overflow: 'hidden',
  },
  header: {
    flexShrink: 0,
    position: 'sticky',
    top: 0,
    zIndex: 2,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    padding: '16px 20px',
    background: '#fff',
    borderBottom: '1px solid #e5e7eb',
    boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
  },
  headerLeft: { flex: 1, minWidth: 0 },
  printHeaderSub: {
    margin: '8px 0 0',
    fontSize: 12,
    color: '#6b7280',
    fontWeight: 500,
  },
  title: {
    margin: 0,
    fontSize: '1.15rem',
    fontWeight: 700,
    color: '#374151',
  },
  parentSummary: {
    marginBottom: 24,
    padding: '16px 18px',
    background: 'linear-gradient(180deg, #faf5ff 0%, #fff 100%)',
    borderRadius: 16,
    border: '1px solid #e9d5ff',
  },
  parentSummaryTitle: {
    margin: '0 0 12px',
    fontSize: '1rem',
    fontWeight: 700,
    color: '#5b21b6',
  },
  parentSummaryLine: {
    margin: '0 0 10px',
    fontSize: 14,
    color: '#374151',
    lineHeight: 1.6,
  },
  parentSummaryHighlight: {
    margin: '0 0 10px',
    fontSize: 15,
    fontWeight: 600,
    color: '#1f2937',
    lineHeight: 1.55,
  },
  parentSummaryEncourage: {
    margin: 0,
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 1.55,
  },
  headerBtns: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  btn: {
    padding: '8px 14px',
    fontSize: 13,
    borderRadius: 10,
    border: '1px solid rgba(107,114,128,0.3)',
    background: 'rgba(255,255,255,0.95)',
    cursor: 'pointer',
    color: '#374151',
  },
  btnClose: {
    padding: '8px 14px',
    fontSize: 13,
    borderRadius: 10,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: '#6b7280',
    fontWeight: 600,
  },
  scroll: {
    flex: 1,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: '20px 20px 32px',
    maxWidth: 900,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  metaBar: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 1.75,
    marginBottom: 20,
    padding: '12px 14px',
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
  },
  section: { marginBottom: 28 },
  h3: {
    margin: '0 0 12px',
    fontSize: '0.98rem',
    fontWeight: 700,
    color: '#374151',
  },
  h4: {
    margin: '16px 0 10px',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#4b5563',
  },
  /** 토익 상세: 족보 / 오늘의연구 구분 */
  toeicBlockTitle: {
    margin: '18px 0 12px',
    padding: '10px 0 8px',
    borderTop: '1px solid #e5e7eb',
    borderBottom: '1px solid #e5e7eb',
    fontSize: '0.88rem',
    fontWeight: 700,
    color: '#1f2937',
    letterSpacing: '0.02em',
  },
  h5: {
    margin: '12px 0 8px',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#4b5563',
  },
  p: { margin: '0 0 8px', fontSize: 14, color: '#374151', lineHeight: 1.6 },
  muted: { margin: 0, fontSize: 14, color: '#6b7280' },
  errorText: { margin: 0, fontSize: 14, color: '#dc2626', lineHeight: 1.5 },
  tableWrap: { overflowX: 'auto', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: 8,
    borderBottom: '1px solid #e5e7eb',
    color: '#374151',
    fontWeight: 600,
    background: '#f9fafb',
  },
  td: {
    padding: 8,
    borderBottom: '1px solid #f3f4f6',
    color: '#374151',
  },
};
