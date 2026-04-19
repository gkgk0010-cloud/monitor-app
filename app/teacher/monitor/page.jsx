'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/utils/supabaseClient';
import { useTeacher } from '@/utils/useTeacher';
import {
  fetchStudentStatusForTeacher,
  fetchStudentIdsForTeacher,
  fetchStatusLogsForTeacher,
  fetchStudentStatusNamesForTeacher,
  fetchStudentRoutineSummariesForTeacher,
  routineLastStudyParts,
} from '@/utils/teacherQueries';
import { useStudentReport, normalizeReportStudentId } from '@/src/hooks/useStudentReport';
import StudentReportLayer from './StudentReportLayer';

const COLOR_ORDER = { gold: 0, red: 1, orange: 2, blue: 3, green: 4, purple: 5, white: 6 };
const MAIN_ZONE_MAX = 30;
const LOG_LIMIT = 20;
/** 집중관리존: 최근 N초 이내 정답/오답만 파란불/빨간불로 표시, 그 외는 대기 */
const ANSWER_LIGHT_SECONDS = 20;

const STATUS_STYLE = {
  gold: { border: '#d4af37', bg: 'linear-gradient(135deg, #fffef0 0%, #fff9e6 50%, #fff4d6 100%)', badge: '#d4af37', label: '🏆 MVP', defaultMent: '🏆 일일 할당량(50문제) 클리어!' },
  red: { border: '#ea4335', bg: 'linear-gradient(135deg, #fce8e6 0%, #f9d5d2 100%)', badge: '#ea4335', label: '위험', defaultMent: '🔴 3연속 오답' },
  orange: { border: '#ea580c', bg: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', badge: '#ea580c', label: '경고', defaultMent: '경고 상태' },
  blue: { border: '#2575fc', bg: 'linear-gradient(135deg, #e6f4ea 0%, #c8e6d3 100%)', badge: '#34a853', label: '우수', defaultMent: '🔥 열공 모드 (20문제+)' },
  green: { border: '#22c55e', bg: 'linear-gradient(135deg, #e6f4ea 0%, #c8e6d3 100%)', badge: '#22c55e', label: '복습완료', defaultMent: '✅ 복습 완료' },
  purple: { border: '#8b5cf6', bg: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)', badge: '#8b5cf6', label: '새벽반', defaultMent: '🟣 새벽반' },
  white: { border: 'rgba(255,255,255,0.6)', bg: 'rgba(255, 255, 255, 0.92)', badge: '#64748b', label: '정상', defaultMent: '접속 중' },
};

function getDisplayMent(row, style) {
  const raw = (row.info_text || '').trim();
  const isPlaceholder = /상태\s*설명|예:\s*["']/.test(raw) || raw === '';
  if (isPlaceholder) return (style && style.defaultMent) || '접속 중';
  return raw;
}

function sortStudents(rows) {
  return [...(rows || [])].sort((a, b) => (COLOR_ORDER[a.student_color] ?? 99) - (COLOR_ORDER[b.student_color] ?? 99));
}

/** 최근 활동 시각 (문제 풀면 갱신됨). last_answer_at 우선, 없으면 last_active. 없으면 0 */
function getLatestActiveTs(row) {
  const at = row?.last_answer_at || row?.last_active;
  if (!at) return 0;
  try {
    const d = toUTCThenKorea(at);
    return d && !isNaN(d.getTime()) ? d.getTime() : 0;
  } catch {
    return 0;
  }
}

/** 최근 활동 순 정렬 (방금 푼 사람이 맨 위 → 문제 풀면 위로 올라오고, 31번째는 안전으로 내려감) */
function sortByRecentFirst(rows) {
  return [...(rows || [])].sort((a, b) => getLatestActiveTs(b) - getLatestActiveTs(a));
}

/** 출석/미접속 복사 시 한 번에 붙여넣기 편한 인원 수 (이 이상이면 N차 복사) */
const COPY_CHUNK_SIZE = 40;

/** 출석 복사 시 한 줄에 넣을 이름 수 (이만큼씩 묶어서 줄 수 줄임) */
const NAMES_PER_LINE = 6;

function formatNamesInLines(names, prefix = '· ') {
  const lines = [];
  for (let i = 0; i < names.length; i += NAMES_PER_LINE) {
    const chunk = names.slice(i, i + NAMES_PER_LINE);
    lines.push(chunk.map((name) => prefix + name).join(' '));
  }
  return lines;
}

/** 한국시간 기준 오늘 날짜 YYYY-MM-DD (족보 일별 통계 키와 맞춤) */
function kstYmdToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

/** 루틴 진행률 바 색: 0% 회색, 1~49% 빨강, 50~99% 주황, 100% 초록 */
function routineProgressFillColor(progress) {
  const p = Math.min(100, Math.max(0, Number(progress) || 0));
  if (p <= 0) return '#9ca3af';
  if (p < 50) return '#ef4444';
  if (p < 100) return '#ea580c';
  return '#22c55e';
}

/** 집중관리 30인 = 최근 활동 순 상위 30명 (문제 풀면 위로 올라옴, 새로 올라오면 순차적으로 내려감). 안전 = 그 외 전원 */
function splitZones(rows) {
  const sorted = sortByRecentFirst(rows || []);
  const main = sorted.slice(0, MAIN_ZONE_MAX);
  const safe = sorted.slice(MAIN_ZONE_MAX);
  return { main, safe };
}

/** 타임존 없는 문자열(YYYY-MM-DD HH:mm:ss)은 이미 한국시간으로 간주. Z 붙이면 UTC로 잘못 해석되어 9시간 어긋남 → +09:00 사용 */
function toUTCThenKorea(ts) {
  if (ts == null) return null;
  let s = typeof ts === 'string' ? ts.trim() : String(ts);
  if (!s) return null;
  if (s.endsWith('Z') || s.includes('+') || /-\d{2}:\d{2}$/.test(s)) return new Date(s);
  s = s.replace(/\s+/, 'T');
  if (!s.includes('T')) s += 'T00:00:00';
  return new Date(s + '+09:00');
}

function formatActive(ts) {
  if (!ts) return '';
  try {
    const d = toUTCThenKorea(ts);
    if (!d || isNaN(d.getTime())) return String(ts);
    return d.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

function formatLogTime(ts) {
  if (!ts) return '--:--';
  try {
    const d = toUTCThenKorea(ts);
    if (!d || isNaN(d.getTime())) return String(ts);
    return d.toLocaleTimeString('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return String(ts);
  }
}

/** 로그용 날짜+시간 (어제/오늘 구분용) */
function formatLogDateAndTime(ts) {
  if (!ts) return '--';
  try {
    const d = toUTCThenKorea(ts);
    if (!d || isNaN(d.getTime())) return String(ts);
    const opt = { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    return d.toLocaleString('ko-KR', opt);
  } catch {
    return String(ts);
  }
}

function isTodayKorea(ts) {
  if (!ts) return false;
  try {
    const d = toUTCThenKorea(ts);
    if (!d || isNaN(d.getTime())) return false;
    const opt = { timeZone: 'Asia/Seoul' };
    const dStr = d.toLocaleDateString('ko-KR', opt);
    const nowStr = new Date().toLocaleDateString('ko-KR', opt);
    return dStr === nowStr;
  } catch {
    return false;
  }
}

/** answer_logs: 날짜/오늘 판단은 created_at_kst(텍스트 KST)만 사용. created_at(timestamptz)는 사용하지 않고, fallback 시에만 UTC→KST 변환해 비교 */
function getKstDateString(ts) {
  if (!ts) return '';
  try {
    const d = typeof ts === 'string' && /Z|[+-]\d{2}:?\d{2}$/.test(ts) ? new Date(ts) : toUTCThenKorea(ts);
    if (!d || isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  } catch {
    return '';
  }
}

function isTodayByKstOrUtc(createdAtKst, createdAt) {
  const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const kst = typeof createdAtKst === 'string' ? createdAtKst.trim() : '';
  if (kst && /^\d{4}-\d{2}-\d{2}/.test(kst)) {
    return kst.slice(0, 10) === todayKst;
  }
  return getKstDateString(createdAt) === todayKst;
}

function isAbsent2Days(ts) {
  if (!ts) return true;
  try {
    const d = toUTCThenKorea(ts);
    if (!d || isNaN(d.getTime())) return true;
    const opt = { timeZone: 'Asia/Seoul' };
    const lastStr = d.toLocaleDateString('en-CA', opt);
    const todayStr = new Date().toLocaleDateString('en-CA', opt);
    const [y, m, day] = todayStr.split('-').map(Number);
    const cutoffDate = new Date(Date.UTC(y, m - 1, day - 2));
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);
    return lastStr <= cutoffStr;
  } catch {
    return false;
  }
}

/** 집중관리존 CCTV: 최근 N초 이내 답안 제출이 있으면 파란불/빨간불 표시 */
function isRecentAnswer(row) {
  const at = row?.last_answer_at;
  if (!at) return false;
  try {
    const d = toUTCThenKorea(at);
    if (!d || isNaN(d.getTime())) return false;
    return (Date.now() - d.getTime()) <= ANSWER_LIGHT_SECONDS * 1000;
  } catch {
    return false;
  }
}

/** 집중관리존 카드용: 정답=파란불, 오답=빨간불, 그 외=대기(회색) */
function getAnswerLightStyle(row) {
  const recent = isRecentAnswer(row);
  const result = (row?.last_answer_result || '').toLowerCase();
  if (recent && result === 'correct') {
    return { border: '#2563eb', bg: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', label: '정답', badge: '#2563eb' };
  }
  if (recent && result === 'incorrect') {
    return { border: '#dc2626', bg: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', label: '오답', badge: '#dc2626' };
  }
  return { border: '#94a3b8', bg: 'rgba(248, 250, 252, 0.98)', label: '대기', badge: '#94a3b8' };
}

/** 최근 N분 이내 활동(한국시간 기준) → "지금 접속 중"으로 셈 */
function isActiveWithinMinutes(ts, minutes) {
  if (!ts) return false;
  try {
    const d = toUTCThenKorea(ts);
    if (!d || isNaN(d.getTime())) return false;
    return (Date.now() - d.getTime()) <= minutes * 60 * 1000;
  } catch {
    return false;
  }
}

function getKakaoMent(row, style) {
  const name = (row.student_name || '').trim() || '이름없음';
  const color = row.student_color || 'white';
  const info = (row.info_text || '').trim();
  const isShotgun = /샷건|직후\s*5초|강제\s*종료/.test(info);
  const displayName = name + '님';
  switch (color) {
    case 'gold':
      return `${displayName}! 오늘 50문제 클리어 축하해용! 진짜 고생했어 :D 👍`;
    case 'blue':
      return `${displayName}!, 20문제 연속으로 달리는 거 봤어요. 오늘 기세 미쳤는데??? 🔥`;
    case 'red':
      return `${displayName}!, 방금 푼 문제들 좀 어려웠죠ㅠㅠ? 복습할 때 오답 체크 꼭 하고 넘어갑시당! 💪`;
    case 'purple': {
      let hourStr = '';
      try {
        if (row.last_active) {
          const d = toUTCThenKorea(row.last_active);
          if (d && !isNaN(d.getTime())) {
            const hourKorea = parseInt(d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false }), 10);
            if (hourKorea >= 1 && hourKorea < 5) hourStr = String(hourKorea);
          }
        }
      } catch (_) {}
      return hourStr
        ? `${displayName}... 지금 새벽 ${hourStr}시에 도 공부하넹!! 진짜 대단하구.. 응원해요 무리는 하지말기! 🌙`
        : `${displayName}... 새벽에 공부하넹!! 진짜 대단하구.. 응원해요 무리는 하지말기! 🌙`;
    }
    case 'green':
      return `${displayName}, 복습까지 깔끔하게 끝냈네요?? 완벽하다! :D 💯`;
    case 'white':
      return isShotgun
        ? `${displayName},, 오답 보고 바로 껐던데 혹시 열받은거 아니죠? ㅠㅠㅠ 조금만 더해보자~ 으쌰으쌰 💪`
        : `${displayName}, 오늘도 응원해!!`;
    case 'orange':
      return `${displayName}, 오늘도 응원해!!`;
    default:
      return `${displayName}, 오늘도 응원해!!`;
  }
}

/** 실시간 사건 기록 한 행 → 그 로그에 맞는 카톡 개별멘트 (학생명 자동 반영) */
/** student_id → 루틴 요약 (카드용) */
function MonitorRoutineLines({ studentId, map, compact }) {
  const s = map[String(studentId)] ?? { line1: null, lastParts: routineLastStudyParts(null) };
  const { line1, lastParts } = s;
  const color = lastParts.muted ? '#94a3b8' : lastParts.urgent ? '#dc2626' : '#6b7280';
  return (
    <div style={{ marginTop: compact ? 4 : 6, marginBottom: compact ? 2 : 4 }}>
      {line1 ? (
        <div style={{ fontSize: compact ? 10 : 11, color: '#4b5563', fontWeight: 600, lineHeight: 1.35 }}>{line1}</div>
      ) : null}
      <div style={{ fontSize: compact ? 10 : 11, color, marginTop: line1 ? 3 : 0, fontWeight: 500 }}>
        마지막 학습(루틴): {lastParts.text}
      </div>
    </div>
  );
}

function getKakaoMentForLog(logRow) {
  if (!logRow) return '';
  const name = (logRow.student_name || '').trim() || '이름없음';
  const eventType = (logRow.event_type || '').toUpperCase();
  const style = STATUS_STYLE;
  const colorMap = { GOLD: 'gold', BLUE: 'blue', GREEN: 'green', RED: 'red', PURPLE: 'purple', SHOTGUN: 'white' };
  const color = colorMap[eventType] || 'white';
  const row = {
    student_name: name,
    student_color: color,
    info_text: logRow.message || logRow.event_type || '',
    last_active: logRow.created_at,
  };
  return getKakaoMent(row, style[color] || style.white);
}

export default function TeacherMonitorPage() {
  const [students, setStudents] = useState([]);
  const studentsRef = useRef([]);
  const [statusLogs, setStatusLogs] = useState([]);
  const [statusLogsError, setStatusLogsError] = useState(null);
  const [safeOpen, setSafeOpen] = useState(false);
  const [absent2Open, setAbsent2Open] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [copyToast, setCopyToast] = useState(null);
  const [detailStudent, setDetailStudent] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  /** 집중관리존: 10초 후 정답/오답 → 대기 전환을 위해 1초마다 리렌더 */
  const [tick, setTick] = useState(0);
  /** 폰에서 수동 갱신용 (빨간불/파란불 Realtime 끊김 시) */
  const refetchStudentsRef = useRef(null);
  /** 실시간 사건 기록 수동 갱신용 (Realtime 끊김 시 3연속 오답·복습 완료 등 최신 반영) */
  const refetchLogsRef = useRef(null);
  /** students 에서 가져온 이름 집합 — student_status.student_name 과 동일해야 함 */
  const allowedStudentNamesRef = useRef(new Set());
  /** student_routines.student_id 집합 — 루틴 Realtime 필터용 */
  const allowedStudentIdsRef = useRef(new Set());
  /** 출석/미접속 N차 복사용 캐시 (인원 많을 때 나눠 붙여넣기) */
  const attendanceCopyRef = useRef({ names: null, chunk: 0 });
  const absentCopyRef = useRef({ initials: null, chunk: 0 });

  /** student_id → { line1, lastParts } */
  const [routineSummaries, setRoutineSummaries] = useState({});

  const { teacher, loading: teacherLoading } = useTeacher();

  const { loading: reportLoading, error: reportError, data: reportData } = useStudentReport(
    detailStudent?.student_id != null ? normalizeReportStudentId(detailStudent.student_id) : null,
  );

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!detailStudent) setReportOpen(false);
  }, [detailStudent]);

  const copyToClipboard = async (text) => {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyToast('복사됨');
      setTimeout(() => setCopyToast(null), 2000);
    } catch {
      setCopyToast('복사 실패');
      setTimeout(() => setCopyToast(null), 2000);
    }
  };

  /** 상세 모달 전체 내용을 카톡 등으로 보낼 수 있는 텍스트로 만듦 */
  const getDetailModalCopyText = () => {
    if (!detailStudent) return '';
    const name = (detailStudent.student_name ?? '-').trim() || '-';
    const lines = [`🕵️ ${name} 상세`, ''];

    if (reportLoading) {
      lines.push('(리포트 불러오는 중...)');
      lines.push('');
    } else if (reportError) {
      lines.push(`리포트 로드 실패: ${reportError}`);
      lines.push('');
    } else if (!reportData) {
      lines.push('데이터 없음');
      lines.push('');
    } else {
      const d = reportData;
      lines.push('📘 오늘의 스코어');
      if (!d.isToeic) {
        lines.push('해당 없음');
      } else {
        lines.push(`누적 Score: ${d.todayScore.cumulativeScore}`);
        const att = d.todayScore.todayAttempts;
        const rate = d.todayScore.todayCorrectRate;
        if (att === 0) {
          lines.push('오늘 0문제 풀었고, 정답률은 0%입니다.');
        } else if (rate == null) {
          lines.push('오늘 푼 문제 없음');
        } else {
          const correct = Math.round((rate / 100) * att);
          const wrong = att - correct;
          lines.push(`오늘 정답률: ${rate}% (${correct}정답 / ${wrong}오답)`);
        }
      }
      lines.push('');

      lines.push('📊 극복 과제들');
      if (!d.isToeic) {
        lines.push('해당 없음');
      } else if (d.todayScore.topWrongTags.length > 0) {
        d.todayScore.topWrongTags.forEach((t) => {
          lines.push(`${t.tag} — ${t.wrongCount}/${t.totalCount} 오답 (${t.wrongRate}%)`);
        });
      } else {
        lines.push('오늘 오답이 없어요. 잘했어요!');
      }
      lines.push('');

      lines.push('🎯 오늘의 루틴');
      if (!d.todayRoutine.hasActiveRoutine) {
        lines.push('배정된 루틴이 없어요.');
      } else {
        lines.push(`${d.todayRoutine.routineTitle ?? '-'} — DAY ${d.todayRoutine.currentDay}`);
        lines.push(
          `진행 ${d.todayRoutine.todayProgress}% (${d.todayRoutine.requiredTasksCompleted}/${d.todayRoutine.requiredTasksTotal} 완료)`,
        );
      }
      lines.push('');

      lines.push('📚 오늘의 족보 기록');
      if (!d.isToeic) {
        lines.push('해당 없음');
      } else {
        const br = d.todayScore.todayJokboTagBreakdown ?? [];
        const totalAtt = br.reduce((a, x) => a + x.attempts, 0);
        if (totalAtt === 0) {
          lines.push('오늘 족보 학습 기록이 없어요.');
        } else {
          const totalCor = br.reduce((a, x) => a + x.correctCount, 0);
          const rate = Math.round((totalCor / totalAtt) * 1000) / 10;
          lines.push(`오늘 ${totalAtt}회 학습, 정답률 ${rate}%`);
          br.forEach((row) => {
            lines.push(`• ${row.tag} — ${row.attempts}건 (${row.correctRate}%)`);
          });
        }
      }
      lines.push('');
    }

    lines.push('📜 개인 로그');
    const studentLogs = statusLogs
      .filter((log) => (log.student_name || '').trim() === name)
      .slice(0, 20);
    if (studentLogs.length === 0) {
      lines.push('이 학생의 사건 기록이 없어요.');
    } else {
      studentLogs.forEach((log) => {
        lines.push(`[${formatLogDateAndTime(log.created_at)}] ${log.message ?? log.event_type ?? ''}`);
      });
    }
    return lines.join('\n');
  };

  useEffect(() => {
    if (teacherLoading) return undefined;
    if (!teacher?.id) {
      setStudents([]);
      setFetchError(null);
      allowedStudentNamesRef.current = new Set();
      allowedStudentIdsRef.current = new Set();
      return undefined;
    }

    const teacherId = teacher.id;
    let channel;
    let channelRoutines;
    let cancelled = false;

    const fetchStudents = async () => {
      setFetchError(null);
      const { data, error, studentNames } = await fetchStudentStatusForTeacher(teacherId);
      allowedStudentNamesRef.current = new Set(
        (studentNames || []).map((n) => String(n).trim()).filter(Boolean),
      );
      const ids = await fetchStudentIdsForTeacher(teacherId);
      allowedStudentIdsRef.current = new Set(ids.map(String));
      if (error) {
        setFetchError(error.message || 'Supabase 연결 실패');
        return;
      }
      setStudents(sortStudents(data ?? []));
      try {
        const map = await fetchStudentRoutineSummariesForTeacher(teacherId);
        setRoutineSummaries(map);
      } catch (e) {
        console.warn('[monitor] 루틴 요약 실패:', e);
        setRoutineSummaries({});
      }
    };
    refetchStudentsRef.current = fetchStudents;

    const onStudentStatusRealtime = () => {
      void fetchStudents();
    };

    /** student_routines 는 student_status 와 별도로 바뀔 수 있음 — 같은 반 student_id 만 반영 */
    const onStudentRoutinesRealtime = (payload) => {
      const sid = payload?.new?.student_id ?? payload?.old?.student_id;
      if (sid == null || sid === '') return;
      const id = String(sid);
      if (allowedStudentIdsRef.current.has(id)) {
        fetchStudentRoutineSummariesForTeacher(teacherId)
          .then((map) => setRoutineSummaries(map))
          .catch(() => setRoutineSummaries({}));
        return;
      }
      void fetchStudents();
    };

    void (async () => {
      await fetchStudents();
      if (cancelled) return;
      channel = supabase
        .channel(`student_status_changes_${teacherId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'student_status' },
          onStudentStatusRealtime,
        )
        .subscribe();
      channelRoutines = supabase
        .channel(`student_routines_changes_${teacherId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'student_routines' },
          onStudentRoutinesRealtime,
        )
        .subscribe();
    })();

    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') fetchStudents();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (channel) supabase.removeChannel(channel);
      if (channelRoutines) supabase.removeChannel(channelRoutines);
    };
  }, [teacher?.id, teacherLoading]);

  useEffect(() => {
    if (teacherLoading || !teacher?.id) return undefined;

    const teacherId = teacher.id;

    const fetchLogs = async () => {
      setStatusLogsError(null);
      const { data, error } = await fetchStatusLogsForTeacher(teacherId, LOG_LIMIT);
      if (error) {
        const msg = error.message || '알 수 없는 오류';
        console.warn('실시간 사건 기록 조회 실패:', msg);
        setStatusLogsError(msg);
        return;
      }
      setStatusLogs(data ?? []);
    };
    refetchLogsRef.current = fetchLogs;
    fetchLogs();
    const ch = supabase
      .channel(`status_logs_changes_${teacherId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'status_logs',
          filter: `teacher_id=eq.${teacherId}`,
        },
        fetchLogs,
      )
      .subscribe();
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') fetchLogs();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(ch);
    };
  }, [teacher?.id, teacherLoading]);

  const { main, safe } = splitZones(students);
  const absent2Days = students.filter((r) => isAbsent2Days(r.last_active));
  const style = STATUS_STYLE;
  const todaySurvivors = students.filter((r) => isTodayKorea(r.last_active));
  const todayAbsent = students.filter((r) => !isTodayKorea(r.last_active));
  const liveNowCount = students.filter((r) => isActiveWithinMinutes(r.last_active, 5)).length;
  const todayEventsCount = statusLogs.filter((log) => isTodayKorea(log?.created_at)).length;

  const toInitialStyle = (name) => {
    const s = (name || '').trim();
    if (!s) return '○○○';
    return s.charAt(0) + '○○';
  };

  const handleCopyTodayStatus = async () => {
    if (!teacher?.id) return;
    const { data: list, error } = await fetchStudentStatusNamesForTeacher(teacher.id);
    if (error) {
      setCopyToast('조회 실패. 다시 눌러주세요.');
      setTimeout(() => setCopyToast(null), 3000);
      return;
    }
    const rows = Array.isArray(list) ? list : [];
    const survivors = rows.filter((r) => isTodayKorea(r.last_active));
    const absent = rows.filter((r) => !isTodayKorea(r.last_active));
    const survivorNames = survivors.map((r) => (r.student_name || '').trim() || '-').filter(Boolean);
    const absentInitials = absent.map((r) => toInitialStyle(r.student_name));
    const survN = survivorNames.length;
    const absentN = absentInitials.length;

    const parts = [
      '📜 [똑패스] 오늘의 현황판',
      '',
      `🤴 오늘의 공주,왕자님 (${survN}명)`,
      ...(survN > 0 ? formatNamesInLines(survivorNames) : []),
      '💬 "숙제 끝내고 꿀잠 예약 🛌 진짜 고생했어!"',
      '',
      `🍂 빈자리가 느껴져요 머쓱; (${absentN}명)`,
      ...(absentN > 0 ? [`· ${absentInitials.join(', ')}`] : []),
      '💬 "나 다 싶으면... 조용히 앱 켜기 (아직 안 늦음 😉)"',
    ];
    copyToClipboard(parts.join('\n'));
  };

  /** 오늘 출석만 복사 (40명 초과 시 N차로 나눠 복사, 다시 클릭 시 다음 차수) */
  const handleCopyTodayAttendanceOnly = async () => {
    if (!teacher?.id) return;
    const ref = attendanceCopyRef.current;
    if (ref.names === null || ref.chunk * COPY_CHUNK_SIZE >= ref.names.length) {
      const { data: list, error } = await fetchStudentStatusNamesForTeacher(teacher.id);
      if (error) {
        setCopyToast('조회 실패. 다시 눌러주세요.');
        setTimeout(() => setCopyToast(null), 3000);
        return;
      }
      const rows = Array.isArray(list) ? list : [];
      const survivors = rows.filter((r) => isTodayKorea(r.last_active));
      ref.names = survivors.map((r) => (r.student_name || '').trim() || '-').filter(Boolean);
      ref.chunk = 0;
    }
    const names = ref.names;
    const total = names.length;
    if (total === 0) {
      setCopyToast('오늘 출석 0명');
      setTimeout(() => setCopyToast(null), 2000);
      ref.names = null;
      ref.chunk = 0;
      return;
    }
    const start = ref.chunk * COPY_CHUNK_SIZE;
    const end = Math.min(start + COPY_CHUNK_SIZE, names.length);
    const chunkNames = names.slice(start, end);
    const isLast = end >= total;
    const parts = [
      '🤴 [똑패스] 오늘 출석',
      total > COPY_CHUNK_SIZE ? `(${start + 1}~${end} / ${total}명)` : `(${total}명)`,
      '',
      ...formatNamesInLines(chunkNames),
      '',
      '💬 "숙제 끝내고 꿀잠 예약 🛌 진짜 고생했어!"',
    ];
    copyToClipboard(parts.join('\n'));
    ref.chunk += 1;
    if (ref.chunk * COPY_CHUNK_SIZE >= total) {
      ref.names = null;
      ref.chunk = 0;
      setCopyToast(isLast && total > COPY_CHUNK_SIZE ? `마지막 차수 복사됨 (${chunkNames.length}명). 다음에 클릭하면 1차부터` : '복사됨');
    } else {
      setCopyToast(`${ref.chunk}차 복사됨 (${chunkNames.length}명). 다음 차수는 다시 클릭`);
    }
    setTimeout(() => setCopyToast(null), 3000);
  };

  /** 오늘 미접속만 복사 (40명 초과 시 N차로 나눠 복사) */
  const handleCopyTodayAbsentOnly = async () => {
    if (!teacher?.id) return;
    const ref = absentCopyRef.current;
    if (ref.initials === null || ref.chunk * COPY_CHUNK_SIZE >= ref.initials.length) {
      const { data: list, error } = await fetchStudentStatusNamesForTeacher(teacher.id);
      if (error) {
        setCopyToast('조회 실패. 다시 눌러주세요.');
        setTimeout(() => setCopyToast(null), 3000);
        return;
      }
      const rows = Array.isArray(list) ? list : [];
      const absent = rows.filter((r) => !isTodayKorea(r.last_active));
      ref.initials = absent.map((r) => toInitialStyle(r.student_name));
      ref.chunk = 0;
    }
    const initials = ref.initials;
    const total = initials.length;
    if (total === 0) {
      setCopyToast('오늘 미접속 0명');
      setTimeout(() => setCopyToast(null), 2000);
      ref.initials = null;
      ref.chunk = 0;
      return;
    }
    const start = ref.chunk * COPY_CHUNK_SIZE;
    const end = Math.min(start + COPY_CHUNK_SIZE, initials.length);
    const chunkInitials = initials.slice(start, end);
    const isLast = end >= total;
    const parts = [
      '🍂 [똑패스] 오늘 미접속',
      total > COPY_CHUNK_SIZE ? `(${start + 1}~${end} / ${total}명)` : `(${total}명)`,
      '',
      total > COPY_CHUNK_SIZE ? `· ${chunkInitials.join(', ')}` : `· ${chunkInitials.join(', ')}`,
      '',
      '💬 "나 다 싶으면... 조용히 앱 켜기 (아직 안 늦음 😉)"',
    ];
    copyToClipboard(parts.join('\n'));
    ref.chunk += 1;
    if (ref.chunk * COPY_CHUNK_SIZE >= total) {
      ref.initials = null;
      ref.chunk = 0;
      setCopyToast(isLast && total > COPY_CHUNK_SIZE ? `마지막 차수 복사됨 (${chunkInitials.length}명). 다음에 클릭하면 1차부터` : '복사됨');
    } else {
      setCopyToast(`${ref.chunk}차 복사됨 (${chunkInitials.length}명). 다음 차수는 다시 클릭`);
    }
    setTimeout(() => setCopyToast(null), 3000);
  };

  /** 이틀 미접속 학생들에게 보낼 멘트 복사 (이름 목록 + 공통 멘트) */
  const handleCopyAbsent2Ment = () => {
    if (absent2Days.length === 0) {
      setCopyToast('이틀 미접속 학생이 없습니다.');
      setTimeout(() => setCopyToast(null), 2000);
      return;
    }
    const names = absent2Days.map((r) => (r.student_name || '').trim() || '(이름없음)').filter(Boolean);
    const ment = [
      '📅 [똑패스] 이틀째 접속이 없어요 (개별 발송용)',
      '',
      `대상: ${names.join(', ')}`,
      '',
      '💬 보낼 멘트:',
      '"이틀째 앱에 안 들어오셨네요! 오늘만이라도 켜보시면 감사해요 😊 아직 안 늦었어요!"',
    ];
    copyToClipboard(ment.join('\n'));
  };

  if (teacherLoading) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <h1 style={styles.title}>실시간 학생 모니터링</h1>
          <p style={{ color: '#64748b' }}>선생님 정보를 확인하는 중…</p>
        </div>
      </div>
    );
  }

  if (!teacher?.id) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <h1 style={styles.title}>실시간 학생 모니터링</h1>
          <div style={styles.errorBox}>
            로그인한 이메일에 해당하는 선생님(teachers 테이블) 정보가 없습니다. Supabase에서 이메일을 등록했는지 확인해 주세요.
          </div>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <h1 style={styles.title}>실시간 학생 모니터링</h1>
          <div style={styles.errorBox}>{fetchError}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="monitor-page" style={styles.page}>
      <div className="monitor-container" style={styles.container}>
        <header className="monitor-header" style={styles.header}>
          <h1 className="monitor-title" style={styles.title}>실시간 학생 모니터링</h1>
          <div style={styles.headerRight}>
            <Link
              href="/teacher/words"
              className="monitor-copy-btn"
              style={{ ...styles.copyBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              📚 단어 관리
            </Link>
            <button type="button" onClick={handleCopyTodayAttendanceOnly} className="monitor-copy-btn" style={styles.copyBtn} title="오늘 출석만 복사 (40명 넘으면 N차로 나눠 복사)">
              📢 오늘 출석 복사
            </button>
            <button type="button" onClick={handleCopyTodayAbsentOnly} className="monitor-copy-btn" style={styles.copyBtn} title="오늘 미접속만 복사 (40명 넘으면 N차로 나눠 복사)">
              🍂 오늘 미접속 복사
            </button>
            <button type="button" onClick={handleCopyTodayStatus} className="monitor-copy-btn" style={{ ...styles.copyBtn, opacity: 0.9, fontWeight: 500 }} title="출석+미접속 한 번에 복사 (인원 적을 때)">
              한 번에 복사
            </button>
            <button type="button" onClick={() => setLegendOpen((o) => !o)} style={styles.legendBtn} aria-expanded={legendOpen}>
              ❓ 상태 설명
            </button>
            <span style={styles.liveBadge}><span style={styles.liveDot} /> 실시간</span>
          </div>
        </header>
        <div style={styles.summaryBar}>
          <span style={styles.summaryIcon}>🕐</span>
          <span>24시간 실시간 모니터링</span>
          <span style={styles.summarySep}>·</span>
          <span>오늘 출석 <strong>{todaySurvivors.length}명</strong></span>
          <span style={styles.summarySep}>·</span>
          <span>지금 접속 중 <strong style={{ color: liveNowCount > 0 ? '#5b7cfa' : undefined }}>{liveNowCount}명</strong></span>
          <span style={styles.summarySep}>·</span>
          <span>오늘 사건 <strong>{todayEventsCount}건</strong></span>
        </div>
        {copyToast && <div style={styles.toast}>{copyToast}</div>}

        {legendOpen && (
          <div style={styles.legendPanel}>
            {['gold', 'blue', 'green', 'purple', 'red', 'white'].map((key) => (
              <div key={key} style={{ ...styles.legendItem, borderLeftColor: style[key]?.border || '#ccc' }}>
                <span>{style[key]?.label || key}</span>
              </div>
            ))}
          </div>
        )}

        <section style={styles.section}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 className="monitor-section-title" style={styles.sectionTitle}>집중 관리 존 <span style={styles.count}>(최근 활동 순 상위 {MAIN_ZONE_MAX}명 · 풀면 위로)</span></h2>
            <button
              type="button"
              onClick={() => refetchStudentsRef.current?.()}
              style={{ padding: '6px 12px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer' }}
              title="폰에서 불이 안 바뀔 때 눌러서 최신 상태 불러오기"
            >
              🔄 갱신
            </button>
          </div>
          <p style={{ marginTop: -8, marginBottom: 12, fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>최근에 문제 푼 사람이 맨 위. 문제 풀면 위로 올라오고, 31번째는 안전 보관함으로 내려감 · 정답=파란불 / 오답=빨간불</p>
          <div className="monitor-card-grid" style={styles.cardGrid}>
            {main.map((row) => {
              const light = getAnswerLightStyle(row);
              const s = style[row.student_color] || style.white;
              return (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  className="monitor-card"
                  style={{
                    ...styles.card,
                    borderLeftColor: light.border,
                    borderLeftWidth: 4,
                    background: light.bg,
                    cursor: 'pointer',
                  }}
                  onClick={() => setDetailStudent(row)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailStudent(row); } }}
                >
                  <div style={styles.cardHeader}>
                    <span className="monitor-card-name" style={styles.cardName}>{row.student_name ?? '-'}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {isAbsent2Days(row.last_active) && <span style={styles.badgeAbsent2}>이틀 미접속</span>}
                      <span className="monitor-badge" style={{ ...styles.badge, background: light.badge }}>{light.label}</span>
                    </div>
                  </div>
                  <MonitorRoutineLines studentId={row.student_id} map={routineSummaries} />
                  {row.last_active != null && <div className="monitor-card-time" style={styles.cardTime} title="마지막 활동 시각 (한국시간)">{formatActive(row.last_active)}</div>}
                  <div className="monitor-card-info" style={styles.cardInfo}>
                    {light.label === '정답' && (row.last_answer_tag ? `✅ 정답 · ${row.last_answer_tag}` : '✅ 정답')}
                    {light.label === '오답' && (row.last_answer_tag ? `❌ 오답 · ${row.last_answer_tag}` : '❌ 오답')}
                    {light.label === '대기' && '⏳ 대기'}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); copyToClipboard(getKakaoMent(row, s)); }}
                    className="monitor-card-copy"
                    style={styles.cardCopyBtn}
                    title="카톡 멘트 복사"
                    aria-label="카톡 멘트 복사"
                  >
                    💬 복사
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section style={styles.section}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <h2 style={styles.sectionTitle}>이틀 연속 미접속</h2>
            <button
              type="button"
              onClick={handleCopyAbsent2Ment}
              style={{ padding: '6px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #ea580c', background: '#fff7ed', color: '#ea580c', cursor: 'pointer', fontWeight: 600 }}
              title="이틀 미접속 학생 이름 + 보낼 멘트 복사"
            >
              📅 이틀 미접속 멘트 복사
            </button>
          </div>
          <div style={styles.absent2Bar} onClick={() => setAbsent2Open((o) => !o)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setAbsent2Open((o) => !o)}>
            <span>📅</span>
            <span>{absent2Days.length}명</span>
            <span style={{ marginLeft: 'auto' }}>{absent2Open ? '▲' : '▼'}</span>
          </div>
          {absent2Open && absent2Days.length > 0 && (
            <div style={styles.safeList}>
              {absent2Days.map((row) => {
                const s = style[row.student_color] || style.white;
                return (
                  <div key={row.id} style={{ ...styles.safeItem, flexDirection: 'column', alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%' }}>
                      <span style={styles.safeItemName}>{row.student_name ?? '-'}</span>
                      <span style={{ ...styles.badgeSmall, background: s.badge }}>{s.label}</span>
                      {row.last_active != null && <span style={styles.safeItemTime}>{formatActive(row.last_active)}</span>}
                    </div>
                    <MonitorRoutineLines studentId={row.student_id} map={routineSummaries} compact />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>안전 보관함 <span style={styles.count}>(그 외 전원)</span></h2>
          <div style={styles.safeBar} onClick={() => setSafeOpen((o) => !o)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSafeOpen((o) => !o)}>
            <span>🟢</span>
            <span>외 {safe.length}명</span>
            <span style={{ marginLeft: 'auto' }}>{safeOpen ? '▲' : '▼'}</span>
          </div>
          {safeOpen && safe.length > 0 && (
            <div style={styles.safeList}>
              {safe.map((row) => {
                const s = style[row.student_color] || style.white;
                return (
                  <div key={row.id} style={{ ...styles.safeItem, flexDirection: 'column', alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%' }}>
                      <span style={styles.safeItemName}>{row.student_name ?? '-'}</span>
                      {isAbsent2Days(row.last_active) && <span style={styles.badgeAbsent2Small}>이틀 미접속</span>}
                      <span style={{ ...styles.badgeSmall, background: s.badge }}>{s.label}</span>
                      {row.last_active != null && <span style={styles.safeItemTime}>{formatActive(row.last_active)}</span>}
                    </div>
                    <MonitorRoutineLines studentId={row.student_id} map={routineSummaries} compact />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section style={styles.section}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <h2 style={styles.sectionTitle}>📢 실시간 사건 기록 <span style={styles.count}>(최신 {LOG_LIMIT}건)</span></h2>
            <button
              type="button"
              onClick={() => refetchLogsRef.current?.()}
              style={{ padding: '6px 12px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer' }}
              title="3연속 오답·복습 완료 등이 안 보일 때 눌러서 최신 기록 불러오기"
            >
              🔄 갱신
            </button>
          </div>
          {statusLogsError && (
            <div style={{ marginBottom: 12, padding: 10, background: 'rgba(239,68,68,0.1)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
              ⚠️ 실시간 사건 기록 조회 실패: {statusLogsError}
              <br />
              <span style={{ opacity: 0.8 }}>Supabase Table Editor에서 status_logs 테이블·RLS 정책을 확인하세요. (빨간불_파란불_스코어_안될때_점검.md 참고)</span>
            </div>
          )}
          <div style={styles.logList}>
            {statusLogs.length === 0 && !statusLogsError ? (
              <div style={styles.logEmpty}>아직 기록된 사건이 없어요.</div>
            ) : statusLogs.length === 0 ? null : (
              statusLogs.map((row) => (
                <div key={row.id} style={styles.logItem}>
                  <span style={styles.logTime} title="한국시간">[{formatLogDateAndTime(row.created_at)}]</span>
                  <span style={styles.logName}>
                    {(row.student_name || '').trim() || '이름없음'}
                    {((row.student_name || '').trim() === '이름없음' && row.student_id) ? ` (${row.student_id})` : ''}
                  </span>
                  <span style={styles.logSep}>-</span>
                  <span style={styles.logMessage}>{row.message ?? row.event_type ?? ''}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(getKakaoMentForLog(row))}
                    style={styles.logCopyBtn}
                    title="이 로그에 맞는 카톡 멘트 복사 (학생명 자동 반영)"
                    aria-label="카톡 멘트 복사"
                  >
                    💬 복사
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
        {/* end sections */}

        {detailStudent && (
          <div style={styles.modalOverlay} onClick={() => setDetailStudent(null)} role="dialog" aria-modal="true" aria-labelledby="detail-title">
            <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 id="detail-title" style={styles.modalTitle}>🕵️ {detailStudent.student_name ?? '-'} 상세</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); copyToClipboard(getDetailModalCopyText()); }}
                    style={styles.logCopyBtn}
                    title="상세 내용 카톡 등으로 보내기"
                  >
                    💬 복사
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); alert('준비 중'); }}
                    style={styles.logCopyBtn}
                    title="PDF (준비 중)"
                  >
                    📄 PDF
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setReportOpen(true); }}
                    style={styles.logCopyBtn}
                    title="학생 개인 리포트"
                  >
                    📊 리포트
                  </button>
                  <button type="button" onClick={() => setDetailStudent(null)} style={styles.modalClose} aria-label="닫기">✕</button>
                </div>
              </div>
              <div style={styles.modalBody}>
                {reportLoading && (
                  <p style={{ ...styles.detailPlaceholder, marginBottom: 16 }}>불러오는 중...</p>
                )}
                {reportError && (
                  <p style={styles.reportLoadError}>
                    리포트 로드 실패:
                    {' '}
                    {reportError}
                  </p>
                )}
                {!reportLoading && !reportError && reportData === null && (
                  <p style={{ ...styles.detailPlaceholder, marginBottom: 16 }}>데이터 없음</p>
                )}

                {!reportLoading && !reportError && reportData && (
                  <>
                    <div style={styles.detailBlock}>
                      <h3 style={styles.detailBlockTitle}>📘 오늘의 스코어</h3>
                      {!reportData.isToeic ? (
                        <p style={styles.detailNa}>해당 없음</p>
                      ) : (
                        <>
                          <p style={styles.detailScore}>
                            누적 Score:
                            {' '}
                            <strong>{reportData.todayScore.cumulativeScore}</strong>
                          </p>
                          {reportData.todayScore.todayAttempts === 0 ? (
                            <p style={{ ...styles.detailScore, marginTop: 8 }}>
                              오늘 0문제 풀었고, 정답률은 0%입니다.
                            </p>
                          ) : reportData.todayScore.todayCorrectRate == null ? (
                            <p style={{ ...styles.detailScore, marginTop: 8 }}>오늘 푼 문제 없음</p>
                          ) : (
                            (() => {
                              const att = reportData.todayScore.todayAttempts;
                              const rate = reportData.todayScore.todayCorrectRate;
                              const correct = Math.round((rate / 100) * att);
                              const wrong = att - correct;
                              return (
                                <p style={{ ...styles.detailScore, marginTop: 8 }}>
                                  오늘 정답률:
                                  {' '}
                                  <strong>{rate}%</strong>
                                  {' '}
                                  (
                                  {correct}
                                  정답 /
                                  {' '}
                                  {wrong}
                                  오답)
                                </p>
                              );
                            })()
                          )}
                        </>
                      )}
                    </div>

                    <div style={styles.detailBlock}>
                      <h3 style={styles.detailBlockTitle}>📊 극복 과제들</h3>
                      {!reportData.isToeic ? (
                        <p style={styles.detailNa}>해당 없음</p>
                      ) : reportData.todayScore.topWrongTags.length > 0 ? (
                        <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#374151', fontSize: 14, lineHeight: 1.65 }}>
                          {reportData.todayScore.topWrongTags.map((t) => (
                            <li key={t.tag}>
                              {t.tag}
                              {' '}
                              —
                              {' '}
                              {t.wrongCount}
                              /
                              {t.totalCount}
                              {' '}
                              오답 (
                              {t.wrongRate}
                              %)
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p style={styles.detailPlaceholder}>오늘 오답이 없어요. 잘했어요!</p>
                      )}
                    </div>

                    <div style={styles.detailBlock}>
                      <h3 style={styles.detailBlockTitle}>🎯 오늘의 루틴</h3>
                      {!reportData.todayRoutine.hasActiveRoutine ? (
                        <p style={styles.detailNa}>배정된 루틴이 없어요.</p>
                      ) : (
                        <>
                          <p style={styles.detailScore}>
                            <strong>{reportData.todayRoutine.routineTitle ?? '-'}</strong>
                          </p>
                          <p style={{ ...styles.detailScoreSub, marginTop: 4 }}>
                            DAY
                            {' '}
                            {reportData.todayRoutine.currentDay}
                          </p>
                          <div style={{ marginTop: 10 }}>
                            <div style={styles.routineTrack}>
                              <div
                                style={{
                                  ...styles.routineFill,
                                  width: `${Math.min(100, Math.max(0, reportData.todayRoutine.todayProgress))}%`,
                                  background: routineProgressFillColor(reportData.todayRoutine.todayProgress),
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, flexWrap: 'wrap', gap: 6 }}>
                              <span style={styles.detailScoreSub}>
                                {reportData.todayRoutine.requiredTasksCompleted}
                                {' '}
                                /
                                {' '}
                                {reportData.todayRoutine.requiredTasksTotal}
                                {' '}
                                완료
                              </span>
                              <span style={{ ...styles.detailScore, fontWeight: 600 }}>
                                {reportData.todayRoutine.todayProgress}
                                %
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div style={styles.detailBlock}>
                      <h3 style={styles.detailBlockTitle}>📚 오늘의 족보 기록</h3>
                      {!reportData.isToeic ? (
                        <p style={styles.detailNa}>해당 없음</p>
                      ) : (() => {
                        const br = reportData.todayScore.todayJokboTagBreakdown ?? [];
                        const totalAtt = br.reduce((a, x) => a + x.attempts, 0);
                        if (totalAtt === 0) {
                          return <p style={styles.detailPlaceholder}>오늘 족보 학습 기록이 없어요.</p>;
                        }
                        const totalCor = br.reduce((a, x) => a + x.correctCount, 0);
                        const rate = Math.round((totalCor / totalAtt) * 1000) / 10;
                        return (
                          <>
                            <p style={styles.detailScore}>
                              오늘
                              {' '}
                              <strong>{totalAtt}</strong>
                              회 학습, 정답률
                              {' '}
                              <strong>{rate}</strong>
                              %
                            </p>
                            <ul
                              style={{
                                margin: '10px 0 0',
                                paddingLeft: 18,
                                color: '#374151',
                                fontSize: 14,
                                lineHeight: 1.65,
                                listStyle: 'none',
                              }}
                            >
                              {br.map((row) => (
                                <li key={row.tag}>
                                  •
                                  {' '}
                                  {row.tag}
                                  {' '}
                                  —
                                  {' '}
                                  {row.attempts}
                                  건 (
                                  {row.correctRate}
                                  %)
                                </li>
                              ))}
                            </ul>
                          </>
                        );
                      })()}
                    </div>
                  </>
                )}

                <div style={styles.detailBlock}>
                  <h3 style={styles.detailBlockTitle}>📜 개인 로그</h3>
                  <div style={styles.detailLogList}>
                    {statusLogs.filter((log) => (log.student_name || '').trim() === (detailStudent.student_name || '').trim()).length === 0 ? (
                      <p style={styles.detailLogEmpty}>이 학생의 사건 기록이 없어요.</p>
                    ) : (
                      statusLogs
                        .filter((log) => (log.student_name || '').trim() === (detailStudent.student_name || '').trim())
                        .slice(0, 20)
                        .map((log) => (
                          <div key={log.id} style={styles.detailLogItem}>
                            <span style={styles.detailLogTime}>[{formatLogDateAndTime(log.created_at)}]</span>
                            <span style={styles.detailLogMsg}>{log.message ?? log.event_type ?? ''}</span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {reportOpen && detailStudent && (
          <StudentReportLayer
            studentDisplayName={detailStudent.student_name}
            onClose={() => setReportOpen(false)}
            loading={reportLoading}
            error={reportError}
            data={reportData}
            teacherName={teacher?.name}
            teacherAcademyName={teacher?.academy_name}
            teacherAcademyLogoUrl={teacher?.academy_logo_url}
          />
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f3e7ff 0%, #eef2ff 100%)',
    padding: '0 0 32px',
    fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  },
  container: {
    width: '100%',
    maxWidth: 'min(1680px, 100%)',
    margin: '0 auto',
    background: 'rgba(255,255,255,0.7)',
    backdropFilter: 'blur(12px)',
    borderRadius: 24,
    padding: '20px 20px 32px',
    boxShadow: '0 8px 32px rgba(31,38,135,0.05)',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.5)' },
  title: { margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#374151' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  legendBtn: { padding: '6px 12px', border: '1px solid rgba(107,114,128,0.3)', borderRadius: 12, background: 'rgba(255,255,255,0.9)', fontSize: 12, cursor: 'pointer' },
  legendPanel: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20, padding: 12, background: 'rgba(255,255,255,0.9)', borderRadius: 16 },
  legendItem: { padding: '6px 12px', borderLeft: '4px solid', borderRadius: 8, fontSize: 12 },
  copyBtn: { padding: '6px 12px', border: '1px solid rgba(107,114,128,0.3)', borderRadius: 12, background: 'rgba(255,255,255,0.9)', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 },
  liveBadge: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#ede9fe', borderRadius: 20, fontSize: 13, fontWeight: 600, color: '#5b21b6' },
  liveDot: { width: 8, height: 8, borderRadius: '50%', background: '#764ba2' },
  toast: { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '10px 20px', background: '#374151', color: '#fff', borderRadius: 12, fontSize: 14, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' },
  summaryBar: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '12px 16px', marginBottom: 20, background: 'linear-gradient(90deg, rgba(106,17,203,0.08) 0%, rgba(37,117,252,0.06) 100%)', borderRadius: 16, border: '1px solid rgba(106,17,203,0.15)', fontSize: 14, color: '#374151', fontWeight: 500 },
  summaryIcon: { fontSize: 18 },
  summarySep: { color: '#9ca3af', fontWeight: 400 },
  section: { marginBottom: 28 },
  sectionTitle: { margin: '0 0 14px', paddingLeft: 14, borderLeft: '4px solid #6a11cb', fontSize: '1rem', fontWeight: 700, color: '#374151' },
  count: { fontWeight: 500, color: '#6b7280', fontSize: '0.9rem' },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 14 },
  card: { padding: 20, borderRadius: 24, borderLeft: '4px solid', boxShadow: '0 8px 32px rgba(100,100,255,0.1)' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  cardName: { fontWeight: 700, fontSize: '1rem', color: '#374151' },
  badge: { padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#fff' },
  badgeSmall: { padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 600, color: '#fff' },
  cardTime: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  cardInfo: { fontSize: 12, color: '#4b5563', lineHeight: 1.4, marginBottom: 8 },
  cardCopyBtn: { width: '100%', padding: '6px 10px', border: '1px solid rgba(107,114,128,0.25)', borderRadius: 10, background: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  badgeAbsent2: { padding: '3px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, color: '#fff', background: '#b91c1c' },
  badgeAbsent2Small: { padding: '2px 6px', borderRadius: 6, fontSize: 9, fontWeight: 600, color: '#fff', background: '#b91c1c' },
  absent2Bar: { display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', borderRadius: 18, cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#991b1b', border: '1px solid rgba(185,28,28,0.2)' },
  safeBar: { display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', background: 'linear-gradient(135deg, #e6f4ea 0%, #c8e6d3 100%)', borderRadius: 18, cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#2E7D32' },
  safeList: { marginTop: 12, background: 'rgba(255,255,255,0.92)', borderRadius: 24, overflow: 'hidden' },
  safeItem: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '14px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: 14 },
  safeItemName: { fontWeight: 600, minWidth: 60 },
  safeItemTime: { fontSize: 12, color: '#6b7280' },
  logList: { background: 'rgba(255,255,255,0.92)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.6)', overflow: 'hidden' },
  logItem: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '14px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: 16, lineHeight: 1.5 },
  logTime: { fontFamily: 'monospace', fontSize: 15, color: '#374151', fontWeight: 500 },
  logName: { fontWeight: 700, fontSize: 16, color: '#1f2937' },
  logSep: { color: '#94a3b8', fontSize: 16 },
  logMessage: { color: '#1f2937', flex: 1, fontSize: 16, fontWeight: 500 },
  logCopyBtn: { flexShrink: 0, padding: '6px 12px', border: '1px solid rgba(107,114,128,0.3)', borderRadius: 10, background: 'rgba(255,255,255,0.9)', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 },
  logEmpty: { padding: 28, textAlign: 'center', color: '#6b7280', fontSize: 16 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 10000, padding: '16px 20px 24px', overflowY: 'auto' },
  modalBox: { background: '#fff', borderRadius: 24, maxWidth: 420, width: '100%', maxHeight: 'calc(100vh - 40px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,0.2)', flexShrink: 0 },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '20px 24px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 },
  modalTitle: { margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#374151' },
  modalClose: { width: 36, height: 36, border: 'none', background: 'transparent', fontSize: 18, color: '#6b7280', cursor: 'pointer', borderRadius: 8 },
  modalBody: { padding: '20px 24px', overflowY: 'auto', flex: 1 },
  detailBlock: { marginBottom: 24 },
  detailBlockTitle: { margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 700, color: '#374151' },
  detailPlaceholder: { margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.5 },
  detailScore: { margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.6 },
  detailScoreSub: { fontSize: 13, color: '#6b7280' },
  detailLogList: { background: '#f9fafb', borderRadius: 12, padding: 12, maxHeight: 200, overflowY: 'auto' },
  detailLogEmpty: { margin: 0, padding: 16, textAlign: 'center', color: '#9ca3af', fontSize: 13 },
  detailLogItem: { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #e5e7eb', fontSize: 13 },
  detailLogTime: { fontFamily: 'monospace', color: '#6b7280', flexShrink: 0 },
  detailLogMsg: { color: '#374151', flex: 1 },
  detailNa: { margin: '6px 0 0', fontSize: 13, color: '#888', lineHeight: 1.5 },
  reportLoadError: { margin: '0 0 16px', fontSize: 13, color: '#dc2626', lineHeight: 1.5 },
  routineTrack: { height: 10, borderRadius: 5, background: '#e5e7eb', overflow: 'hidden' },
  routineFill: { height: '100%', borderRadius: 5, transition: 'width 0.2s ease' },
  errorBox: { padding: 22, background: 'linear-gradient(135deg, #fce8e6 0%, #f9d5d2 100%)', borderRadius: 24, color: '#991b1b' },
};
