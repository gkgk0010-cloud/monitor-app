import { supabase } from '@/utils/supabaseClient';

/**
 * 선생님 소속 학생 id 목록 (students.teacher_id 기준)
 * @param {string} teacherId
 * @returns {Promise<string[]>}
 */
export async function fetchStudentIdsForTeacher(teacherId) {
  if (!teacherId) return [];
  const { data, error } = await supabase.from('students').select('id').eq('teacher_id', teacherId);
  if (error) {
    console.warn('[teacherQueries] students 조회 실패:', error.message);
    return [];
  }
  return (data || []).map((r) => r.id).filter(Boolean);
}

/**
 * 선생님 소속 학생 표시 이름 목록 (student_status.student_name 과 맞추기 위함)
 * students.id 와 student_status.student_id 가 다른 타입/값일 수 있어 이름으로 연결
 * @param {string} teacherId
 * @returns {Promise<string[]>}
 */
export async function fetchStudentNamesForTeacher(teacherId) {
  if (!teacherId) return [];
  const { data, error } = await supabase.from('students').select('*').eq('teacher_id', teacherId);
  if (error) {
    console.warn('[teacherQueries] students 이름 조회 실패:', error.message);
    return [];
  }
  const names = new Set();
  for (const r of data || []) {
    const n = String(r?.name ?? r?.student_name ?? r?.Name ?? '')
      .trim();
    if (n) names.add(n);
  }
  return [...names];
}

/**
 * student_status: students 에서 같은 선생님 반 학생 이름만 조회 후 student_name IN (…)
 * (student_status.student_id 는 students.id 와 직접 대응하지 않을 수 있음)
 * @param {string} teacherId
 * @returns {Promise<{ data: object[] | null, error: Error | null, studentNames: string[] }>}
 */
export async function fetchStudentStatusForTeacher(teacherId) {
  const studentNames = await fetchStudentNamesForTeacher(teacherId);
  if (studentNames.length === 0) {
    return { data: [], error: null, studentNames: [] };
  }
  const res = await supabase.from('student_status').select('*').in('student_name', studentNames);
  return { ...res, studentNames };
}

/**
 * status_logs — teacher_id 일치 + KST 기준 이번 달 1일 0시 이후만
 * @param {string} teacherId
 * @param {number} limit
 */
export async function fetchStatusLogsForTeacher(teacherId, limit) {
  if (!teacherId) {
    return { data: [], error: null };
  }
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  const firstDay = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1) - kstOffset,
  ).toISOString();

  return supabase
    .from('status_logs')
    .select('id, student_name, event_type, message, created_at')
    .eq('teacher_id', teacherId)
    .gte('created_at', firstDay)
    .order('created_at', { ascending: false })
    .limit(limit);
}

/**
 * 복사 기능용: student_name, last_active 만 필요할 때
 */
export async function fetchStudentStatusNamesForTeacher(teacherId) {
  const studentNames = await fetchStudentNamesForTeacher(teacherId);
  if (studentNames.length === 0) {
    return { data: [], error: null };
  }
  return supabase.from('student_status').select('student_name, last_active').in('student_name', studentNames);
}

/**
 * 루틴 마지막 활동 시각 → 표시 문구 (KST 달력 기준)
 * - 오늘 / 어제 / N일 전(N≥2 빨간 표시용)
 * - 없음: 시작 안 함
 */
export function routineLastStudyParts(iso) {
  if (iso == null || iso === '') {
    return { text: '시작 안 함', urgent: false, muted: true };
  }
  const s = String(iso).trim();
  let d;
  if (/Z|[+-]\d{2}:?\d{2}$/.test(s)) {
    d = new Date(s);
  } else {
    const t = s.replace(/\s+/, 'T');
    const withT = t.includes('T') ? t : `${t}T00:00:00`;
    d = new Date(`${withT}+09:00`);
  }
  if (Number.isNaN(d.getTime())) {
    return { text: '시작 안 함', urgent: false, muted: true };
  }
  const actYmd = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const todayYmd = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const tAct = Date.parse(`${actYmd}T12:00:00+09:00`);
  const tToday = Date.parse(`${todayYmd}T12:00:00+09:00`);
  const diffDays = Math.round((tToday - tAct) / 86400000);
  if (diffDays <= 0) return { text: '오늘', urgent: false, muted: false };
  if (diffDays === 1) return { text: '어제', urgent: false, muted: false };
  return { text: `${diffDays}일 전`, urgent: true, muted: false };
}

