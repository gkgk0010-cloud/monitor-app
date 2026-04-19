import { supabase } from '@/utils/supabaseClient';
import { DEFAULT_ACADEMY_ID } from '@/utils/defaults';

/** @typedef {'toeic' | 'general'} TeachingType */

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ACADEMY_CODE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** academies.code — ac- 접두 + 랜덤 (충돌 시 재시도) */
export function generateAcademySlugCode() {
  let s = 'ac-';
  for (let i = 0; i < 12; i += 1) {
    s += ACADEMY_CODE_CHARS[Math.floor(Math.random() * ACADEMY_CODE_CHARS.length)];
  }
  return s;
}

/**
 * academies 행 1건 생성 (name, code, auth_mode). created_at 은 DB 기본값.
 * @param {string} displayName 학원명
 * @param {unknown} [teachingTypeRaw] `toeic` → auth_mode code_gated, 그 외 → open_access
 * @returns {Promise<{ ok: boolean, academyId?: string, error?: Error }>}
 */
export async function insertAcademyRowForName(displayName, teachingTypeRaw) {
  const name = String(displayName || '').trim();
  if (!name) {
    return { ok: false, error: new Error('학원명이 비어 있습니다.') };
  }
  const auth_mode = authModeForTeachingType(teachingTypeRaw);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateAcademySlugCode();
    const { data, error } = await supabase
      .from('academies')
      .insert({
        name,
        code,
        auth_mode,
      })
      .select('id')
      .single();
    if (!error && data?.id) {
      return { ok: true, academyId: data.id };
    }
    const msg = String(error?.message || '');
    const dup = msg.includes('duplicate') || msg.includes('unique') || error?.code === '23505';
    if (!dup) {
      console.warn('[teacherSignup] academies insert:', msg);
      return { ok: false, error: error || new Error('학원 등록에 실패했습니다.') };
    }
  }
  return { ok: false, error: new Error('학원 코드 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.') };
}

/** DB teachers.code — 기존 행과 같이 teacher- 접두 + 고유 접미사 */
export function generateTeacherCode() {
  let s = 'teacher-';
  for (let i = 0; i < 8; i += 1) {
    s += CODE_SUFFIX_CHARS[Math.floor(Math.random() * CODE_SUFFIX_CHARS.length)];
  }
  return s;
}

/** 8자 초대 코드 (충돌 시 재시도) */
export function generateInviteCode() {
  let s = '';
  for (let i = 0; i < 8; i += 1) {
    s += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  }
  return s;
}

/**
 * 학생 앱 메뉴(JSON) — `MenuSettingsSection`·DB 기본값과 키를 맞춤 (`result` = 나의 성과).
 * @param {TeachingType} teachingType
 * @returns {Record<string, boolean>}
 */
export function visibleMenusForTeachingType(teachingType) {
  if (teachingType === 'toeic') {
    return {
      vocab: true,
      quiz: true,
      result: true,
      homework: true,
      absence: true,
      jokbo: true,
    };
  }
  return {
    vocab: true,
    quiz: false,
    result: false,
    homework: false,
    absence: false,
    jokbo: false,
  };
}

/**
 * @param {unknown} raw
 * @returns {TeachingType}
 */
export function normalizeTeachingType(raw) {
  if (raw === 'toeic' || raw === 'general') return raw;
  return 'general';
}

/** 토익 위주 → 초대 코드 게이트, 일반 어학원 → 공개 */
export function authModeForTeachingType(teachingType) {
  return normalizeTeachingType(teachingType) === 'toeic' ? 'code_gated' : 'open_access';
}

/**
 * 로그인 세션 기준으로 teachers 행이 없으면 생성 (회원가입 직후·이메일 인증 후 첫 로그인)
 * @returns {Promise<{ ok: boolean, created?: boolean, error?: Error }>}
 */
/**
 * @param {import('@supabase/supabase-js').Session} session
 * @param {{ academy_name?: string, teaching_type?: string }} [extra] 신규 insert 시에만 반영 (기존 행은 갱신하지 않음)
 * extra.academy_name 과 user_metadata.academy_name 중 비어 있지 않은 값으로 academies + teachers 연동
 */
export async function ensureTeacherRowForSession(session, extra = {}) {
  if (!session?.user?.email) {
    return { ok: false, error: new Error('이메일 정보가 없습니다.') };
  }
  const email = String(session.user.email).trim();
  if (!email) return { ok: false, error: new Error('이메일 정보가 없습니다.') };

  const { data: existing, error: selErr } = await supabase
    .from('teachers')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (selErr) {
    console.warn('[teacherSignup] teachers 조회:', selErr.message);
    return { ok: false, error: selErr };
  }
  if (existing?.id) {
    return { ok: true, created: false, teacherId: existing.id };
  }

  const meta = session.user.user_metadata || {};
  const name =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    email.split('@')[0];

  const teachingType = normalizeTeachingType(
    typeof extra.teaching_type === 'string' ? extra.teaching_type : meta.teaching_type,
  );

  const extraAcademy = typeof extra.academy_name === 'string' ? extra.academy_name.trim() : '';
  const metaAcademy = typeof meta.academy_name === 'string' ? meta.academy_name.trim() : '';
  const academyNameFinal = extraAcademy || metaAcademy;

  const basePayload = {
    email,
    name,
    teaching_type: teachingType,
    visible_menus: visibleMenusForTeachingType(teachingType),
  };

  if (academyNameFinal) {
    const ac = await insertAcademyRowForName(academyNameFinal, teachingType);
    if (!ac.ok) {
      return { ok: false, error: ac.error || new Error('학원 정보를 만들지 못했습니다.') };
    }
    basePayload.academy_id = ac.academyId;
    basePayload.academy_name = academyNameFinal;
  } else if (DEFAULT_ACADEMY_ID) {
    basePayload.academy_id = DEFAULT_ACADEMY_ID;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const payload = {
      ...basePayload,
      code: generateTeacherCode(),
      invite_code: generateInviteCode(),
    };
    const { data: inserted, error: insErr } = await supabase.from('teachers').insert(payload).select('id').single();
    if (!insErr) {
      return { ok: true, created: true, teacherId: inserted?.id };
    }
    const msg = insErr.message || '';
    const duplicate = msg.includes('duplicate') || msg.includes('unique') || insErr.code === '23505';
    if (!duplicate) {
      console.warn('[teacherSignup] teachers insert:', msg);
      return { ok: false, error: insErr };
    }
  }

  return { ok: false, error: new Error('선생님 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.') };
}
