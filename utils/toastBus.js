/**
 * Teacher 영역 전역 토스트 — TeacherToastPortal이 구독하고 createPortal로 body에 그림.
 * @param {string} message
 * @param {'success' | 'error'} [type]
 * @param {number} [durationMs]
 */
const listeners = new Set()

export function subscribeToast(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function showToast(message, type = 'success', durationMs = 2500) {
  const payload = { message: String(message ?? ''), type: type === 'error' ? 'error' : 'success', durationMs }
  listeners.forEach((fn) => {
    try {
      fn(payload)
    } catch (e) {
      console.warn('[showToast]', e)
    }
  })
}
