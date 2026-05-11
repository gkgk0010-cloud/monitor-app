'use client'

import { supabase } from '@/utils/supabaseClient'
import { resolveWordSetTtsLang } from '@/utils/studyTtsLang'

const BUCKET = 'tts-cache'
const GOOGLE_TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize'

/** 음성별 Google API voice.languageCode (캐시 경로용 lang 과 다를 수 있음) */
export const GOOGLE_TTS_VOICE = {
  'en-US': { voiceName: 'en-US-Neural2-D', apiLanguageCode: 'en-US' },
  'ko-KR': { voiceName: 'ko-KR-Neural2-A', apiLanguageCode: 'ko-KR' },
  'ja-JP': { voiceName: 'ja-JP-Neural2-B', apiLanguageCode: 'ja-JP' },
  'zh-CN': { voiceName: 'cmn-CN-Wavenet-A', apiLanguageCode: 'cmn-CN' },
  'es-ES': { voiceName: 'es-ES-Neural2-A', apiLanguageCode: 'es-ES' },
  'vi-VN': { voiceName: 'vi-VN-Neural2-A', apiLanguageCode: 'vi-VN' },
  'de-DE': { voiceName: 'de-DE-Neural2-A', apiLanguageCode: 'de-DE' },
}

const inFlightUrl = new Map()

function getApiKey() {
  try {
    return String(process.env.NEXT_PUBLIC_GOOGLE_TTS_API_KEY ?? '').trim()
  } catch {
    return ''
  }
}

/** @returns {boolean} */
export function hasGoogleTtsApiKeyConfigured() {
  return getApiKey().length > 0
}

export async function sha256CacheKeyPart(input) {
  const enc = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex.slice(0, 32)
}

/**
 * @param {import('@/utils/studyTtsLang').StudyTtsLang} lang
 * @param {string} voiceName
 * @param {string} text
 */
export function googleTtsObjectPath(lang, voiceName, text) {
  const canonical = `${lang}|${voiceName}|${text}`
  return sha256CacheKeyPart(canonical).then((hash) => `${lang}/${hash}.mp3`)
}

function base64ToUint8Array(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * @param {string} text
 * @param {import('@/utils/studyTtsLang').StudyTtsLang} lang
 * @param {number} [speakingRate]
 */
async function synthesizeMp3Bytes(text, lang, speakingRate = 1.0) {
  const key = getApiKey()
  if (!key) return null
  const cfg = GOOGLE_TTS_VOICE[lang]
  if (!cfg) return null
  const clipped = text.length > 4500 ? text.slice(0, 4500) : text
  const res = await fetch(`${GOOGLE_TTS_ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text: clipped },
      voice: {
        languageCode: cfg.apiLanguageCode,
        name: cfg.voiceName,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate,
      },
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.warn('[googleTts] synthesize HTTP', res.status, errText.slice(0, 200))
    return null
  }
  const json = await res.json()
  const b64 = json?.audioContent
  if (!b64) return null
  return base64ToUint8Array(b64)
}

/**
 * 캐시에 있으면 HEAD로 확인 후 URL 반환, 없으면 합성·업로드.
 * @param {string} text
 * @param {import('@/utils/studyTtsLang').StudyTtsLang} lang
 * @returns {Promise<string|null>}
 */
export async function ensureGoogleTtsMp3PublicUrl(text, lang) {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  const L = resolveWordSetTtsLang(lang)

  if (!hasGoogleTtsApiKeyConfigured()) return null

  if (!supabase) return null

  const voiceName = GOOGLE_TTS_VOICE[L].voiceName
  const path = await googleTtsObjectPath(L, voiceName, raw)
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = pub?.publicUrl
  if (!publicUrl) return null

  const headOk = await fetch(publicUrl, { method: 'HEAD' })
    .then((r) => r.ok)
    .catch(() => false)

  if (headOk) return publicUrl

  const flightKey = `${path}:${raw.length}`
  const existingPromise = inFlightUrl.get(flightKey)
  if (existingPromise) return existingPromise

  const promise = (async () => {
    const dl = await supabase.storage.from(BUCKET).download(path)
    if (!dl.error && dl.data) {
      return publicUrl
    }

    const mp3 = await synthesizeMp3Bytes(raw, L, 1.0)
    if (!mp3) return null

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, mp3, {
      upsert: true,
      contentType: 'audio/mpeg',
    })
    if (upErr) {
      console.warn('[googleTts] storage upload', upErr.message)
      return null
    }
    return publicUrl
  })()

  inFlightUrl.set(flightKey, promise)
  const out = await promise.finally(() => {
    inFlightUrl.delete(flightKey)
  })
  return out
}
