/**
 * 학습 모드 JSON (word_sets.available_modes) 빌드·파싱
 * 형식: [{ mode, required }, { mode: 'test', required, pass_score, max_attempts }, ...]
 */

export const ALL_MODE_KEYS = [
  'flashcard',
  'recall',
  'matching',
  'writing',
  'reading',
  'readAloud',
  'shadowing',
  'listening',
  'scramble',
  'dictation',
  'composition',
  'image',
  'test',
]

export const MODE_LABELS = {
  flashcard: '암기',
  recall: '리콜',
  matching: '매칭',
  writing: '라이팅',
  reading: '직독직해',
  readAloud: '낭독',
  shadowing: '쉐도잉',
  listening: '집중듣기',
  scramble: '스크램블',
  dictation: '딕테이션',
  composition: '입영작',
  image: '이미지',
  test: '테스트',
}

export const DEFAULT_MODES_BY_TYPE = {
  word: ['flashcard', 'recall', 'matching', 'writing', 'test'],
  sentence: ['reading', 'readAloud', 'shadowing', 'scramble', 'test'],
  image: ['image', 'flashcard', 'recall', 'matching', 'test'],
}

/** 세트 타입별 기본 체크 + 필수 여부(자동 추천 라인) */
export function defaultRequiredForBaseKeys(setType) {
  const st = setType === 'sentence' || setType === 'image' ? setType : 'word'
  const o = {}
  for (const k of ALL_MODE_KEYS) o[k] = false
  if (st === 'word') {
    o.flashcard = true
    o.recall = true
    o.matching = false
    o.writing = false
    o.test = false
  } else if (st === 'sentence') {
    o.reading = true
    o.readAloud = true
    o.shadowing = false
    o.scramble = false
    o.test = false
  } else {
    o.image = true
    o.flashcard = true
    o.recall = true
    o.matching = false
    o.test = false
  }
  return o
}

export function modesRecordFromKeys(selectedKeys) {
  const set = new Set(selectedKeys || [])
  const o = {}
  for (const k of ALL_MODE_KEYS) {
    o[k] = set.has(k)
  }
  return o
}

export function baseKeysForType(setType) {
  return DEFAULT_MODES_BY_TYPE[setType] || DEFAULT_MODES_BY_TYPE.word
}

export function extraKeysForType(setType) {
  const base = new Set(baseKeysForType(setType))
  return ALL_MODE_KEYS.filter((k) => !base.has(k))
}

/**
 * 세트에 켜진 학습 모드를 필수/선택 목록으로 분리 (루틴 태스크 UI·생성용, ALL_MODE_KEYS 순)
 * @param {{ modes: Record<string, boolean>, requiredByMode: Record<string, boolean> }} parsed parseAvailableModes 결과
 * @returns {{ requiredKeys: string[], optionalKeys: string[] }}
 */
export function splitModesForRoutine(parsed) {
  const requiredKeys = []
  const optionalKeys = []
  for (const k of ALL_MODE_KEYS) {
    if (!parsed.modes[k]) continue
    if (parsed.requiredByMode[k]) requiredKeys.push(k)
    else optionalKeys.push(k)
  }
  return { requiredKeys, optionalKeys }
}

/**
 * @returns {{ modes: Record<string, boolean>, requiredByMode: Record<string, boolean>, passScore: number, maxAttempts: number }}
 */
export function parseAvailableModes(am, setType) {
  const base = baseKeysForType(setType)
  const defReq = defaultRequiredForBaseKeys(setType)
  const modes = {}
  const requiredByMode = {}
  for (const k of ALL_MODE_KEYS) {
    modes[k] = false
    requiredByMode[k] = false
  }

  let passScore = 80
  let maxAttempts = 3

  if (!Array.isArray(am) || am.length === 0) {
    for (const k of base) {
      modes[k] = true
      requiredByMode[k] = !!defReq[k]
    }
    return { modes, requiredByMode, passScore, maxAttempts }
  }

  for (const item of am) {
    if (typeof item === 'string') {
      const k = String(item).trim()
      if (!ALL_MODE_KEYS.includes(k)) continue
      modes[k] = true
      requiredByMode[k] = defReq[k] ?? false
    } else if (item && typeof item === 'object') {
      const k = String(item.mode || '').trim()
      if (!ALL_MODE_KEYS.includes(k)) continue
      modes[k] = true
      if (typeof item.required === 'boolean') {
        requiredByMode[k] = item.required
      } else {
        requiredByMode[k] = defReq[k] ?? false
      }
      if (k === 'test') {
        if (item.pass_score != null && item.pass_score !== '') {
          const n = Number(item.pass_score)
          if (Number.isFinite(n)) passScore = Math.min(100, Math.max(0, Math.round(n)))
        }
        if (item.max_attempts != null && item.max_attempts !== '') {
          const n = Number(item.max_attempts)
          if (Number.isFinite(n)) maxAttempts = Math.max(1, Math.round(n))
        }
      }
    }
  }

  return { modes, requiredByMode, passScore, maxAttempts }
}

/**
 * @param {Record<string, boolean>} modes
 * @param {Record<string, boolean>} requiredByMode
 */
export function buildAvailableModesJson(modes, requiredByMode, passScore, maxAttempts) {
  const out = []
  for (const k of ALL_MODE_KEYS) {
    if (!modes[k]) continue
    const entry = { mode: k, required: !!requiredByMode[k] }
    if (k === 'test') {
      entry.pass_score = Math.min(100, Math.max(0, Math.round(Number(passScore) || 80)))
      entry.max_attempts = Math.max(1, Math.round(Number(maxAttempts) || 3))
    }
    out.push(entry)
  }
  return out
}

/** 새 세트 STEP2 / 세트 타입 변경 시 초기 상태 */
export function initModesStateForType(setType) {
  const keys = DEFAULT_MODES_BY_TYPE[setType] || DEFAULT_MODES_BY_TYPE.word
  const modes = modesRecordFromKeys(keys)
  const def = defaultRequiredForBaseKeys(setType)
  const requiredByMode = {}
  for (const k of ALL_MODE_KEYS) {
    requiredByMode[k] = modes[k] ? !!def[k] : false
  }
  return { modes, requiredByMode, passScore: 80, maxAttempts: 3 }
}
