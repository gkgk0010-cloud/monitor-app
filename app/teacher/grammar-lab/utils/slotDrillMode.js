/** 칸 나누기 모드 매직스트링 (reading_interpret [끊어읽기모드] 패턴과 동일) */
export const SLOT_DRILL_MAGIC = '[칸나누기모드]'

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

export function hasSlotDrillMode(awkwardGuide) {
  return String(awkwardGuide ?? '').includes(SLOT_DRILL_MAGIC)
}

export function enableSlotDrillGuide(current) {
  const s = String(current ?? '').trim()
  if (hasSlotDrillMode(s)) return s
  return s ? `${s} ${SLOT_DRILL_MAGIC}` : SLOT_DRILL_MAGIC
}

export function disableSlotDrillGuide(current) {
  const next = String(current ?? '')
    .split(SLOT_DRILL_MAGIC)
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return next || null
}
