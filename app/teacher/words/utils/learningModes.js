/**
 * 학습 모드 JSON (word_sets.available_modes) 빌드·파싱
 * 형식: [{ mode, required }, { mode: 'test', required, pass_score, max_attempts }, ...]
 */

export const ALL_MODE_KEYS = [
  'flashcard',
  'recall',
  'mypick',
  'writing',
  'reading',
  'readAloud',
  'shadowing',
  'listening',
  'dictation',
  'composition',
  'image',
  'wrong_note',
  'test',
  'scramble',
  'matching',
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
  mypick: '⭐ 마이픽',
  wrong_note: '오답노트',
  test: '테스트',
}

/** 사용자 안내용 (마이픽 등) */
export const MODE_DESCRIPTIONS = {
  mypick: '별표한 단어·문장만 학습합니다.',
  wrong_note: '오늘 복습할 오답 단어만 풀어요. Day 학습 독에서도 사용할 수 있어요.',
}

/** word | sentence_writing | sentence_speaking | kids (구 image·sentence 는 normalizeSetType 로 정규화) */
/** 세트 타입별 기본(추천) 필수 후보 모드 — create·루틴 추천과 동일 소스 */
export const DEFAULT_MODES_BY_TYPE = {
  word: ['flashcard', 'recall', 'mypick', 'test', 'matching'],
  sentence_writing: ['reading', 'dictation', 'writing', 'mypick', 'scramble'],
  sentence_speaking: ['dictation', 'listening', 'shadowing', 'mypick', 'scramble'],
  kids: ['flashcard', 'image', 'listening', 'readAloud', 'writing', 'matching', 'test'],
}

/** 키즈 세트 독·DB 저장 순서 (학생 앱 좌→우) */
export const KIDS_MODE_ORDER = DEFAULT_MODES_BY_TYPE.kids

const HEAD_CANON_ORDER = ['flashcard', 'recall', 'mypick']

function canonLearningModeKey(raw) {
  const k = String(raw || '')
    .trim()
    .toLowerCase()
  if (!k) return ''
  if (k === 'memorize') return 'flashcard'
  if (k === 'quiz' || k === 'vocabtest') return 'test'
  if (k === 'readaloud' || k === 'read_aloud') return 'readaloud'
  if (k === 'wrongnote') return 'wrong_note'
  return k
}

function headRank(canon) {
  const i = HEAD_CANON_ORDER.indexOf(canon)
  return i >= 0 ? i : 99
}

function tailBucket(canon) {
  if (canon === 'flashcard' || canon === 'recall' || canon === 'mypick') return 'head'
  if (canon === 'test') return 'test'
  if (canon === 'scramble') return 'scramble'
  if (canon === 'matching') return 'matching'
  return 'mid'
}

/** DB 저장·표시 공통: 암기→리콜→마이픽 → 중간 → 테스트·스크램블 → 매칭 */
export function sortLearningModeDbKeys(keys) {
  const seen = new Set()
  const unique = []
  for (const k of keys || []) {
    const t = String(k || '').trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    unique.push(t)
  }
  const head = []
  const mid = []
  const test = []
  const scramble = []
  const matching = []
  for (const k of unique) {
    const bucket = tailBucket(canonLearningModeKey(k))
    if (bucket === 'head') head.push(k)
    else if (bucket === 'test') test.push(k)
    else if (bucket === 'scramble') scramble.push(k)
    else if (bucket === 'matching') matching.push(k)
    else mid.push(k)
  }
  head.sort((a, b) => headRank(canonLearningModeKey(a)) - headRank(canonLearningModeKey(b)))
  mid.sort((a, b) => a.localeCompare(b, 'ko', { sensitivity: 'base' }))
  test.sort((a, b) => a.localeCompare(b, 'ko', { sensitivity: 'base' }))
  scramble.sort((a, b) => a.localeCompare(b, 'ko', { sensitivity: 'base' }))
  matching.sort((a, b) => a.localeCompare(b, 'ko', { sensitivity: 'base' }))
  return [...head, ...mid, ...test, ...scramble, ...matching]
}

/** DB·구버전 값 → word | sentence_writing | sentence_speaking | kids */
export function normalizeSetType(t) {
  const s = String(t || 'word').trim()
  if (s === 'image') return 'word'
  if (s === 'sentence') return 'sentence_writing'
  if (s === 'sentence_writing' || s === 'sentence_speaking' || s === 'kids') return s
  return 'word'
}

/** 세트 타입별 저장·표시 순서 (키즈는 고정 순서, 그 외 sortLearningModeDbKeys) */
export function orderKeysForSetType(setType, keys) {
  const st = normalizeSetType(setType)
  if (st === 'kids') {
    const set = new Set(keys || [])
    return KIDS_MODE_ORDER.filter((k) => set.has(k))
  }
  return sortLearningModeDbKeys(keys)
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
export function buildModesDataForWordSetSave(modes, requiredByMode, _passScore, _maxAttempts, setType = 'word') {
  const enabled = ALL_MODE_KEYS.filter((k) => modes[k])
  const selectedKeys = orderKeysForSetType(setType, enabled)
  const modesData = selectedKeys.map((modeName) => ({
    mode: modeName,
    required: !!requiredByMode[modeName],
  }))
  return JSON.parse(JSON.stringify(modesData))
}

/** 사이드바 등 한 줄 요약: 암기·리콜·마이픽·테스트·매칭 */
export function formatAvailableModesSummary(am, setType) {
  const parsed = parseAvailableModes(am, setType)
  const labels = []
  for (const k of orderKeysForSetType(
    setType,
    ALL_MODE_KEYS.filter((key) => parsed.modes[key]),
  )) {
    labels.push(MODE_LABELS[k] || k)
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

  let passScore = 70
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
export function buildAvailableModesJson(modes, requiredByMode, passScore, maxAttempts, setType = 'word') {
  return buildModesDataForWordSetSave(modes, requiredByMode, passScore, maxAttempts, setType)
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
  return { modes, requiredByMode, passScore: 70, maxAttempts: 3 }
}
