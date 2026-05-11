'use client'

import { ensureGoogleTtsMp3PublicUrl, hasGoogleTtsApiKeyConfigured } from '@/utils/googleTts'
import { dedupeAndNormalizeTtsJobs, buildTtsJobsFromWordRow } from '@/utils/ttsJobs'
import { emitTtsWarmupOverlay, hideTtsWarmupOverlaySoon } from '@/utils/ttsWarmupOverlay'

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

let overlayBusy = false
let abortCtrl = /** @type {AbortController | null} */ (null)

/** @returns {boolean} */
export function isTeacherTtsOverlayBusy() {
  return overlayBusy
}

/** Google Cloud Neural2 클래스 대당 초당 과금 표기 어렵고 자리수변동함 — 대략 $16/1M자·원화 참고값 */
export function roughCharCostUsd(charCount) {
  const c = Math.max(0, Number(charCount) || 0)
  return (c / 1_000_000) * 16
}

export function formatRoughTtsCostHint(charCount) {
  const usd = roughCharCostUsd(charCount)
  const krw = Math.round(usd * 1350)
  return `예상 과금 참고 · 약 $${usd.toFixed(3)} (약 ${krw.toLocaleString()}원) — 문자 수·통화별로 변동 있을 수 있어요`
}

export function cancelTeacherTtsPrefetchQueue() {
  try {
    abortCtrl?.abort()
  } catch {
    /* noop */
  }
}

/**
 * 단어 저장 직후 백그라운드 소량 처리 (모달 없음)
 * @param {unknown} wordSetLang
 * @param {{ word?: string, example_sentence?: string | null }} row
 */
export function prefetchTeacherWordTtsQuiet(wordSetLang, row, gapMs = 100) {
  if (!hasGoogleTtsApiKeyConfigured()) return
  void (async () => {
    const jobs = buildTtsJobsFromWordRow(wordSetLang, row)
    try {
      for (let i = 0; i < jobs.length; i += 1) {
        const j = jobs[i]
        await ensureGoogleTtsMp3PublicUrl(j.text, j.lang)
        if (i + 1 < jobs.length && gapMs > 0) await sleep(gapMs)
      }
    } catch (e) {
      console.error('[ttsPrefetchQuiet]', e)
    }
  })()
}

/**
 * @typedef {{ text: string, lang: string }} MinimalTtsJob
 */

/**
 * @param {{
 *   jobs: MinimalTtsJob[],
 *   title?: string,
 *   subtitle?: string,
 *   gapMs?: number,
 *   onToast?: { success: function(string), warning: function(string) }
 * }} opts
 */
export async function runTeacherTtsPrefetchWithOverlay(opts) {
  const gapMs = typeof opts?.gapMs === 'number' && opts.gapMs >= 0 ? opts.gapMs : 165
  const rawList = dedupeAndNormalizeTtsJobs(opts.jobs || [])
  if (!rawList.length) return

  if (!hasGoogleTtsApiKeyConfigured()) {
    console.warn('[ttsPrefetchOverlay] NEXT_PUBLIC_GOOGLE_TTS_API_KEY 없음 — 미리 생성 생략')
    try {
      opts.onToast?.warning?.('Google TTS API 키가 없어 음성 미리 생성을 건너뜁니다.')
    } catch {
      /* noop */
    }
    return
  }

  if (overlayBusy) {
    try {
      opts.onToast?.warning?.('이미 다른 음성 미리 생성이 진행 중입니다. 완료 후 다시 시도해 주세요.')
    } catch {
      /* noop */
    }
    return
  }

  overlayBusy = true
  abortCtrl = new AbortController()
  const charCount = rawList.reduce((a, j) => a + String(j.text || '').length, 0)

  emitTtsWarmupOverlay({
    open: true,
    phase: 'running',
    done: 0,
    total: rawList.length,
    title: opts.title || 'Google TTS 캐시',
    subtitle: opts.subtitle || `음성 생성 중 0/${rawList.length}`,
    costHint: formatRoughTtsCostHint(charCount),
    cancelled: false,
  })

  try {
    for (let i = 0; i < rawList.length; i += 1) {
      if (abortCtrl.signal.aborted) {
        emitTtsWarmupOverlay({ phase: 'cancelled', cancelled: true })
        opts.onToast?.warning?.(`음성 생성을 중단했습니다 (${i}/${rawList.length})`)
        await hideTtsWarmupOverlaySoon(1400)
        return
      }
      const job = rawList[i]
      try {
        await ensureGoogleTtsMp3PublicUrl(job.text, job.lang)
      } catch (e) {
        console.error('[ttsPrefetchOverlay] ensure', e)
      }
      emitTtsWarmupOverlay({
        done: i + 1,
        total: rawList.length,
        subtitle: `음성 생성 중 ${i + 1}/${rawList.length}`,
      })
      if (i + 1 < rawList.length && !abortCtrl.signal.aborted && gapMs > 0) {
        await sleep(gapMs)
      }
    }

    if (!abortCtrl.signal.aborted) {
      emitTtsWarmupOverlay({ phase: 'done', subtitle: `완료 · ${rawList.length}건` })
      opts.onToast?.success?.(`음성 미리 생성이 끝났습니다 (${rawList.length}건)`)
      await hideTtsWarmupOverlaySoon(2200)
    }
  } finally {
    overlayBusy = false
    abortCtrl = null
  }
}