function pickRoutine(r) {
  const raw = r?.routine;
  const one = Array.isArray(raw) ? raw[0] : raw;
  const sn = one?.set_name != null ? String(one.set_name).trim() : '';
  const tt = one?.title != null ? String(one.title).trim() : '';
  return sn || tt || '루틴';
}

/**
 * useStudentReport / student_status 와 동일하게 로그인 uid 기준 키로 정규화
 * @param {unknown} raw
 */
function normalizeMonitorStudentKey(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, '')
    .trim();
}

/** KST 달력 "오늘"에 해당하는 completed_at(timestamptz) 구간 (UTC ISO) */
function kstTodayRangeUtcIso() {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate();
  const startUtcMs = Date.UTC(y, m, d, 0, 0, 0, 0) - KST_OFFSET_MS;
  const endUtcMs = Date.UTC(y, m, d, 23, 59, 59, 999) - KST_OFFSET_MS;
  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
  };
}

/**
 * 학생별 루틴 요약 (활성 루틴만). 안 B: 대표 1개 + 「외 N개」
 * 카드는 student_status.student_id(= students."User ID" 등)로 조회하므로 students.id(PK)만 쓰면 루틴이 안 잡힘.
 * @returns {Promise<Record<string, { line1: string | null, lastParts: { text: string, urgent: boolean, muted: boolean }, lastActivityAt: string | null }>>}
 */
export async function fetchStudentRoutineSummariesForTeacher(teacherId) {
  const empty = {};
  if (!teacherId) return empty;

  const { data: studentRows, error: stuErr } = await supabase
    .from('students')
    .select('*')
    .eq('teacher_id', teacherId);

  if (stuErr) {
    console.warn('[teacherQueries] students(루틴 매칭) 조회 실패:', stuErr.message);
    return empty;
  }

  /** 카드·student_status 조회 키 (한 명당 하나) — User ID 우선 */
  const displayKeys = new Set();
  /** student_routines.in()용 — uid·PK 양쪽 (레거시 호환) */
  const idQuerySet = new Set();

  for (const row of studentRows || []) {
    const uid = row['User ID'] != null ? normalizeMonitorStudentKey(row['User ID']) : '';
    const uAlt = row.user_id != null ? normalizeMonitorStudentKey(row.user_id) : '';
    const pk = row.id != null ? normalizeMonitorStudentKey(row.id) : '';
    const canonical = uid || uAlt || pk;
    if (canonical) {
      displayKeys.add(canonical);
      idQuerySet.add(canonical);
    }
    if (pk) idQuerySet.add(pk);
  }

  const ids = [...idQuerySet];
  if (ids.length === 0) return empty;

  const selectCols = `
    student_id,
    current_day,
    last_activity_at,
    is_active,
    routine:routines ( title, set_name, total_days )
  `;

  let { data, error } = await supabase
    .from('student_routines')
    .select(selectCols)
    .in('student_id', ids)
    .eq('is_active', true);

  if (error) {
    const msg = error.message || '';
    if (msg.includes('is_active') || msg.includes('column')) {
      const fb = await supabase.from('student_routines').select(selectCols).in('student_id', ids);
      data = fb.data;
      error = fb.error;
    }
  }

  if (error) {
    console.warn('[teacherQueries] student_routines 조회 실패:', error.message);
    return empty;
  }

  const rows = Array.isArray(data) ? data : [];
  /** 정규화된 student_id → 행 목록 */
  const bySid = new Map();
  for (const row of rows) {
    const sid = row.student_id != null ? normalizeMonitorStudentKey(row.student_id) : '';
    if (!sid) continue;
    if (row.is_active === false) continue;
    if (!bySid.has(sid)) bySid.set(sid, []);
    bySid.get(sid).push(row);
  }

  /** canonical(uid) → 해당 월 행의 PK (루틴이 PK에만 묶인 경우 조회) */
  const pkWhenCanonicalIsUid = new Map();
  for (const row of studentRows || []) {
    const uid = row['User ID'] != null ? normalizeMonitorStudentKey(row['User ID']) : '';
    const uAlt = row.user_id != null ? normalizeMonitorStudentKey(row.user_id) : '';
    const pk = row.id != null ? normalizeMonitorStudentKey(row.id) : '';
    const keyU = uid || uAlt;
    if (keyU && pk && keyU !== pk && !pkWhenCanonicalIsUid.has(keyU)) {
      pkWhenCanonicalIsUid.set(keyU, pk);
    }
  }

  /** @type {Record<string, { line1: string | null, lastParts: ReturnType<typeof routineLastStudyParts>, lastActivityAt: string | null }>} */
  const out = {};

  for (const displayKey of displayKeys) {
    let list = bySid.get(displayKey) || [];
    if (list.length === 0) {
      const altPk = pkWhenCanonicalIsUid.get(displayKey);
      if (altPk) list = bySid.get(altPk) || [];
    }

    if (list.length === 0) {
      out[displayKey] = {
        line1: null,
        lastParts: routineLastStudyParts(null),
        lastActivityAt: null,
      };
      continue;
    }

    list.sort((a, b) => {
      const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
      const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
      return tb - ta;
    });

    const rep = list[0];
    const rest = list.length - 1;
    const name = pickRoutine(rep);
    const cd = rep.current_day != null ? Math.max(1, Number(rep.current_day) || 1) : 1;
    const line1 =
      rest > 0 ? `${name} · DAY${cd} 진행중 · 외 ${rest}개` : `${name} · DAY${cd} 진행중`;

    out[displayKey] = {
      line1,
      lastParts: routineLastStudyParts(rep.last_activity_at),
      lastActivityAt: rep.last_activity_at != null ? String(rep.last_activity_at) : null,
    };
  }

  return out;
}

