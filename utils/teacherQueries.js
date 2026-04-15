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
 * student_status는 teacher_id가 없을 수 있어, students 로 걸러진 id 로만 조회
 * @param {string} teacherId
 * @returns {Promise<{ data: object[] | null, error: Error | null }>}
 */
export async function fetchStudentStatusForTeacher(teacherId) {
  const ids = await fetchStudentIdsForTeacher(teacherId);
  if (ids.length === 0) {
    return { data: [], error: null };
  }
  return supabase.from('student_status').select('*').in('student_id', ids);
}

/**
 * status_logs — student_id 로 선생님 소속 학생만
 * @param {string} teacherId
 * @param {number} limit
 */
export async function fetchStatusLogsForTeacher(teacherId, limit) {
  const ids = await fetchStudentIdsForTeacher(teacherId);
  if (ids.length === 0) {
    return { data: [], error: null };
  }
  return supabase
    .from('status_logs')
    .select('id, student_name, event_type, message, created_at')
    .in('student_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit);
}

/**
 * 복사 기능용: student_name, last_active 만 필요할 때
 */
export async function fetchStudentStatusNamesForTeacher(teacherId) {
  const ids = await fetchStudentIdsForTeacher(teacherId);
  if (ids.length === 0) {
    return { data: [], error: null };
  }
  return supabase.from('student_status').select('student_name, last_active').in('student_id', ids);
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
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { text: '시작 안 함', urgent: false, muted: true };
  }
  const actYmd = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const todayYmd = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const tAct = Date.parse(`${actYmd}T12:00:00`);
  const tToday = Date.parse(`${todayYmd}T12:00:00`);
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
 * 학생별 루틴 요약 (활성 루틴만). 안 B: 대표 1개 + 「외 N개」
 * @returns {Promise<Record<string, { line1: string | null, lastParts: { text: string, urgent: boolean, muted: boolean } }>>}
 */
export async function fetchStudentRoutineSummariesForTeacher(teacherId) {
  const empty = {};
  if (!teacherId) return empty;

  const ids = await fetchStudentIdsForTeacher(teacherId);
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
  const bySid = new Map();
  for (const row of rows) {
    const sid = row.student_id != null ? String(row.student_id) : '';
    if (!sid) continue;
    if (row.is_active === false) continue;
    if (!bySid.has(sid)) bySid.set(sid, []);
    bySid.get(sid).push(row);
  }

  /** @type {Record<string, { line1: string | null, lastParts: ReturnType<typeof routineLastStudyParts> }>} */
  const out = {};

  for (const sid of ids) {
    const list = bySid.get(sid) || [];
    if (list.length === 0) {
      out[sid] = {
        line1: null,
        lastParts: routineLastStudyParts(null),
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

    out[sid] = {
      line1,
      lastParts: routineLastStudyParts(rep.last_activity_at),
    };
  }

  return out;
}
