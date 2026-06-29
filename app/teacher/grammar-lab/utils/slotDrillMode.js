/** 독해해석 끊어읽기 — reading_interpret_sets.awkward_guide 매직스트링 (한 줄 해석 + 박스별 입력 공통) */
export const READING_BREAK_MAGIC = '[끊어읽기모드]'

/** @deprecated 내부 호환 — READING_BREAK_MAGIC 와 동일 */
export const SLOT_DRILL_MAGIC = READING_BREAK_MAGIC

const LEGACY_SLOT_MAGIC = '[칸나누기모드]'

const DEFAULT_BREAK_GUIDE_SUFFIX =
  " 영어 어순 무시하고 한 문장으로 합치기 / 의문사 덩어리를 명사화 안 하고 '누가 ~했나요?'로 풀어쓰기 / 박스 의미단위(누가·무엇을·언제) 누락"

export const ROLE_HINT_SUGGESTIONS = [
  '주절',
  '시점',
  '시간',
  '목적',
  '대상',
  '수혜자',
  '수단',
  '도구',
  '장소',
  '출처',
  '방향',
  '기간',
  '이유',
  '원인',
  '결과',
  '조건',
  '양보',
  '비교',
  '부수상황',
  '동격',
  '추가설명',
]

export function hasReadingBreakMode(awkwardGuide) {
  const s = String(awkwardGuide ?? '')
  return s.includes(READING_BREAK_MAGIC) || s.includes(LEGACY_SLOT_MAGIC)
}

/** @deprecated hasReadingBreakMode 와 동일 */
export function hasSlotDrillMode(awkwardGuide) {
  return hasReadingBreakMode(awkwardGuide)
}

export function enableReadingBreakGuide(current) {
  let s = String(current ?? '')
    .trim()
    .split(LEGACY_SLOT_MAGIC)
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (hasReadingBreakMode(s)) return s
  return s ? `${READING_BREAK_MAGIC} ${s}` : `${READING_BREAK_MAGIC}${DEFAULT_BREAK_GUIDE_SUFFIX}`
}

/** @deprecated enableReadingBreakGuide 와 동일 */
export function enableSlotDrillGuide(current) {
  return enableReadingBreakGuide(current)
}

export function disableReadingBreakGuide(current) {
  const next = String(current ?? '')
    .split(READING_BREAK_MAGIC)
    .join('')
    .split(LEGACY_SLOT_MAGIC)
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return next || null
}

/** @deprecated disableReadingBreakGuide 와 동일 */
export function disableSlotDrillGuide(current) {
  return disableReadingBreakGuide(current)
}
