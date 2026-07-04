import { cacheRemove, cacheRemoveByPrefix } from '@/lib/cache'

/** @param {string} teacherId */
export function grammarLabListCacheKey(teacherId) {
  return `gl:list:${teacherId}`
}

/** @param {string} teacherId @param {string} setName */
export function grammarLabDetailCacheKey(teacherId, setName) {
  return `gl:detail:${teacherId}:${encodeURIComponent(setName)}`
}

/** @param {string} teacherId @param {string} setId */
export function readingInterpretDetailCacheKey(teacherId, setId) {
  return `gl:ri:${teacherId}:${setId}`
}

/** @param {string} teacherId */
export function invalidateGrammarLabListCache(teacherId) {
  if (!teacherId) return
  cacheRemove(grammarLabListCacheKey(teacherId))
}

/** @param {string} teacherId @param {string} setName */
export function invalidateGrammarLabDetailCache(teacherId, setName) {
  if (!teacherId || !setName) return
  cacheRemove(grammarLabDetailCacheKey(teacherId, setName))
}

/** @param {string} teacherId @param {string} setId */
export function invalidateReadingInterpretDetailCache(teacherId, setId) {
  if (!teacherId || !setId) return
  cacheRemove(readingInterpretDetailCacheKey(teacherId, setId))
}

/** 목록 + 해당 교사 grammar-lab 캐시 전체 */
export function invalidateAllGrammarLabCaches(teacherId) {
  if (!teacherId) return
  cacheRemoveByPrefix(`gl:list:${teacherId}`)
  cacheRemoveByPrefix(`gl:detail:${teacherId}:`)
  cacheRemoveByPrefix(`gl:ri:${teacherId}:`)
}
