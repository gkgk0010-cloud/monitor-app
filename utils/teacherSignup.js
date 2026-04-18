import { supabase } from '@/utils/supabaseClient';
import { DEFAULT_ACADEMY_ID } from '@/utils/defaults';

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

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
 * 로그인 세션 기준으로 teachers 행이 없으면 생성 (회원가입 직후·이메일 인증 후 첫 로그인)
 * @returns {Promise<{ ok: boolean, created?: boolean, error?: Error }>}
 */
/**
 * @param {import('@supabase/supabase-js').Session} session
 * @param {{ academy_name?: string }} [extra] 신규 insert 시에만 반영 (기존 행은 갱신하지 않음)
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

  const basePayload = {
    email,
    name,
  };
  const an = typeof extra.academy_name === 'string' ? extra.academy_name.trim() : '';
  if (an) {
    basePayload.academy_name = an;
  }
  if (DEFAULT_ACADEMY_ID) {
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
