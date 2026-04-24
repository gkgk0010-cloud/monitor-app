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

/** word | sentence_writing | sentence_speaking (구 image·sentence 는 normalizeSetType 로 정규화) */
/** B-2: 세트 타입별 기본 모드(암기=flashcard) */
export const DEFAULT_MODES_BY_TYPE = {
  word: ['flashcard', 'recall', 'matching', 'test'],
  sentence_writing: ['reading', 'test'],
  sentence_speaking: ['reading', 'shadowing'],
}

/** DB·구버전 값 → word | sentence_writing | sentence_speaking */
export function normalizeSetType(t) {
  const s = String(t || 'word').trim()
  if (s === 'image') return 'word'
  if (s === 'sentence') return 'sentence_writing'
  if (s === 'sentence_writing' || s === 'sentence_speaking') return s
  return 'word'
}

/** 세트 타입별 기본 체크 — 루틴 추천과 동일하게 해당 키 전부 필수(true) */
export function defaultRequiredForBaseKeys(setType) {
  const st = normalizeSetType(setType)
  const o = {}
  for (const k of ALL_MODE_KEYS) o[k] = false
  const base = DEFAULT_MODES_BY_TYPE[st] || DEFAULT_MODES_BY_TYPE.word
  for (const k of base) {
    o[k] = true
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
  const st = normalizeSetType(setType)
  return DEFAULT_MODES_BY_TYPE[st] || DEFAULT_MODES_BY_TYPE.word
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

/** DB/이전 버그로 깨진 값 정리 → 배열 또는 null */
export function normalizeRawAvailableModes(raw) {
  if (raw == null) return null
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (t === '' || t === '[object Object]') return null
    try {
      const p = JSON.parse(t)
      return Array.isArray(p) ? p : null
    } catch {
      return null
    }
  }
  if (typeof raw === 'object') {
    if (raw.mode != null) return [raw]
    return null
  }
  return null
}

/**
 * word_sets.available_modes 저장용 — 순수 JSON 직렬화 가능한 plain object 배열만 반환.
 * @returns {object[]}
 */
export function buildModesDataForWordSetSave(modes, requiredByMode, passScore, maxAttempts) {
  const selectedKeys = ALL_MODE_KEYS.filter((k) => modes[k])
  const modesData = selectedKeys.map((modeName) => ({
    mode: modeName,
    required: !!requiredByMode[modeName],
    ...(modeName === 'test'
      ? {
          pass_score: Math.min(100, Math.max(0, Math.round(Number(passScore) || 80))),
          max_attempts: Math.max(1, Math.round(Number(maxAttempts) || 3)),
        }
      : {}),
  }))
  return JSON.parse(JSON.stringify(modesData))
}

/** 사이드바 등 한 줄 요약: 암기·리콜·매칭·테스트 */
export function formatAvailableModesSummary(am, setType) {
  const parsed = parseAvailableModes(am, setType)
  const labels = []
  for (const k of ALL_MODE_KEYS) {
    if (parsed.modes[k]) labels.push(MODE_LABELS[k] || k)
  }
  if (labels.length === 0) return '—'
  return labels.join('·')
}

/**
 * @returns {{ modes: Record<string, boolean>, requiredByMode: Record<string, boolean>, passScore: number, maxAttempts: number }}
 */
export function parseAvailableModes(am, setType) {
  const amNorm = normalizeRawAvailableModes(am)
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

  if (!Array.isArray(amNorm) || amNorm.length === 0) {
    for (const k of base) {
      modes[k] = true
      requiredByMode[k] = !!defReq[k]
    }
    return { modes, requiredByMode, passScore, maxAttempts }
  }

  for (const item of amNorm) {
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
  return buildModesDataForWordSetSave(modes, requiredByMode, passScore, maxAttempts)
}

/** 새 세트 STEP2 / 세트 타입 변경 시 초기 상태 */
export function initModesStateForType(setType) {
  const st = normalizeSetType(setType)
  const keys = DEFAULT_MODES_BY_TYPE[st] || DEFAULT_MODES_BY_TYPE.word
  const modes = modesRecordFromKeys(keys)
  const def = defaultRequiredForBaseKeys(setType)
  const requiredByMode = {}
  for (const k of ALL_MODE_KEYS) {
    requiredByMode[k] = modes[k] ? !!def[k] : false
  }
  return { modes, requiredByMode, passScore: 80, maxAttempts: 3 }
}
