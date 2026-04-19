/**
 * teachers.name 표시용 — DB 원본은 그대로 두고 화면에만 " 선생님" 접미사.
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function formatTeacherName(name) {
  const s = name != null ? String(name).trim() : '';
  if (!s) return '';
  return `${s} 선생님`;
}
