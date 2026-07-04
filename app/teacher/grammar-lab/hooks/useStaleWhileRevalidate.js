import { useCallback, useEffect, useRef, useState } from 'react'
import { cacheGet, cacheSet } from '@/lib/cache'

/**
 * stale-while-revalidate: 캐시 즉시 표시 → 백그라운드 fetch
 * @template T
 * @param {string | null | undefined} cacheKey
 * @param {() => Promise<T>} fetcher
 * @param {{ enabled?: boolean }} [options]
 */
export function useStaleWhileRevalidate(cacheKey, fetcher, options = {}) {
  const { enabled = true } = options
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const readCache = useCallback(() => {
    if (!cacheKey) return null
    return cacheGet(cacheKey)?.data ?? null
  }, [cacheKey])

  const [data, setData] = useState(() => (enabled ? readCache() : null))
  const [loading, setLoading] = useState(() => enabled && cacheKey && readCache() == null)
  const [revalidating, setRevalidating] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const writeCache = useCallback(
    (value) => {
      if (cacheKey) cacheSet(cacheKey, value)
      if (mountedRef.current) setData(value)
    },
    [cacheKey],
  )

  const revalidate = useCallback(
    async (opts = {}) => {
      const { background = false, skipCache = false } = opts
      if (!enabled || !cacheKey) return null

      const cached = skipCache ? null : readCache()
      if (background) {
        if (mountedRef.current) setRevalidating(true)
      } else if (cached == null) {
        if (mountedRef.current) setLoading(true)
      } else {
        if (mountedRef.current) setRevalidating(true)
      }

      try {
        const fresh = await fetcherRef.current()
        cacheSet(cacheKey, fresh)
        if (mountedRef.current) setData(fresh)
        return fresh
      } catch (err) {
        console.warn('[useStaleWhileRevalidate]', cacheKey, err?.message || err)
        return null
      } finally {
        if (mountedRef.current) {
          setLoading(false)
          setRevalidating(false)
        }
      }
    },
    [cacheKey, enabled, readCache],
  )

  useEffect(() => {
    if (!enabled || !cacheKey) {
      setLoading(false)
      return
    }
    const cached = readCache()
    if (cached != null) {
      setData(cached)
      setLoading(false)
      void revalidate({ background: true })
    } else {
      void revalidate({ background: false })
    }
  }, [cacheKey, enabled, readCache, revalidate])

  return {
    data,
    loading,
    revalidating,
    revalidate,
    setData: writeCache,
  }
}
