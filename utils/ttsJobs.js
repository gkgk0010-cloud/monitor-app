'use client'

import { resolveWordSetTtsLang } from '@/utils/studyTtsLang'

/**
 * @typedef {{ text: string, lang: import('@/utils/studyTtsLang').StudyTtsLang }} TtsJob
 */

/**
 * @param {Partial<TtsJob>[]} jobs
 * @returns {TtsJob[]}
 */
export function dedupeAndNormalizeTtsJobs(jobs) {
  const seen = new Set()
  const out = []
  for (const j of jobs || []) {
    const t = String(j?.text ?? '').trim()
    if (!t) continue
    const lang = resolveWordSetTtsLang(j.lang)
    const k = `${lang}|${t}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ text: t, lang })
  }
  return out
}

/**
 * 단어 행 또는 입력 페이로드에서 TTS 후보 문자열 목록 생성
 * @param {unknown} langRaw word_sets.default_lang
 * @param {{ word?: string, example_sentence?: string | null }} row
 */
export function buildTtsJobsFromWordRow(langRaw, row) {
  const lang = resolveWordSetTtsLang(langRaw)
  const jobs = []
  const w = String(row?.word ?? '').trim()
  if (w) jobs.push({ text: w, lang })
  const ex = String(row?.example_sentence ?? '').trim()
  if (ex) jobs.push({ text: ex, lang })
  return dedupeAndNormalizeTtsJobs(jobs)
}

/**
 * @param {unknown} langRaw
 * @param {{ word?: unknown, example_sentence?: unknown | null }[]} rows
 */
export function buildTtsJobsFromManyRows(langRaw, rows) {
  const lang = resolveWordSetTtsLang(langRaw)
  const flat = []
  for (const r of rows || []) {
    flat.push(...buildTtsJobsFromWordRow(lang, r))
  }
  return dedupeAndNormalizeTtsJobs(flat)
}

/**
 * @param {unknown} langRaw 세트별 row.default_lang 무시하고 한 언어만 쓸 때(미리보기 가져오기 등)
 */
export function buildTtsJobsFromManyRowsForcedLang(langRaw, rows) {
  const lang = resolveWordSetTtsLang(langRaw)
  const flat = []
  for (const r of rows || []) {
    const w = String(r?.word ?? '').trim()
    if (w) flat.push({ text: w, lang })
    const ex = String(r?.example_sentence ?? '').trim()
    if (ex) flat.push({ text: ex, lang })
  }
  return dedupeAndNormalizeTtsJobs(flat)
}

/**
 * 학원 세트 이름 → 해석 언어 (Supabase 클라에서만 사용 — RLS 기준 결과)
 */
export async function fetchWordSetsLangMapByTeacher(supabase, teacherId) {
  const langBySet = new Map()
  try {
    const { data: sets, error } = await supabase
      .from('word_sets')
      .select('name, default_lang')
      .eq('teacher_id', teacherId)
      .limit(5000)
    if (error) {
      console.error('[ttsJobs] fetchWordSetsLangMap', error.message)
      return langBySet
    }
    for (const s of sets || []) {
      const name = String(s?.name ?? '').trim()
      if (!name) continue
      langBySet.set(name, resolveWordSetTtsLang(s?.default_lang))
    }
    return langBySet
  } catch (e) {
    console.error('[ttsJobs] fetchWordSetsLangMap', e)
    return langBySet
  }
}

/**
 * @param {*} supabase @supabase/supabase-js 클라이언트
 * @param {string} teacherId
 * @returns {Promise<TtsJob[]>}
 */
export async function fetchAllTeacherWordTtsJobs(supabase, teacherId) {
  const langBySet = await fetchWordSetsLangMapByTeacher(supabase, teacherId)
  /** @type {TtsJob[]} */
  const acc = []

  try {
    const pageSize = 1000
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('words')
        .select('word, example_sentence, set_name')
        .eq('teacher_id', teacherId)
        .order('set_name')
        .range(from, from + pageSize - 1)

      if (error) {
        console.error('[ttsJobs] paginate words', error.message)
        break
      }
      const chunk = data || []
      if (chunk.length === 0) break

      for (const row of chunk) {
        const sn = String(row.set_name ?? '').trim()
        const lg = langBySet.get(sn) ?? 'en-US'
        acc.push(...buildTtsJobsFromWordRow(lg, row))
      }

      if (chunk.length < pageSize) break
      from += pageSize
    }
  } catch (e) {
    console.error('[ttsJobs] fetchAllTeacherWordTtsJobs', e)
  }

  return dedupeAndNormalizeTtsJobs(acc)
}

/**
 * CSV/엑셀 등으로 한 번에 넣은 페이로드 행들 — 세트별 언어 맵 사용
 * @param {Map<string, import('@/utils/studyTtsLang').StudyTtsLang>} langBySet
 * @param {{ word?: unknown, example_sentence?: unknown|null, set_name?: unknown }[]} rows
 */
export function buildTtsJobsFromRowsWithSetLangMap(langBySet, rows) {
  const acc = []
  for (const row of rows || []) {
    const sn = String(row?.set_name ?? '').trim()
    const lg = langBySet?.get?.(sn) ?? 'en-US'
    acc.push(...buildTtsJobsFromWordRow(lg, row))
  }
  return dedupeAndNormalizeTtsJobs(acc)
}
