/** vocab-app `kakaoShareMessages.ts` 와 동일 포맷 (monitor-app 분리 빌드용) */
export const TOKPASS_PUBLIC_LANDING_ORIGIN = 'https://tokpass.co.kr'

/**
 * @param {{ name?: string | null, academy_name?: string | null } | null | undefined} teacher
 * @returns {string}
 */
export function getTeacherInviteDisplayName(teacher) {
  const n = teacher?.name != null ? String(teacher.name).trim() : ''
  if (n) return n
  const a = teacher?.academy_name != null ? String(teacher.academy_name).trim() : ''
  if (a) return a
  return '선생님'
}

/**
 * @param {string} teacherDisplayName
 * @param {string} inviteCode
 * @returns {string}
 */
export function buildKakaoTeacherInviteShareMessage(teacherDisplayName, inviteCode) {
  const code = inviteCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  const q = encodeURIComponent(code)
  const link = `${TOKPASS_PUBLIC_LANDING_ORIGIN}/invite?teacher=${q}`
  const label = teacherDisplayName != null ? String(teacherDisplayName).trim() || '선생님' : '선생님'
  return (
    `📚 똑패스 학습 초대!\n` +
    `${label}이 너를 초대했어\n` +
    `초대 코드: ${code}\n\n` +
    `👉 가입: ${link}`
  )
}
