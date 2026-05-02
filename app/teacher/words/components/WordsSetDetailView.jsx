'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/utils/supabaseClient'
import { DEFAULT_ACADEMY_ID } from '@/utils/defaults'
import { useTeacher } from '@/utils/useTeacher'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import WordTable from './WordTable'
import BulkImport from './BulkImport'
import AutoFillPanel from './AutoFillPanel'
import RoutineSettingsSection from './RoutineSettingsSection'
import SetSettingsModal from './SetSettingsModal'
import { normalizeWordDifficulty } from '../utils/parsers'
import { filterWordRows } from '../utils/wordFilters'
import { formatAvailableModesSummary, normalizeSetType } from '../utils/learningModes'
import {
  meaningIsMissing,
  wordLabelForMeaningAlert,
  formatEmptyMeaningAlert,
  formatSupabaseWordsSaveError,
} from '../utils/wordMeaningGuard'
import { showToast } from '@/utils/toastBus'

/** @template T @param {T[]} arr @returns {T[]} */
function fisherYates(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * @param {{
 *   wordSet: { id: string; name: string; set_type?: string | null; available_modes?: unknown; invite_code?: string | null }
 *   onWordSetUpdated?: () => void | Promise<void>
 *   onSetDeleted?: () => void
 *   deepLinkEditRoutineId?: string
 *   deepLinkNewRoutine?: boolean
 *   onRoutineDeepLinkConsumed?: () => void
 * }} props
 */
export default function WordsSetDetailView({
  wordSet,
  onWordSetUpdated,
  onSetDeleted,
  deepLinkEditRoutineId = '',
  deepLinkNewRoutine = false,
  onRoutineDeepLinkConsumed,
}) {
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [dayFilter, setDayFilter] = useState(null)
  const [emptyOnly, setEmptyOnly] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [tableGroupMode, setTableGroupMode] = useState('chunk10')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('')
  const [dayYoutubeAction, setDayYoutubeAction] = useState(null)
  const [meaningHighlightRowIds, setMeaningHighlightRowIds] = useState(() => new Set())

  const { teacher, loading: teacherLoading } = useTeacher()
  const teacherId = teacher?.id
  const academyId = teacher?.academy_id ?? DEFAULT_ACADEMY_ID

  const setName = String(wordSet?.name || '').trim()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash !== '#routine-settings') return
    const t = window.setTimeout(() => {
      document.getElementById('routine-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [])

  const WORDS_CHUNK = 2500

  const loadWords = useCallback(async () => {
    if (teacherLoading) return
    const sn = String(wordSet?.name || '').trim()
    if (!teacherId || !sn) {
      setWords([])
      setLoading(false)
      setLoadingMore(false)
      return
    }

    setLoading(true)
    setLoadingMore(false)

    const q = () =>
      supabase
        .from('words')
        .select(
          'id, word, meaning, example_sentence, image_url, image_source, set_name, day, difficulty, youtube_url, order_index',
        )
        .eq('teacher_id', teacherId)
        .eq('set_name', sn)
        .order('order_index', { ascending: true, nullsFirst: false })
        .order('day', { ascending: true })

    const { data: first, error } = await q().range(0, WORDS_CHUNK - 1)

    if (error) {
      console.warn(error)
      alert(`단어 로드 실패: ${error.message}`)
      setWords([])
      setLoading(false)
      return
    }

    const batch0 = first || []
    setWords(batch0)
    setLoading(false)

    if (batch0.length < WORDS_CHUNK) return

    setLoadingMore(true)
    let from = WORDS_CHUNK
    try {
      while (true) {
        const { data, error: err2 } = await q().range(from, from + WORDS_CHUNK - 1)
        if (err2) {
          console.warn(err2)
          break
        }
        const next = data || []
        if (next.length === 0) break
        setWords((prev) => [...prev, ...next])
        if (next.length < WORDS_CHUNK) break
        from += WORDS_CHUNK
      }
    } finally {
      setLoadingMore(false)
    }
  }, [teacherLoading, teacherId, wordSet?.name])

  useEffect(() => {
    void loadWords()
  }, [loadWords])

  const setTypeByName = useMemo(() => {
    if (!setName) return {}
    return { [setName]: normalizeSetType(wordSet?.set_type || 'word') }
  }, [setName, wordSet?.set_type])

  const routineSetNames = useMemo(() => (setName ? [setName] : []), [setName])

  const stats = useMemo(() => {
    const total = words.length
    const noImage = words.filter((w) => !w.image_url || !String(w.image_url).trim()).length
    const noExample = words.filter((w) => !w.example_sentence || !String(w.example_sentence).trim()).length
    return { total, noImage, noExample }
  }, [words])

  const tableColumnPreset = useMemo(() => {
    const t = normalizeSetType(wordSet?.set_type || 'word')
    if (t === 'sentence_writing' || t === 'sentence_speaking') return 'sentence'
    return 'word'
  }, [wordSet?.set_type])

  const filterOpts = useMemo(
    () => ({ search, setFilter: setName, dayFilter, emptyOnly }),
    [search, setName, dayFilter, emptyOnly],
  )

  const filtered = useMemo(() => filterWordRows(words, filterOpts), [words, filterOpts])

  const wordsRef = useRef(words)
  const filteredRef = useRef(filtered)
  const filterOptsRef = useRef(filterOpts)
  wordsRef.current = words
  filteredRef.current = filtered
  filterOptsRef.current = filterOpts

  const handleRowsChange = useCallback((next) => {
    setWords((prev) => {
      const opts = filterOptsRef.current
      const prevFiltered = Object.is(prev, wordsRef.current)
        ? filteredRef.current
        : filterWordRows(prev, opts)
      const merged = typeof next === 'function' ? next(prevFiltered) : next
      const nextById = new Map(merged.map((r) => [String(r.id), r]))
      return prev.map((r) => nextById.get(String(r.id)) ?? r)
    })
  }, [])

  const daysInSelectedSet = useMemo(() => {
    const s = new Set()
    for (const w of words) {
      if (String(w.set_name || '').trim() !== setName) continue
      if (w.day != null) s.add(Number(w.day))
    }
    return [...s].sort((a, b) => a - b)
  }, [words, setName])

  const currentDayYoutubeUrl = useMemo(() => {
    if (!setName || dayFilter == null) return ''
    const d = Number(dayFilter)
    const rows = words.filter((w) => String(w.set_name || '').trim() === setName && Number(w.day) === d)
    const hit = rows.find((r) => r.youtube_url && String(r.youtube_url).trim())
    return hit ? String(hit.youtube_url).trim() : ''
  }, [words, setName, dayFilter])

  useEffect(() => {
    setYoutubeUrlInput(currentDayYoutubeUrl)
  }, [currentDayYoutubeUrl])

  const handleSaveDayYoutube = async () => {
    if (!teacherId || !setName || dayFilter == null) return
    const d = Number(dayFilter)
    const matching = words.filter(
      (w) => String(w.set_name || '').trim() === setName && Number(w.day) === d,
    )
    if (matching.length === 0) {
      alert('이 DAY에 등록된 단어가 없습니다. 단어를 먼저 추가한 뒤 저장해 주세요.')
      return
    }
    const url = youtubeUrlInput.trim() ? String(youtubeUrlInput).trim() : null
    setDayYoutubeAction('save')
    try {
      const { error } = await supabase
        .from('words')
        .update({ youtube_url: url })
        .eq('teacher_id', teacherId)
        .eq('set_name', setName)
        .eq('day', d)
      if (error) {
        showToast(`저장 실패: ${error.message}`, 'error', 3500)
        return
      }
      setWords((prev) =>
        prev.map((w) =>
          String(w.set_name || '').trim() === setName && Number(w.day) === d ? { ...w, youtube_url: url } : w,
        ),
      )
      showToast(`✓ Day ${d} 영상 URL이 저장되었습니다`, 'success', 2500)
    } finally {
      setDayYoutubeAction(null)
    }
  }

  const handleClearDayYoutube = async () => {
    if (!teacherId || !setName || dayFilter == null) return
    const d = Number(dayFilter)
    if (!window.confirm(`Day ${d}의 영상 URL을 모두 지우시겠습니까?`)) return
    setDayYoutubeAction('clear')
    try {
      const { error } = await supabase
        .from('words')
        .update({ youtube_url: null })
        .eq('teacher_id', teacherId)
        .eq('set_name', setName)
        .eq('day', d)
      if (error) {
        showToast(`초기화 실패: ${error.message}`, 'error', 3500)
        return
      }
      setWords((prev) =>
        prev.map((w) =>
          String(w.set_name || '').trim() === setName && Number(w.day) === d ? { ...w, youtube_url: null } : w,
        ),
      )
      setYoutubeUrlInput('')
      showToast(`✓ Day ${d} 영상 URL이 초기화되었습니다`, 'success', 2500)
    } finally {
      setDayYoutubeAction(null)
    }
  }

  const handleRowDelete = useCallback(
    async (row) => {
      if (!teacherId) return
      const w = String(row.word || '').trim()
      if (!confirm(w ? `「${w}」행을 삭제할까요?` : '이 행을 삭제할까요?')) return
      const id = String(row.id)
      if (id.startsWith('temp-')) {
        setWords((prev) => prev.filter((r) => String(r.id) !== id))
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        return
      }
      const { error } = await supabase.from('words').delete().eq('id', id).eq('teacher_id', teacherId)
      if (error) {
        alert(`삭제 실패: ${error.message}`)
        return
      }
      setWords((prev) => prev.filter((r) => String(r.id) !== id))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      showToast('✓ 삭제되었습니다', 'success', 2500)
    },
    [teacherId],
  )

  const handleDeleteSet = useCallback(async () => {
    const sn = setName
    if (!teacherId || !sn) return
    const msg =
      `'${sn}' 전체를 삭제하시겠습니까?\n\n` +
      `이 세트의 모든 단어가 함께 삭제됩니다.\n` +
      `이 작업은 되돌릴 수 없습니다.`
    if (!window.confirm(msg)) return

    const { error: errWords } = await supabase
      .from('words')
      .delete()
      .eq('teacher_id', teacherId)
      .eq('set_name', sn)
    if (errWords) {
      alert(`단어 삭제 실패: ${errWords.message}`)
      return
    }

    const { error: errSets } = await supabase.from('word_sets').delete().eq('teacher_id', teacherId).eq('name', sn)
    if (errSets) {
      console.warn('[word_sets delete]', errSets.message)
    }

    setSettingsOpen(false)
    showToast(`✓ '${sn}' 세트가 삭제되었습니다`, 'success', 3000)
    onSetDeleted?.()
  }, [teacherId, setName, onSetDeleted])

  const flashRowSaveToast = useCallback((ok) => {
    showToast(ok ? '✓ 저장되었습니다' : '저장 실패', ok ? 'success' : 'error', 2500)
  }, [])

  const handleRowCommit = useCallback(
    async (row) => {
      if (!teacherId) return
      const id = String(row.id)
      const sn = String(row.set_name || '').trim() || setName || '토익 기본 단어'
      const st = normalizeSetType(setTypeByName[sn] || 'word')
      let word = String(row.word || '').trim()
      const ex = String(row.example_sentence || '').trim()
      const sentenceStyle = st === 'sentence_writing' || st === 'sentence_speaking'

      if (sentenceStyle) {
        if (!ex) return
        if (!word) word = ex.length > 300 ? ex.slice(0, 300) : ex
      } else if (!word) {
        return
      }

      if (meaningIsMissing(row.meaning)) {
        const vis = filteredRef.current
        const idx = vis.findIndex((r) => String(r.id) === id)
        const rowNum =
          idx >= 0
            ? idx + 1
            : (() => {
                const j = wordsRef.current.findIndex((r) => String(r.id) === id)
                return j >= 0 ? j + 1 : 1
              })()
        setMeaningHighlightRowIds((prev) => new Set([...prev, id]))
        alert(
          formatEmptyMeaningAlert([
            { row: rowNum, label: wordLabelForMeaningAlert(row, { sentenceStyle }) },
          ]),
        )
        flashRowSaveToast(false)
        return
      }

      const meaning = String(row.meaning ?? '').trim()

      const resolveOrderIndex = () => {
        if (row.order_index != null && Number.isFinite(Number(row.order_index))) {
          return Math.max(1, Math.floor(Number(row.order_index)))
        }
        const list = wordsRef.current.filter((w) => String(w.set_name || '').trim() === sn)
        let m = 0
        for (const w of list) {
          if (w.order_index != null && Number.isFinite(Number(w.order_index))) {
            m = Math.max(m, Number(w.order_index))
          }
        }
        return m + 1
      }

      const payload = {
        word,
        meaning,
        example_sentence: ex || null,
        set_name: String(row.set_name || '토익 기본 단어').trim() || '토익 기본 단어',
        day: Math.max(1, parseInt(String(row.day ?? 1), 10) || 1),
        order_index: resolveOrderIndex(),
        difficulty: normalizeWordDifficulty(row?.difficulty),
        image_url: row.image_url ? String(row.image_url).trim() : null,
        image_source: row.image_url ? String(row.image_source || 'none') : 'none',
        youtube_url:
          row.youtube_url != null && String(row.youtube_url).trim() ? String(row.youtube_url).trim() : null,
      }

      if (id.startsWith('temp-')) {
        const rowPayload = {
          ...payload,
          academy_id: academyId,
          teacher_id: teacherId,
        }
        const dedupedPayload = Array.from(
          new Map([rowPayload].map((p) => [`${p.set_name}|${p.day}|${p.word}`, p])).values(),
        )
        const { data, error } = await supabase
          .from('words')
          .upsert(dedupedPayload, {
            onConflict: 'set_name,day,word',
            defaultToNull: false,
          })
          .select()
          .single()
        if (error) {
          console.warn(error)
          flashRowSaveToast(false)
          alert(formatSupabaseWordsSaveError(error))
          return
        }
        setMeaningHighlightRowIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        setWords((prev) => prev.map((r) => (String(r.id) === id ? data : r)))
        flashRowSaveToast(true)
      } else {
        const { error } = await supabase.from('words').update(payload).eq('id', id).eq('teacher_id', teacherId)
        if (error) {
          console.warn(error)
          flashRowSaveToast(false)
          alert(formatSupabaseWordsSaveError(error))
          return
        }
        setMeaningHighlightRowIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        flashRowSaveToast(true)
      }
    },
    [teacherId, academyId, flashRowSaveToast, setTypeByName, setName],
  )

  const addEmptyRow = () => {
    const sn = setName || '토익 기본 단어'
    setWords((prev) => {
      const list = prev.filter((w) => String(w.set_name || '').trim() === sn)
      let m = 0
      for (const w of list) {
        if (w.order_index != null && Number.isFinite(Number(w.order_index))) {
          m = Math.max(m, Number(w.order_index))
        }
      }
      const nextIdx = m + 1
      return [
        {
          id: `temp-${Date.now()}`,
          word: '',
          meaning: '',
          example_sentence: '',
          set_name: sn,
          day: 1,
          image_url: null,
          image_source: 'none',
          difficulty: 1,
          youtube_url: null,
          order_index: nextIdx,
        },
        ...prev,
      ]
    })
  }

  const shuffleDisplayOrder = useCallback(async () => {
    if (!setName || !teacherId) return
    const prev = wordsRef.current
    const idxs = []
    for (let i = 0; i < prev.length; i++) {
      if (String(prev[i].set_name || '').trim() === setName) idxs.push(i)
    }
    if (idxs.length < 2) {
      showToast('섞을 단어가 2개 이상 필요해요', 'info', 2500)
      return
    }
    const slice = idxs.map((i) => prev[i])
    const shuffled = fisherYates(slice)
    const persist = shuffled.filter((r) => !String(r.id).startsWith('temp-'))
    const CHUNK = 40
    try {
      for (let c = 0; c < persist.length; c += CHUNK) {
        const part = persist.slice(c, c + CHUNK)
        const results = await Promise.all(
          part.map((r, j) => {
            const ord = c + j + 1
            return supabase
              .from('words')
              .update({ order_index: ord })
              .eq('id', String(r.id))
              .eq('teacher_id', teacherId)
          }),
        )
        const err = results.find((x) => x.error)?.error
        if (err) throw new Error(err.message)
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '순서 저장에 실패했어요', 'error', 4000)
      return
    }

    const next = [...prev]
    const orderMap = new Map()
    shuffled.forEach((r, i) => {
      if (!String(r.id).startsWith('temp-')) orderMap.set(String(r.id), i + 1)
    })
    for (let j = 0; j < idxs.length; j++) {
      const r = shuffled[j]
      const oid = orderMap.get(String(r.id))
      next[idxs[j]] = oid != null ? { ...r, order_index: oid } : r
    }
    setWords(next)
    showToast('순서를 섞어 DB에 저장했어요. 학생 앱에도 같은 순서로 보여요.', 'success', 3800)
  }, [setName, teacherId])

  const autoFillRows =
    selectedIds.size > 0 ? filtered.filter((r) => selectedIds.has(String(r.id))) : filtered

  const handleAutoFilled = async (updated) => {
    if (!teacherId) return
    const map = new Map(updated.map((r) => [String(r.id), r]))
    const toPersist = updated.filter((r) => !String(r.id).startsWith('temp-'))

    const badMeaning = []
    for (const r of toPersist) {
      if (!meaningIsMissing(r.meaning)) continue
      const id = String(r.id)
      const vis = filteredRef.current
      const idx = vis.findIndex((x) => String(x.id) === id)
      const rowNum =
        idx >= 0
          ? idx + 1
          : (() => {
              const j = wordsRef.current.findIndex((x) => String(x.id) === id)
              return j >= 0 ? j + 1 : 1
            })()
      const sn = String(r.set_name || '').trim() || setName || '토익 기본 단어'
      const st = normalizeSetType(setTypeByName[sn] || 'word')
      const sentenceStyle = st === 'sentence_writing' || st === 'sentence_speaking'
      badMeaning.push({
        row: rowNum,
        id,
        label: wordLabelForMeaningAlert(r, { sentenceStyle }),
      })
    }
    if (badMeaning.length > 0) {
      setMeaningHighlightRowIds(new Set(badMeaning.map((x) => x.id)))
      alert(formatEmptyMeaningAlert(badMeaning.map(({ row, label }) => ({ row, label }))))
      return
    }

    setWords((prev) => prev.map((r) => map.get(String(r.id)) || r))

    for (const r of toPersist) {
      const id = String(r.id)
      const { error } = await supabase
        .from('words')
        .update({
          meaning: r.meaning != null ? String(r.meaning) : null,
          example_sentence: r.example_sentence != null ? String(r.example_sentence).trim() || null : null,
          image_url: r.image_url ? String(r.image_url).trim() : null,
          image_source: r.image_url ? String(r.image_source || 'unsplash') : 'none',
        })
        .eq('id', id)
        .eq('teacher_id', teacherId)
      if (error) console.warn('[words] autofill save', error.message)
    }
  }

  const chipFont = '16px'
  const controlPad = '12px 14px'
  const controlMinH = 48

  if (teacherLoading) {
    return (
      <div style={{ minHeight: '40vh', padding: '8px 0 24px' }}>
        <p style={{ color: COLORS.textSecondary }}>선생님 정보를 확인하는 중…</p>
      </div>
    )
  }

  if (!teacherId || !setName) {
    return null
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '100%',
        minHeight: '100%',
        fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      }}
    >
      <header
        className="teacher-page-header-bleed"
        style={{
          marginBottom: 16,
          padding: '14px 18px',
          borderRadius: RADIUS.lg,
          background: COLORS.headerGradient,
          color: COLORS.textOnGreen,
          boxShadow: SHADOW.card,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', minWidth: 0 }}>
          <Link href="/teacher/words" style={{ color: COLORS.textOnGreen, fontSize: 14, opacity: 0.95 }}>
            ← 세트 목록
          </Link>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, lineHeight: 1.3, wordBreak: 'break-word' }}>
              {setName}
            </h1>
            <div style={{ fontSize: 13, opacity: 0.95, marginTop: 4, fontWeight: 600 }}>
              {formatAvailableModesSummary(wordSet?.available_modes, normalizeSetType(wordSet?.set_type || 'word'))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            style={{
              padding: '10px 16px',
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.textOnGreen}`,
              background: 'transparent',
              color: COLORS.textOnGreen,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            세트 설정
          </button>
          <button
            type="button"
            onClick={() => void shuffleDisplayOrder()}
            style={{
              padding: '10px 16px',
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.textOnGreen}`,
              background: 'rgba(255,255,255,0.15)',
              color: COLORS.textOnGreen,
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            순서 랜덤 섞기
          </button>
          <button
            type="button"
            onClick={addEmptyRow}
            style={{
              padding: '10px 16px',
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.textOnGreen}`,
              background: 'transparent',
              color: COLORS.textOnGreen,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            + 단어 추가
          </button>
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            style={{
              padding: '10px 16px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: COLORS.textOnGreen,
              color: COLORS.primaryDark,
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            가져오기
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteSet()}
            style={{
              padding: '10px 16px',
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.textOnGreen}`,
              background: 'rgba(255,80,80,0.25)',
              color: COLORS.textOnGreen,
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            세트 삭제
          </button>
        </div>
      </header>

      <RoutineSettingsSection
        teacherId={teacherId}
        setNames={routineSetNames}
        sectionTitle="이 세트의 루틴"
        deepLinkEditRoutineId={deepLinkEditRoutineId}
        deepLinkNewRoutine={deepLinkNewRoutine}
        onDeepLinkConsumed={onRoutineDeepLinkConsumed}
      />

      <div
        style={{
          marginBottom: 16,
          padding: '12px 16px 14px',
          boxSizing: 'border-box',
          background: COLORS.surface,
          borderRadius: RADIUS.md,
          border: `1px solid ${COLORS.border}`,
          position: 'sticky',
          top: 0,
          zIndex: 55,
          boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 4,
            marginBottom: 12,
            fontSize: 13,
            color: COLORS.textSecondary,
            lineHeight: 1.5,
          }}
        >
          <span>
            전체 <strong style={{ color: COLORS.textPrimary, fontWeight: 800 }}>{stats.total}</strong>개
          </span>
          <span aria-hidden>·</span>
          <span style={{ color: stats.noExample > 0 ? '#c2410c' : undefined, fontWeight: stats.noExample > 0 ? 700 : 400 }}>
            빈 예문 {stats.noExample}개
          </span>
          <span aria-hidden>·</span>
          <span style={{ color: stats.noImage > 0 ? '#c2410c' : undefined, fontWeight: stats.noImage > 0 ? 700 : 400 }}>
            빈 이미지 {stats.noImage}개
          </span>
        </div>

        {!loading && stats.total === 0 ? (
          <div
            role="note"
            style={{
              marginBottom: 14,
              padding: '16px 18px',
              borderRadius: RADIUS.md,
              background: 'linear-gradient(135deg, #fef9c3 0%, #ffedd5 100%)',
              border: '1px solid rgba(234, 179, 8, 0.45)',
              fontSize: 17,
              fontWeight: 700,
              color: '#78350f',
              lineHeight: 1.55,
            }}
          >
            💡 단어가 아직 없어요. 「+ 단어 추가」 또는 「가져오기」로 넣은 뒤,{' '}
            <strong>각 행의 「저장」</strong>을 눌러 DB에 반영하세요. Day를 고르면 강의 영상 URL도 아래에서 넣을 수
            있어요.
          </div>
        ) : !loading ? (
          <div
            role="note"
            style={{
              marginBottom: 10,
              padding: '12px 14px',
              borderRadius: RADIUS.md,
              background: 'linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              fontSize: 16,
              fontWeight: 600,
              color: '#1e3a5f',
              lineHeight: 1.5,
            }}
          >
            💡 수정 내용은 <strong>행마다 「저장」</strong>해야 DB에 반영돼요 · 예문 AI: 칸 오른쪽 돋보기 또는{' '}
            <strong>Ctrl+S</strong>
          </div>
        ) : null}

        {!loading ? (
          <div
            role="note"
            style={{
              marginBottom: 14,
              padding: '10px 14px',
              borderRadius: RADIUS.md,
              background: '#fff7ed',
              border: '1px solid rgba(251, 146, 60, 0.35)',
              fontSize: 15,
              fontWeight: 600,
              color: '#9a3412',
              lineHeight: 1.45,
            }}
          >
            ℹ️{' '}
            {dayFilter != null
              ? `Day ${dayFilter} 선택됨 — 아래에서 이 Day 강의 영상 URL을 지정할 수 있어요.`
              : 'Day를 선택하면 아래에서 Day별 강의 영상 URL을 넣을 수 있어요.'}
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            alignItems: 'center',
            paddingTop: 2,
          }}
        >
        <input
          type="search"
          placeholder="검색 (단어·뜻)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1 1 220px',
            minHeight: controlMinH,
            padding: controlPad,
            borderRadius: RADIUS.sm,
            border: `1px solid ${COLORS.border}`,
            fontSize: chipFont,
            boxSizing: 'border-box',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: COLORS.textSecondary, fontSize: chipFont, fontWeight: 600 }}>Day</span>
          <select
            value={dayFilter == null ? '' : String(dayFilter)}
            onChange={(e) => {
              const v = e.target.value
              setDayFilter(v === '' ? null : Number(v))
            }}
            style={{
              minHeight: controlMinH,
              padding: controlPad,
              borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.border}`,
              minWidth: 120,
              fontSize: chipFont,
              boxSizing: 'border-box',
              background: COLORS.bg,
            }}
          >
            <option value="">전체 Day</option>
            {daysInSelectedSet.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={emptyOnly} onChange={(e) => setEmptyOnly(e.target.checked)} />
          <span style={{ fontSize: chipFont, color: COLORS.textPrimary, fontWeight: 600 }}>빈 필드만 보기</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: COLORS.textSecondary, fontSize: chipFont, fontWeight: 600 }}>목록</span>
          <select
            value={tableGroupMode}
            onChange={(e) => setTableGroupMode(e.target.value)}
            style={{
              minHeight: controlMinH,
              padding: controlPad,
              borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.border}`,
              fontSize: chipFont,
              minWidth: 160,
              boxSizing: 'border-box',
              background: COLORS.bg,
            }}
          >
            <option value="none">전체 펼침</option>
            <option value="chunk10">10개씩 접기</option>
          </select>
        </label>
      </div>
      </div>

      {dayFilter != null ? (
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            borderRadius: RADIUS.lg,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
            boxShadow: SHADOW.card,
          }}
        >
          <div style={{ fontWeight: 800, color: COLORS.accentText, marginBottom: 10, fontSize: 15 }}>
            📺 Day {dayFilter} 강의 영상
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'stretch',
              marginBottom: 10,
            }}
          >
            <input
              type="url"
              name="day-youtube-url-detail"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrlInput}
              onChange={(e) => setYoutubeUrlInput(e.target.value)}
              disabled={dayYoutubeAction != null}
              style={{
                flex: '1 1 240px',
                minWidth: 0,
                minHeight: controlMinH,
                boxSizing: 'border-box',
                padding: controlPad,
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                fontSize: chipFont,
              }}
            />
            <button
              type="button"
              disabled={dayYoutubeAction != null}
              onClick={() => void handleSaveDayYoutube()}
              style={{
                padding: '12px 20px',
                borderRadius: RADIUS.sm,
                border: 'none',
                background: COLORS.headerGradient,
                color: COLORS.textOnGreen,
                fontWeight: 700,
                fontSize: chipFont,
                cursor: dayYoutubeAction != null ? 'wait' : 'pointer',
                opacity: dayYoutubeAction != null ? 0.85 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {dayYoutubeAction === 'save' ? '저장 중…' : '저장'}
            </button>
          </div>
          <button
            type="button"
            disabled={dayYoutubeAction != null}
            onClick={() => void handleClearDayYoutube()}
            style={{
              padding: '10px 14px',
              borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.danger}`,
              background: COLORS.dangerBg,
              color: COLORS.danger,
              fontWeight: 700,
              fontSize: 15,
              cursor: dayYoutubeAction != null ? 'wait' : 'pointer',
              marginBottom: 8,
            }}
          >
            {dayYoutubeAction === 'clear' ? '초기화 중…' : '초기화'}
          </button>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>
            이 DAY에 속한 모든 단어 행의 <code style={{ fontSize: 13 }}>youtube_url</code>에 같은 주소가 저장됩니다. 학생 앱은
            Day당 하나의 영상만 재생합니다.
          </p>
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>
      ) : (
        <>
          <WordTable
            rows={filtered}
            rowGroupMode={tableGroupMode}
            onRowsChange={handleRowsChange}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            onRowCommit={handleRowCommit}
            showSetNameColumn={false}
            showDeleteColumn
            onRowDelete={handleRowDelete}
            columnPreset={tableColumnPreset}
            highlightRowIds={meaningHighlightRowIds}
            scrollContainer="window"
            stickyHeaderOffsetPx={220}
          />
          {loadingMore ? (
            <p style={{ margin: '10px 0 0', fontSize: 14, color: COLORS.textSecondary }}>
              나머지 단어를 불러오는 중… ({words.length}개까지 로드됨)
            </p>
          ) : null}
          <AutoFillPanel rows={autoFillRows} onFilled={handleAutoFilled} />
        </>
      )}

      <BulkImport
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSaved={() => void loadWords()}
        existingSetNames={routineSetNames}
        initialSetName={setName}
        teacherId={teacherId}
        academyId={academyId}
        importSetType={normalizeSetType(wordSet?.set_type || 'word')}
      />

      <SetSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        setName={setName}
        teacherId={teacherId}
        inferredSetType={normalizeSetType(wordSet?.set_type || 'word')}
        hasImageWords={words.some((w) => w.image_url && String(w.image_url).trim())}
        onSaved={() => {
          void loadWords()
          void onWordSetUpdated?.()
        }}
        onRenamed={(oldName, newName) => {
          void onWordSetUpdated?.()
          const o = String(oldName || '').trim()
          const n = String(newName || '').trim()
          if (n) {
            setWords((prev) => prev.map((r) => (String(r.set_name || '').trim() === o ? { ...r, set_name: n } : r)))
          }
          if (n) setSettingsOpen(false)
        }}
      />
    </div>
  )
}