/**
 * general 학원 집중관리존 카드 불빛용: 학생당 활성 루틴 중 `last_activity_at` 최신 1행의
 * `last_completed_date` · `last_activity_at` · 오늘(KST) 루틴 시도 여부
 * (`routine_completions`가 오늘 KST에 찍힌 행이 하나라도 있으면 시도 — completed_at·updated_at·created_at 중 하나로 판단)
 * (student_status.student_id / User ID 키와 동일 규칙으로 맵핑)
 * @returns {Promise<Record<string, { last_completed_date: string | null, last_activity_at: string | null, hasRoutineAttemptToday: boolean } | null>>}
 */
export async function fetchStudentRoutineLightStateForTeacher(teacherId) {
  const empty = {};
  if (!teacherId) return empty;

  const { data: studentRows, error: stuErr } = await supabase
    .from('students')
    .select('*')
    .eq('teacher_id', teacherId);

  if (stuErr) {
    console.warn('[teacherQueries] students(루틴 불빛) 조회 실패:', stuErr.message);
    return empty;
  }

  const displayKeys = new Set();
  const idQuerySet = new Set();

  for (const row of studentRows || []) {
    const uid = row['User ID'] != null ? normalizeMonitorStudentKey(row['User ID']) : '';
    const uAlt = row.user_id != null ? normalizeMonitorStudentKey(row.user_id) : '';
    const pk = row.id != null ? normalizeMonitorStudentKey(row.id) : '';
    const canonical = uid || uAlt || pk;
    if (canonical) {
      displayKeys.add(canonical);
      idQuerySet.add(canonical);
    }
    if (pk) idQuerySet.add(pk);
  }

  const ids = [...idQuerySet];
  if (ids.length === 0) return empty;

  const { startIso, endIso } = kstTodayRangeUtcIso();
  /** 오늘(KST)에 routine_completions 행이 하나라도 관련된 student_id (completed_at 없는 폴백·updated_at만 갱신 포함) */
  const completionTodaySet = new Set();
  const addCompletionStudentIds = (rows) => {
    for (const r of rows || []) {
      const sid = r.student_id != null ? normalizeMonitorStudentKey(r.student_id) : '';
      if (sid) completionTodaySet.add(sid);
    }
  };
  const ignoreMissingColumn = (msg) =>
    /column|does not exist|Could not find/i.test(String(msg || ''));

  let { data: compByCompletedAt, error: errCa } = await supabase
    .from('routine_completions')
    .select('student_id')
    .in('student_id', ids)
    .gte('completed_at', startIso)
    .lte('completed_at', endIso);
  if (errCa) {
    console.warn('[teacherQueries] routine_completions(completed_at 오늘 KST) 조회 실패:', errCa.message);
  } else addCompletionStudentIds(compByCompletedAt);

  let { data: compByUpdatedAt, error: errUa } = await supabase
    .from('routine_completions')
    .select('student_id')
    .in('student_id', ids)
    .gte('updated_at', startIso)
    .lte('updated_at', endIso);
  if (errUa && !ignoreMissingColumn(errUa.message)) {
    console.warn('[teacherQueries] routine_completions(updated_at 오늘 KST) 조회 실패:', errUa.message);
  } else if (!errUa) addCompletionStudentIds(compByUpdatedAt);

  let { data: compByCreatedAt, error: errCr } = await supabase
    .from('routine_completions')
    .select('student_id')
    .in('student_id', ids)
    .gte('created_at', startIso)
    .lte('created_at', endIso);
  if (errCr && !ignoreMissingColumn(errCr.message)) {
    console.warn('[teacherQueries] routine_completions(created_at 오늘 KST) 조회 실패:', errCr.message);
  } else if (!errCr) addCompletionStudentIds(compByCreatedAt);

  const selectCols = `
    student_id,
    last_completed_date,
    last_activity_at,
    is_active
  `;

  let { data, error } = await supabase
    .from('student_routines')
    .select(selectCols)
    .in('student_id', ids)
    .eq('is_active', true);

  if (error) {
    const msg = error.message || '';
    if (msg.includes('is_active') || msg.includes('column')) {
      const fb = await supabase.from('student_routines').select(selectCols).in('student_id', ids);
      data = fb.data;
      error = fb.error;
    }
  }

  if (error) {
    console.warn('[teacherQueries] student_routines(불빛) 조회 실패:', error.message);
    return empty;
  }

  const rows = Array.isArray(data) ? data : [];
  const bySid = new Map();
  for (const row of rows) {
    const sid = row.student_id != null ? normalizeMonitorStudentKey(row.student_id) : '';
    if (!sid) continue;
    if (row.is_active === false) continue;
    if (!bySid.has(sid)) bySid.set(sid, []);
    bySid.get(sid).push(row);
  }

  const pkWhenCanonicalIsUid = new Map();
  for (const row of studentRows || []) {
    const uid = row['User ID'] != null ? normalizeMonitorStudentKey(row['User ID']) : '';
    const uAlt = row.user_id != null ? normalizeMonitorStudentKey(row.user_id) : '';
    const pk = row.id != null ? normalizeMonitorStudentKey(row.id) : '';
    const keyU = uid || uAlt;
    if (keyU && pk && keyU !== pk && !pkWhenCanonicalIsUid.has(keyU)) {
      pkWhenCanonicalIsUid.set(keyU, pk);
    }
  }

  /** @type {Record<string, { last_completed_date: string | null, last_activity_at: string | null, hasRoutineAttemptToday: boolean } | null>} */
  const out = {};

  for (const displayKey of displayKeys) {
    let list = bySid.get(displayKey) || [];
    if (list.length === 0) {
      const altPk = pkWhenCanonicalIsUid.get(displayKey);
      if (altPk) list = bySid.get(altPk) || [];
    }

    if (list.length === 0) {
      out[displayKey] = null;
      continue;
    }

    list.sort((a, b) => {
      const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
      const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
      return tb - ta;
    });

    const rep = list[0];
    const altPkForComp = pkWhenCanonicalIsUid.get(displayKey);
    const hasRoutineAttemptToday =
      completionTodaySet.has(displayKey) || (altPkForComp ? completionTodaySet.has(altPkForComp) : false);
    out[displayKey] = {
      last_completed_date: rep.last_completed_date != null ? String(rep.last_completed_date) : null,
      last_activity_at: rep.last_activity_at != null ? String(rep.last_activity_at) : null,
      hasRoutineAttemptToday,
    };
  }

  return out;
}
