/** in-memory + sessionStorage 캐시 (탭/뒤로가기 간 유지) */

const PREFIX = 'tokpass-cache:'
const memory = new Map()

function storageKey(key) {
  return PREFIX + key
}

/** @template T @param {string} key @returns {{ data: T, ts: number } | null} */
export function cacheGet(key) {
  if (!key) return null
  if (memory.has(key)) return memory.get(key)
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(storageKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    memory.set(key, parsed)
    return parsed
  } catch {
    return null
  }
}

/** @param {string} key @param {unknown} value */
export function cacheSet(key, value) {
  if (!key) return
  const entry = { data: value, ts: Date.now() }
  memory.set(key, entry)
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(entry))
  } catch (err) {
    console.warn('[cache] sessionStorage write failed:', err?.message || err)
  }
}

/** @param {string} key */
export function cacheRemove(key) {
  if (!key) return
  memory.delete(key)
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(storageKey(key))
  } catch {
    /* ignore */
  }
}

/** @param {string} prefix */
export function cacheRemoveByPrefix(prefix) {
  if (!prefix) return
  for (const k of [...memory.keys()]) {
    if (k.startsWith(prefix)) memory.delete(k)
  }
  if (typeof sessionStorage === 'undefined') return
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const sk = sessionStorage.key(i)
      if (sk && sk.startsWith(PREFIX + prefix)) {
        sessionStorage.removeItem(sk)
      }
    }
  } catch {
    /* ignore */
  }
}
