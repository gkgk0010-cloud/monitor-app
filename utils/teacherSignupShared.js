/** teacherSignup(클라) · provisionTeacherCore(서버) 공통 — DB insert 없음 */

/** @typedef {'toeic' | 'general'} TeachingType */

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ACADEMY_CODE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateAcademySlugCode() {
  let s = 'ac-';
  for (let i = 0; i < 12; i += 1) {
    s += ACADEMY_CODE_CHARS[Math.floor(Math.random() * ACADEMY_CODE_CHARS.length)];
  }
  return s;
}

export function generateTeacherCode() {
  let s = 'teacher-';
  for (let i = 0; i < 8; i += 1) {
    s += CODE_SUFFIX_CHARS[Math.floor(Math.random() * CODE_SUFFIX_CHARS.length)];
  }
  return s;
}

export function generateInviteCode() {
  let s = '';
  for (let i = 0; i < 8; i += 1) {
    s += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  }
  return s;
}

/** @param {TeachingType} teachingType */
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

/** @param {unknown} raw @returns {TeachingType} */
export function normalizeTeachingType(raw) {
  if (raw === 'toeic' || raw === 'general') return raw;
  return 'general';
}

export function authModeForTeachingType(teachingType) {
  return normalizeTeachingType(teachingType) === 'toeic' ? 'code_gated' : 'open_access';
}
