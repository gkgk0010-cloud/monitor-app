'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabaseClient'
import { DEFAULT_ACADEMY_ID } from '@/utils/defaults'
import { useTeacher } from '@/utils/useTeacher'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import WordTable from './components/WordTable'
import BulkImport from './components/BulkImport'
import AutoFillPanel from './components/AutoFillPanel'
import RoutineSettingsSection from './components/RoutineSettingsSection'
import MenuSettingsSection from './components/MenuSettingsSection'
import NewWordSetModal from './components/NewWordSetModal'
import SetSettingsModal from './components/SetSettingsModal'
import { normalizeWordDifficulty } from './utils/parsers'
import { filterWordRows } from './utils/wordFilters'
import { formatAvailableModesSummary, normalizeSetType } from './utils/learningModes'

export default function WordsManagePage() {
  const router = useRouter()
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  /** 나머지 청크 백그라운드 로드 중 */
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [setFilter, setSetFilter] = useState('')
  /** 세트 선택 후 day만 보기 (null = 전체 day) */
  const [dayFilter, setDayFilter] = useState(null)
  const [emptyOnly, setEmptyOnly] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [saveHint, setSaveHint] = useState(null)
  /** 단어 행 [저장] 결과 — 자동 저장 제거 후 버튼 전용 */
  const [rowSaveToast, setRowSaveToast] = useState(null)
  /** 테이블 접기: 10개 단위 (Day는 사이드바에서 이미 필터) */
  const [tableGroupMode, setTableGroupMode] = useState('chunk10')
  const [inviteCopyMsg, setInviteCopyMsg] = useState(null)
  const [newSetModalOpen, setNewSetModalOpen] = useState(false)
  /** 사이드바 세트별 [설정] 모달 — 세트 이름 또는 null */
  const [settingsSetName, setSettingsSetName] = useState(null)
  const saveHintTimerRef = useRef(null)
  const rowSaveToastTimerRef = useRef(null)
  const inviteCopyMsgTimerRef = useRef(null)
  /** Day 단위 강의 영상 URL (저장 전 로컬) — words.youtube_url 일괄 반영 */
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('')
  /** null | 'save' | 'clear' */
  const [dayYoutubeAction, setDayYoutubeAction] = useState(null)

  const { teacher, loading: teacherLoading, refresh: refreshTeacher } = useTeacher()
  const teacherId = teacher?.id
  const academyId = teacher?.academy_id ?? DEFAULT_ACADEMY_ID

  useEffect(() => {
    return () => {
      if (saveHintTimerRef.current) clearTimeout(saveHintTimerRef.current)
      if (rowSaveToastTimerRef.current) clearTimeout(rowSaveToastTimerRef.current)
      if (inviteCopyMsgTimerRef.current) clearTimeout(inviteCopyMsgTimerRef.current)
    }
  }, [])

  const handleCopyInviteCode = async () => {
    const code = String(teacher?.invite_code ?? '').trim()
    if (inviteCopyMsgTimerRef.current) clearTimeout(inviteCopyMsgTimerRef.current)
    if (!code) {
      setInviteCopyMsg('등록된 초대 코드가 없습니다.')
      inviteCopyMsgTimerRef.current = setTimeout(() => setInviteCopyMsg(null), 2500)
      return
    }
    try {
      await navigator.clipboard.writeText(code)
      setInviteCopyMsg('클립보드에 복사했습니다.')
      inviteCopyMsgTimerRef.current = setTimeout(() => setInviteCopyMsg(null), 2000)
    } catch {
      setInviteCopyMsg('복사에 실패했습니다. 코드를 직접 선택해 복사해 주세요.')
      inviteCopyMsgTimerRef.current = setTimeout(() => setInviteCopyMsg(null), 3000)
    }
  }

  const WORDS_CHUNK = 2500

  /** words에 아직 단어가 없는 세트도 사이드바에 표시 (word_sets 기준) */
  const [wordSetNames, setWordSetNames] = useState([])
  /** 세트명 → set_type (word | sentence_writing | sentence_speaking) */
  const [setTypeByName, setSetTypeByName] = useState({})
  /** 세트명 → word_sets.available_modes (요약 표시용) */
  const [availableModesBySetName, setAvailableModesBySetName] = useState({})

  const loadWordSetNames = useCallback(async () => {
    if (!teacherId) {
      setWordSetNames([])
      setSetTypeByName({})
      setAvailableModesBySetName({})
      return
    }
    const { data, error } = await supabase
      .from('word_sets')
      .select('name, set_type, available_modes')
      .eq('teacher_id', teacherId)
    if (error) {
      console.warn('[word_sets]', error.message)
      return
    }
    const typeMap = {}
    const modesMap = {}
    for (const r of data || []) {
      const n = String(r.name || '').trim()
      if (!n) continue
      typeMap[n] = normalizeSetType(r.set_type || 'word')
      modesMap[n] = r.available_modes
    }
    const names = Object.keys(typeMap).sort((a, b) => a.localeCompare(b, 'ko'))
    setWordSetNames(names)
    setSetTypeByName(typeMap)
    setAvailableModesBySetName(modesMap)
  }, [teacherId])

  const loadWords = useCallback(async () => {
    if (teacherLoading) return
    if (!teacherId) {
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
        .select('id, word, meaning, example_sentence, image_url, image_source, set_name, day, difficulty, youtube_url')
        .eq('teacher_id', teacherId)
        .order('set_name', { ascending: true })
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
  }, [teacherLoading, teacherId])

  useEffect(() => {
    void loadWords()
  }, [loadWords])

  useEffect(() => {
    void loadWordSetNames()
  }, [loadWordSetNames])

  const setNames = useMemo(() => {
    const s = new Set()
    for (const w of words) {
      if (w.set_name) s.add(String(w.set_name))
    }
    for (const n of wordSetNames) {
      if (n) s.add(n)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [words, wordSetNames])

  /** 세트명별 개수 — 사이드바에서 set마다 words.filter 반복하지 않도록 한 번에 집계 */
  const setNameCounts = useMemo(() => {
    const m = new Map()
    for (const w of words) {
      const n = String(w.set_name || '')
      if (!n) continue
      m.set(n, (m.get(n) || 0) + 1)
    }
    return m
  }, [words])

  const stats = useMemo(() => {
    const total = words.length
    const noImage = words.filter((w) => !w.image_url || !String(w.image_url).trim()).length
    const noExample = words.filter((w) => !w.example_sentence || !String(w.example_sentence).trim()).length
    return { total, noImage, noExample }
  }, [words])

  /** 선택 세트의 word_sets.set_type — 없으면 word. 전체 보기면 테이블은 classic */
  const tableColumnPreset = useMemo(() => {
    const sn = setFilter.trim()
    if (!sn) return 'classic'
    const t = normalizeSetType(setTypeByName[sn] || 'word')
    if (t === 'sentence_writing' || t === 'sentence_speaking') return 'sentence'
    return 'word'
  }, [setFilter, setTypeByName])

  const hasImageWords = useMemo(
    () => words.some((w) => w.image_url && String(w.image_url).trim()),
    [words],
  )

  const filterOpts = useMemo(
    () => ({ search, setFilter, dayFilter, emptyOnly }),
    [search, setFilter, dayFilter, emptyOnly],
  )

  const filtered = useMemo(() => filterWordRows(words, filterOpts), [words, filterOpts])

  /** 타이핑 시 setWords 업데이터 안에서 매번 전체 words를 다시 필터하지 않도록 캐시 */
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
    if (!setFilter.trim()) return []
    const s = new Set()
    for (const w of words) {
      if (String(w.set_name || '') !== setFilter) continue
      if (w.day != null) s.add(Number(w.day))
    }
    return [...s].sort((a, b) => a - b)
  }, [words, setFilter])

  /** 선택한 세트·DAY에 이미 저장된 유튜브 URL (단어 행 중 하나) */
  const currentDayYoutubeUrl = useMemo(() => {
    if (!setFilter.trim() || dayFilter == null) return ''
    const sn = setFilter.trim()
    const d = Number(dayFilter)
    const rows = words.filter(
      (w) => String(w.set_name || '').trim() === sn && Number(w.day) === d,
    )
    const hit = rows.find((r) => r.youtube_url && String(r.youtube_url).trim())
    return hit ? String(hit.youtube_url).trim() : ''
  }, [words, setFilter, dayFilter])

  useEffect(() => {
    setYoutubeUrlInput(currentDayYoutubeUrl)
  }, [currentDayYoutubeUrl])

  const changeSetFilter = (v) => {
    setSetFilter(v)
    setDayFilter(null)
  }

  const handleSaveDayYoutube = async () => {
    if (!teacherId || !setFilter.trim() || dayFilter == null) return
    const sn = setFilter.trim()
    const d = Number(dayFilter)
    const matching = words.filter(
      (w) => String(w.set_name || '').trim() === sn && Number(w.day) === d,
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
        .eq('set_name', sn)
        .eq('day', d)
      if (error) {
        alert(`저장 실패: ${error.message}`)
        return
      }
      setWords((prev) =>
        prev.map((w) =>
          String(w.set_name || '').trim() === sn && Number(w.day) === d ? { ...w, youtube_url: url } : w,
        ),
      )
      if (saveHintTimerRef.current) clearTimeout(saveHintTimerRef.current)
      setSaveHint(`Day ${d} 영상 URL이 저장되었습니다`)
      saveHintTimerRef.current = setTimeout(() => setSaveHint(null), 3500)
    } finally {
      setDayYoutubeAction(null)
    }
  }

  const handleClearDayYoutube = async () => {
    if (!teacherId || !setFilter.trim() || dayFilter == null) return
    const sn = setFilter.trim()
    const d = Number(dayFilter)
    if (!window.confirm(`Day ${d}의 영상 URL을 모두 지우시겠습니까?`)) return
    setDayYoutubeAction('clear')
    try {
      const { error } = await supabase
        .from('words')
        .update({ youtube_url: null })
        .eq('teacher_id', teacherId)
        .eq('set_name', sn)
        .eq('day', d)
      if (error) {
        alert(`초기화 실패: ${error.message}`)
        return
      }
      setWords((prev) =>
        prev.map((w) =>
          String(w.set_name || '').trim() === sn && Number(w.day) === d ? { ...w, youtube_url: null } : w,
        ),
      )
      setYoutubeUrlInput('')
      if (saveHintTimerRef.current) clearTimeout(saveHintTimerRef.current)
      setSaveHint('삭제되었습니다')
      saveHintTimerRef.current = setTimeout(() => setSaveHint(null), 2500)
    } finally {
      setDayYoutubeAction(null)
    }
  }

  const handleRowDelete = useCallback(async (row) => {
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
    setSaveHint('삭제했습니다.')
    if (saveHintTimerRef.current) clearTimeout(saveHintTimerRef.current)
    saveHintTimerRef.current = setTimeout(() => setSaveHint(null), 2000)
  }, [teacherId])

  const handleDeleteSet = useCallback(
    async (setName) => {
      const sn = String(setName || '').trim()
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

      if (setFilter === sn) {
        setSetFilter('')
        setDayFilter(null)
      }
      setSettingsSetName((prev) => (prev === sn ? null : prev))
      void loadWords()
      void loadWordSetNames()
      setSaveHint('세트가 삭제되었습니다')
      if (saveHintTimerRef.current) clearTimeout(saveHintTimerRef.current)
      saveHintTimerRef.current = setTimeout(() => setSaveHint(null), 2500)
    },
    [teacherId, setFilter, loadWords, loadWordSetNames],
  )

  const flashRowSaveToast = useCallback((ok) => {
    if (rowSaveToastTimerRef.current) clearTimeout(rowSaveToastTimerRef.current)
    setRowSaveToast(ok ? 'success' : 'error')
    rowSaveToastTimerRef.current = setTimeout(() => setRowSaveToast(null), 3200)
  }, [])

  const handleRowCommit = useCallback(async (row) => {
    if (!teacherId) return
    const id = String(row.id)
    const sn = String(row.set_name || '').trim() || String(setFilter || '').trim() || '토익 기본 단어'
    const st = normalizeSetType(setTypeByName[sn] || 'word')
    let word = String(row.word || '').trim()
    const meaning = String(row.meaning || '').trim()
    const ex = String(row.example_sentence || '').trim()
    if (st === 'sentence_writing' || st === 'sentence_speaking') {
      if (!ex || !meaning) return
      if (!word) word = ex.length > 300 ? ex.slice(0, 300) : ex
    } else if (!word || !meaning) {
      return
    }

    const payload = {
      word,
      meaning,
      example_sentence: ex || null,
      set_name: String(row.set_name || '토익 기본 단어').trim() || '토익 기본 단어',
      day: Math.max(1, parseInt(String(row.day ?? 1), 10) || 1),
      difficulty: normalizeWordDifficulty(row?.difficulty),
      image_url: row.image_url ? String(row.image_url).trim() : null,
      image_source: row.image_url ? String(row.image_source || 'none') : 'none',
      youtube_url: row.youtube_url != null && String(row.youtube_url).trim() ? String(row.youtube_url).trim() : null,
    }

    if (id.startsWith('temp-')) {
      const { data, error } = await supabase
        .from('words')
        .upsert(
          {
            ...payload,
            academy_id: academyId,
            teacher_id: teacherId,
          },
          {
            onConflict: 'set_name,word',
            defaultToNull: false,
          },
        )
        .select()
        .single()
      if (error) {
        console.warn(error)
        flashRowSaveToast(false)
        return
      }
      setWords((prev) => prev.map((r) => (String(r.id) === id ? data : r)))
      flashRowSaveToast(true)
    } else {
      const { error } = await supabase.from('words').update(payload).eq('id', id).eq('teacher_id', teacherId)
      if (error) {
        console.warn(error)
        flashRowSaveToast(false)
        return
      }
      flashRowSaveToast(true)
    }
  }, [teacherId, academyId, flashRowSaveToast, setTypeByName, setFilter])

  const addEmptyRow = () => {
    setWords((prev) => [
      {
        id: `temp-${Date.now()}`,
        word: '',
        meaning: '',
        example_sentence: '',
        set_name: setFilter.trim() || '토익 기본 단어',
        day: 1,
        image_url: null,
        image_source: 'none',
        difficulty: 1,
        youtube_url: null,
      },
      ...prev,
    ])
  }

  const autoFillRows =
    selectedIds.size > 0 ? filtered.filter((r) => selectedIds.has(String(r.id))) : filtered

  const handleAutoFilled = async (updated) => {
    if (!teacherId) return
    const map = new Map(updated.map((r) => [String(r.id), r]))
    setWords((prev) => prev.map((r) => map.get(String(r.id)) || r))

    for (const r of updated) {
      const id = String(r.id)
      if (id.startsWith('temp-')) continue
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

  if (teacherLoading) {
    return (
      <div style={{ minHeight: '40vh', padding: '8px 0 24px' }}>
        <p style={{ color: COLORS.textSecondary }}>선생님 정보를 확인하는 중…</p>
      </div>
    )
  }

  if (!teacherId) {
    return (
      <div style={{ minHeight: '40vh', padding: '8px 0 24px' }}>
        <p style={{ color: COLORS.textSecondary }}>
          로그인한 이메일에 해당하는 선생님(teachers 테이블) 정보가 없습니다. Supabase에서 이메일을 등록했는지 확인해 주세요.
        </p>
        <Link href="/teacher/monitor" style={{ color: COLORS.primary, fontSize: 14 }}>
          ← 모니터
        </Link>
      </div>
    )
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/teacher/monitor" style={{ color: COLORS.textOnGreen, fontSize: 14, opacity: 0.95 }}>
            ← 모니터
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>단어 관리</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setNewSetModalOpen(true)}
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
            새 세트 만들기
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
            }}
          >
            가져오기
          </button>
        </div>
      </header>

      <section
        aria-label="학생 초대 코드"
        style={{
          width: '100%',
          maxWidth: '100%',
          margin: '0 0 16px',
          padding: '10px 14px',
          borderRadius: RADIUS.md,
          border: `1px solid ${COLORS.border}`,
          borderLeft: `4px solid #667eea`,
          boxShadow: '0 4px 20px rgba(31, 38, 135, 0.06)',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            justifyContent: 'space-between',
            rowGap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 10,
              minWidth: 0,
              flex: '1 1 240px',
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#374151',
                whiteSpace: 'nowrap',
              }}
            >
              학생 초대 코드
            </span>
            <span
              style={{
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: '0.06em',
                color: COLORS.textPrimary,
                fontFamily: 'ui-monospace, "Cascadia Code", "Segoe UI Mono", monospace',
                lineHeight: 1.2,
                wordBreak: 'break-all',
              }}
            >
              {String(teacher?.invite_code ?? '').trim() || '—'}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => void handleCopyInviteCode()}
              style={{
                padding: '8px 16px',
                borderRadius: RADIUS.md,
                border: 'none',
                background: COLORS.headerGradient,
                color: COLORS.textOnGreen,
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(102, 126, 234, 0.25)',
                whiteSpace: 'nowrap',
              }}
            >
              복사
            </button>
            {inviteCopyMsg ? (
              <span role="status" style={{ fontSize: 13, fontWeight: 600, color: COLORS.accentText }}>
                {inviteCopyMsg}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <MenuSettingsSection
        teacherId={teacherId}
        visibleMenus={teacher?.visible_menus}
        onSaved={() => void refreshTeacher()}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '100%',
          margin: 0,
          display: 'flex',
          gap: 16,
          alignItems: 'flex-start',
        }}
      >
        <aside
          style={{
            width: 260,
            flexShrink: 0,
            padding: 14,
            borderRadius: RADIUS.lg,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
            boxShadow: SHADOW.card,
            maxHeight: 'calc(100vh - 140px)',
            overflow: 'auto',
          }}
        >
          <div style={{ fontWeight: 800, color: COLORS.accentText, marginBottom: 10, fontSize: 15 }}>
            나의 세트 ({setNames.length})
          </div>
          <button
            type="button"
            onClick={() => changeSetFilter('')}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '8px 10px',
              marginBottom: 6,
              borderRadius: RADIUS.sm,
              border: `1px solid ${!setFilter.trim() ? COLORS.primary : COLORS.border}`,
              background: !setFilter.trim() ? COLORS.primarySoft : COLORS.bg,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: !setFilter.trim() ? 700 : 400,
            }}
          >
            전체 보기
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {setNames.map((n) => {
              const cnt = setNameCounts.get(n) || 0
              const active = setFilter === n
              return (
                <div
                  key={n}
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: 6,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => changeSetFilter(n)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${active ? COLORS.primary : COLORS.border}`,
                        background: active ? COLORS.primarySoft : COLORS.bg,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: active ? 700 : 400,
                        boxSizing: 'border-box',
                      }}
                      title={n}
                    >
                      <span
                        style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {n} ({cnt})
                      </span>
                      <span
                        style={{
                          display: 'block',
                          marginTop: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          color: COLORS.textSecondary,
                          lineHeight: 1.35,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                        }}
                      >
                        {n in availableModesBySetName
                          ? formatAvailableModesSummary(
                              availableModesBySetName[n],
                              normalizeSetType(setTypeByName[n] || 'word'),
                            )
                          : '—'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSettingsSetName(n)
                      }}
                      style={{
                        alignSelf: 'stretch',
                        padding: '6px 8px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${COLORS.border}`,
                        background: COLORS.bg,
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 700,
                        color: COLORS.accentText,
                        whiteSpace: 'nowrap',
                      }}
                      title={`「${n}」세트 설정`}
                    >
                      설정 변경
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleDeleteSet(n)
                      }}
                      style={{
                        alignSelf: 'stretch',
                        padding: '6px 8px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${COLORS.danger}`,
                        background: COLORS.dangerBg,
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 700,
                        color: COLORS.danger,
                        whiteSpace: 'nowrap',
                      }}
                      title={`「${n}」세트 전체 삭제 (복구 불가)`}
                    >
                      세트 삭제
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {setFilter.trim() ? (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}` }}>
              <div style={{ fontWeight: 700, color: COLORS.accentText, marginBottom: 8, fontSize: 13 }}>
                Day
              </div>
              <button
                type="button"
                onClick={() => setDayFilter(null)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  marginBottom: 4,
                  borderRadius: RADIUS.sm,
                  border: `1px solid ${dayFilter == null ? COLORS.primary : COLORS.border}`,
                  background: dayFilter == null ? COLORS.primarySoft : COLORS.bg,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                전체 Day
              </button>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {daysInSelectedSet.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDayFilter(d)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${dayFilter === d ? COLORS.primary : COLORS.border}`,
                      background: dayFilter === d ? COLORS.primarySoft : COLORS.bg,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: dayFilter === d ? 700 : 400,
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <div style={{ flex: 1, minWidth: 0, width: '100%', maxWidth: '100%' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          {[
            { label: '전체', value: stats.total, bg: COLORS.primarySoft },
            { label: '이미지 없음', value: stats.noImage, bg: COLORS.warningBg },
            { label: '예문 없음', value: stats.noExample, bg: COLORS.warningBg },
          ].map((c) => (
            <div
              key={c.label}
              style={{
                padding: 16,
                borderRadius: RADIUS.md,
                background: c.bg,
                border: `1px solid ${COLORS.border}`,
                boxShadow: SHADOW.card,
              }}
            >
              <div style={{ fontSize: 13, color: COLORS.textSecondary }}>{c.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: COLORS.accentText }}>{c.value}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            marginBottom: 16,
            padding: 12,
            background: COLORS.surface,
            borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <input
            type="search"
            placeholder="검색 (단어·뜻)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: '1 1 200px',
              padding: '10px 12px',
              borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.border}`,
            }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: COLORS.textSecondary, fontSize: 14 }}>set_name</span>
            <select
              value={setFilter}
              onChange={(e) => changeSetFilter(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                minWidth: 160,
              }}
            >
              <option value="">(전체)</option>
              {setNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={emptyOnly} onChange={(e) => setEmptyOnly(e.target.checked)} />
            <span style={{ fontSize: 14, color: COLORS.textPrimary }}>빈 필드만 보기</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: COLORS.textSecondary, fontSize: 14 }}>목록</span>
            <select
              value={tableGroupMode}
              onChange={(e) => setTableGroupMode(e.target.value)}
              style={{
                padding: '8px 10px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                fontSize: 14,
                minWidth: 140,
              }}
            >
              <option value="none">전체 펼침</option>
              <option value="chunk10">10개씩 접기</option>
            </select>
          </label>
        </div>

        {setFilter.trim() && dayFilter != null ? (
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
                name="day-youtube-url-main"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrlInput}
                onChange={(e) => setYoutubeUrlInput(e.target.value)}
                disabled={dayYoutubeAction != null}
                style={{
                  flex: '1 1 240px',
                  minWidth: 0,
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  borderRadius: RADIUS.sm,
                  border: `1px solid ${COLORS.border}`,
                  fontSize: 14,
                }}
              />
              <button
                type="button"
                disabled={dayYoutubeAction != null}
                onClick={() => void handleSaveDayYoutube()}
                style={{
                  padding: '10px 20px',
                  borderRadius: RADIUS.sm,
                  border: 'none',
                  background: COLORS.headerGradient,
                  color: COLORS.textOnGreen,
                  fontWeight: 700,
                  fontSize: 14,
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
                padding: '8px 14px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.danger}`,
                background: COLORS.dangerBg,
                color: COLORS.danger,
                fontWeight: 700,
                fontSize: 13,
                cursor: dayYoutubeAction != null ? 'wait' : 'pointer',
                marginBottom: 8,
              }}
            >
              {dayYoutubeAction === 'clear' ? '초기화 중…' : '초기화'}
            </button>
            <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5 }}>
              이 DAY에 속한 모든 단어 행의 <code style={{ fontSize: 12 }}>youtube_url</code>에 같은 주소가 저장됩니다. 학생
              앱은 Day당 하나의 영상만 재생합니다.
            </p>
          </div>
        ) : setFilter.trim() && dayFilter == null ? (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: RADIUS.md,
              border: `1px dashed ${COLORS.border}`,
              background: COLORS.bg,
              fontSize: 13,
              color: COLORS.textSecondary,
            }}
          >
            Day를 하나 선택하면 위에서 강의 영상 URL을 지정할 수 있습니다. (전체 Day 보기에서는 Day별 URL 편집을 할 수
            없습니다.)
          </div>
        ) : null}

        {saveHint ? (
          <div
            role="status"
            style={{
              marginBottom: 12,
              padding: '10px 14px',
              borderRadius: RADIUS.md,
              background: COLORS.successBg,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.textPrimary,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {saveHint}
          </div>
        ) : null}

        {rowSaveToast ? (
          <div
            role="status"
            style={{
              marginBottom: 12,
              padding: '10px 14px',
              borderRadius: RADIUS.md,
              border: `1px solid ${rowSaveToast === 'success' ? '#86efac' : COLORS.danger}`,
              background: rowSaveToast === 'success' ? '#ecfdf5' : COLORS.dangerBg,
              color: rowSaveToast === 'success' ? '#15803d' : COLORS.danger,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {rowSaveToast === 'success' ? '저장됐습니다 ✓' : '저장 실패'}
          </div>
        ) : null}

        {loading ? (
          <p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>
        ) : (
          <>
            <p
              style={{
                margin: '0 0 12px',
                fontSize: 13,
                color: COLORS.textSecondary,
                lineHeight: 1.5,
              }}
            >
              단어·뜻·예문 등을 수정한 뒤 각 행 <strong style={{ color: COLORS.textPrimary }}>저장</strong>을 눌러야
              DB에 반영됩니다. (다른 칸으로 포커스를 옮겨도 자동 저장되지 않습니다.) 예문 칸{' '}
              <strong style={{ color: COLORS.textPrimary }}>오른쪽 돋보기</strong> 또는{' '}
              <strong style={{ color: COLORS.textPrimary }}>Ctrl+S</strong>로 AI 예문을 넣을 수 있고, 아래 패널에서
              선택한 행을 한꺼번에 채울 수도 있습니다.
            </p>
            <WordTable
              rows={filtered}
              rowGroupMode={tableGroupMode}
              onRowsChange={handleRowsChange}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              onRowCommit={handleRowCommit}
              showDeleteColumn
              onRowDelete={handleRowDelete}
              columnPreset={tableColumnPreset}
            />
            {loadingMore ? (
              <p style={{ margin: '10px 0 0', fontSize: 13, color: COLORS.textSecondary }}>
                나머지 단어를 불러오는 중… ({words.length}개까지 로드됨)
              </p>
            ) : null}
            <AutoFillPanel rows={autoFillRows} onFilled={handleAutoFilled} />
          </>
        )}
        </div>
      </div>

      <RoutineSettingsSection teacherId={teacherId} setNames={setNames} />

      <BulkImport
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSaved={() => void loadWords()}
        existingSetNames={setNames}
        initialSetName={setFilter}
        teacherId={teacherId}
        academyId={academyId}
        importSetType={
          setFilter.trim() ? setTypeByName[setFilter.trim()] || 'word' : 'word'
        }
      />

      <SetSettingsModal
        open={Boolean(settingsSetName)}
        onClose={() => setSettingsSetName(null)}
        setName={settingsSetName || ''}
        teacherId={teacherId}
        inferredSetType={settingsSetName ? setTypeByName[settingsSetName] || 'word' : 'word'}
        hasImageWords={
          settingsSetName
            ? words.some(
                (w) => String(w.set_name || '') === settingsSetName && w.image_url && String(w.image_url).trim(),
              )
            : false
        }
        onSaved={() => {
          void loadWords()
          void loadWordSetNames()
        }}
      />

      <NewWordSetModal
        open={newSetModalOpen}
        onClose={() => setNewSetModalOpen(false)}
        teacherId={teacherId}
        existingSetNames={setNames}
        hasImageWords={hasImageWords}
        onSaved={({ name, setType }) => {
          setNewSetModalOpen(false)
          const n = String(name || '').trim()
          const st = String(setType || 'word').trim() || 'word'
          if (saveHintTimerRef.current) clearTimeout(saveHintTimerRef.current)
          setSaveHint('세트가 생성됐습니다. 단어를 추가해보세요')
          saveHintTimerRef.current = setTimeout(() => setSaveHint(null), 6000)
          if (n) {
            changeSetFilter(n)
            setWordSetNames((prev) => {
              if (prev.includes(n)) return prev
              return [...prev, n].sort((a, b) => a.localeCompare(b, 'ko'))
            })
            setSetTypeByName((prev) => ({ ...prev, [n]: st }))
          }
          void loadWordSetNames()
          if (n) {
            const q = new URLSearchParams()
            q.set('name', n)
            q.set('type', st)
            router.push(`/teacher/words/create?${q.toString()}`)
          }
        }}
      />
    </div>
  )
}
