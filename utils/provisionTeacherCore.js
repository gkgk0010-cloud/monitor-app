/**
 * 선생님 회원가입 프로비저닝 — service role 전용 (RLS 우회).
 * monitor-app/app/api/teacher/* 에서만 import.
 */
import { DEFAULT_ACADEMY_ID } from '@/utils/defaults';
import {
  authModeForTeachingType,
  generateAcademySlugCode,
  generateInviteCode,
  generateTeacherCode,
  normalizeTeachingType,
  visibleMenusForTeachingType,
} from '@/utils/teacherSignupShared';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} displayName
 * @param {unknown} teachingTypeRaw
 */
export async function insertAcademyRowAdmin(admin, displayName, teachingTypeRaw) {
  const name = String(displayName || '').trim();
  if (!name) {
    return { ok: false, error: '학원명이 비어 있습니다.' };
  }
  const auth_mode = authModeForTeachingType(teachingTypeRaw);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateAcademySlugCode();
    const { data, error } = await admin
      .from('academies')
      .insert({ name, code, auth_mode })
      .select('id')
      .single();
    if (!error && data?.id) {
      return { ok: true, academyId: data.id };
    }
    const msg = String(error?.message || '');
    const dup = msg.includes('duplicate') || msg.includes('unique') || error?.code === '23505';
    if (!dup) {
      console.warn('[provisionTeacherCore] academies insert:', msg);
      return { ok: false, error: msg || '학원 등록에 실패했습니다.' };
    }
  }
  return { ok: false, error: '학원 코드 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {import('@supabase/supabase-js').User} user
 * @param {{ academy_name?: string, teaching_type?: string }} [extra]
 */
export async function provisionTeacherForAuthUser(admin, user, extra = {}) {
  const email = String(user.email || '').trim();
  if (!email) {
    return { ok: false, error: '이메일 정보가 없습니다.' };
  }

  const { data: existing, error: selErr } = await admin
    .from('teachers')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (selErr) {
    console.warn('[provisionTeacherCore] teachers select:', selErr.message);
    return { ok: false, error: selErr.message || '선생님 정보 조회에 실패했습니다.' };
  }
  if (existing?.id) {
    return { ok: true, created: false, teacherId: existing.id };
  }

  const meta = user.user_metadata || {};
  const name =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    email.split('@')[0];

  const teachingType = normalizeTeachingType(
    typeof extra.teaching_type === 'string' ? extra.teaching_type : meta.teaching_type,
  );

  const extraAcademy = typeof extra.academy_name === 'string' ? extra.academy_name.trim() : '';
  const metaAcademy = typeof meta.academy_name === 'string' ? meta.academy_name.trim() : '';
  let academyNameFinal = extraAcademy || metaAcademy;

  const basePayload = {
    email,
    name,
    teaching_type: teachingType,
    visible_menus: visibleMenusForTeachingType(teachingType),
  };

  if (academyNameFinal) {
    const ac = await insertAcademyRowAdmin(admin, academyNameFinal, teachingType);
    if (!ac.ok) {
      return { ok: false, error: ac.error || '학원 정보를 만들지 못했습니다.' };
    }
    basePayload.academy_id = ac.academyId;
    basePayload.academy_name = academyNameFinal;
  } else if (DEFAULT_ACADEMY_ID) {
    basePayload.academy_id = DEFAULT_ACADEMY_ID;
  } else {
    academyNameFinal = `${name} 학원`;
    const ac = await insertAcademyRowAdmin(admin, academyNameFinal, teachingType);
    if (!ac.ok) {
      return { ok: false, error: ac.error || '기본 학원을 만들지 못했습니다.' };
    }
    basePayload.academy_id = ac.academyId;
    basePayload.academy_name = academyNameFinal;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const payload = {
      ...basePayload,
      code: generateTeacherCode(),
      invite_code: generateInviteCode(),
    };
    const { data: inserted, error: insErr } = await admin
      .from('teachers')
      .insert(payload)
      .select('id')
      .single();
    if (!insErr && inserted?.id) {
      return { ok: true, created: true, teacherId: inserted.id };
    }
    const msg = insErr?.message || '';
    const duplicate = msg.includes('duplicate') || msg.includes('unique') || insErr?.code === '23505';
    if (!duplicate) {
      console.warn('[provisionTeacherCore] teachers insert:', msg);
      return { ok: false, error: msg || '선생님 등록에 실패했습니다.' };
    }
  }

  return { ok: false, error: '선생님 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
}
