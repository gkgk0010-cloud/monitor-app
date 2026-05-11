'use client'

let snapshot = /** @type {TtsWarmupOverlayState} */ ({
  open: false,
  phase: 'idle',
  done: 0,
  total: 0,
  title: '',
  subtitle: '',
  costHint: '',
  cancelled: false,
})

/**
 * @typedef {{
 *   open: boolean
 *   phase: 'idle' | 'running' | 'cancelled' | 'done'
 *   done: number
 *   total: number
 *   title: string
 *   subtitle: string
 *   costHint: string
 *   cancelled: boolean
 * }} TtsWarmupOverlayState
 */

const listeners = new Set()

/** @returns {TtsWarmupOverlayState} */
export function getTtsWarmupOverlaySnapshot() {
  return snapshot
}

/** @param {(s: TtsWarmupOverlayState) => void} fn */
export function subscribeTtsWarmupOverlay(fn) {
  listeners.add(fn)
  fn(snapshot)
  return () => listeners.delete(fn)
}

/** @param {Partial<TtsWarmupOverlayState>} partial */
export function emitTtsWarmupOverlay(partial) {
  snapshot = { ...snapshot, ...partial }
  listeners.forEach((fn) => {
    try {
      fn(snapshot)
    } catch {
      /* noop */
    }
  })
}

/** @returns {Promise<void>} */
export function hideTtsWarmupOverlaySoon(ms = 900) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve()
      return
    }
    window.setTimeout(() => {
      emitTtsWarmupOverlay({
        open: false,
        phase: 'idle',
        done: 0,
        total: 0,
        title: '',
        subtitle: '',
        costHint: '',
        cancelled: false,
      })
      resolve()
    }, ms)
  })
}
