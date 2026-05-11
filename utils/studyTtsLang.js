/** 학생앱 `studyTtsLang.ts` 와 동일 값 — word_sets.default_lang 저장용 */

export const STUDY_TTS_LANGS = /** @type {const} */ ([
  'en-US',
  'ko-KR',
  'ja-JP',
  'zh-CN',
  'es-ES',
  'vi-VN',
  'de-DE',
])

/** @typedef {(typeof STUDY_TTS_LANGS)[number]} StudyTtsLang */

/**
 * @param {unknown} raw
 * @returns {StudyTtsLang | null}
 */
export function normalizeStudyTtsLang(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(/_/g, '-')
  if (!s) return null
  const lowered = s.toLowerCase()
  for (const L of STUDY_TTS_LANGS) {
    if (L.toLowerCase() === lowered) return L
  }
  return null
}

/**
 * 세트 저장값 → TTS 언어 (미지정·불법 → en-US)
 * @param {unknown} raw
 * @returns {StudyTtsLang}
 */
export function resolveWordSetTtsLang(raw) {
  return normalizeStudyTtsLang(raw) ?? 'en-US'
}
