import { supabase } from '@/utils/supabaseClient';
import { normalizeTeachingType } from '@/utils/teacherSignupShared';

export {
  generateAcademySlugCode,
  generateTeacherCode,
  generateInviteCode,
  visibleMenusForTeachingType,
  normalizeTeachingType,
  authModeForTeachingType,
} from '@/utils/teacherSignupShared';

/**
 * 학원 행 생성 — 서버 API 경유 (RLS 우회). 설정 화면 등에서 사용.
 * @param {string} displayName
 * @param {unknown} [teachingTypeRaw]
 * @returns {Promise<{ ok: boolean, academyId?: string, error?: Error }>}
 */
export async function insertAcademyRowForName(displayName, teachingTypeRaw) {
  const name = String(displayName || '').trim();
  if (!name) {
    return { ok: false, error: new Error('학원명이 비어 있습니다.') };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: new Error('로그인 세션이 없습니다. 다시 로그인해 주세요.') };
  }

  let res;
  try {
    res = await fetch('/api/teacher/academy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name,
        teaching_type: normalizeTeachingType(teachingTypeRaw),
      }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error('학원 등록 요청에 실패했습니다.') };
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const msg = body.error || '학원 등록에 실패했습니다.';
    return { ok: false, error: new Error(msg) };
  }
  return { ok: true, academyId: body.academyId };
}

/**
 * 로그인 세션 기준 teachers 행 보장 — 서버 service role API.
 * @param {import('@supabase/supabase-js').Session} session
 * @param {{ academy_name?: string, teaching_type?: string }} [extra]
 * @returns {Promise<{ ok: boolean, created?: boolean, teacherId?: string, error?: Error }>}
 */
export async function ensureTeacherRowForSession(session, extra = {}) {
  if (!session?.user?.email) {
    return { ok: false, error: new Error('이메일 정보가 없습니다.') };
  }
  if (!session.access_token) {
    return { ok: false, error: new Error('로그인 세션이 유효하지 않습니다. 다시 로그인해 주세요.') };
  }

  let res;
  try {
    res = await fetch('/api/teacher/provision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        academy_name: extra.academy_name,
        teaching_type: extra.teaching_type,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err : new Error('선생님 등록 요청에 실패했습니다.'),
    };
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const msg =
      body.error ||
      (res.status === 500 && !body.error
        ? '서버 설정(SUPABASE_SERVICE_ROLE_KEY)을 확인해 주세요.'
        : '선생님 정보 등록에 실패했습니다.');
    console.warn('[teacherSignup] provision failed', { status: res.status, error: msg });
    return { ok: false, error: new Error(msg) };
  }

  return {
    ok: true,
    created: !!body.created,
    teacherId: body.teacherId,
  };
}
