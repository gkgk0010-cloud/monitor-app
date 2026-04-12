'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import WordTable from './components/WordTable'
import BulkImport from './components/BulkImport'
import AutoFillPanel from './components/AutoFillPanel'
import { normalizeWordDifficulty } from './utils/parsers'
import { filterWordRows } from './utils/wordFilters'

export default function WordsManagePage() {
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [setFilter, setSetFilter] = useState('')
  /** 세트 선택 후 day만 보기 (null = 전체 day) */
  const [dayFilter, setDayFilter] = useState(null)
  const [emptyOnly, setEmptyOnly] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [saveHint, setSaveHint] = useState(null)
  /** 테이블 접기: 10개 단위 (Day는 사이드바에서 이미 필터) */
  const [tableGroupMode, setTableGroupMode] = useState('none')
  const saveHintTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (saveHintTimerRef.current) clearTimeout(saveHintTimerRef.current)
    }
  }, [])

  const loadWords = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('words')
      .select('id, word, meaning, example_sentence, image_url, image_source, set_name, day, difficulty')
      .order('set_name', { ascending: true })
      .order('day', { ascending: true })

    if (error) {
      console.warn(error)
      alert(`단어 로드 실패: ${error.message}`)
      setWords([])
    } else {
      setWords(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadWords()
  }, [loadWords])

  const setNames = useMemo(() => {
    const s = new Set()
    for (const w of words) {
      if (w.set_name) s.add(String(w.set_name))
    }
    return [...s].sort()
  }, [words])

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

  const filterOpts = useMemo(
    () => ({ search, setFilter, dayFilter, emptyOnly }),
    [search, setFilter, dayFilter, emptyOnly],
  )

  const filtered = useMemo(() => filterWordRows(words, filterOpts), [words, filterOpts])

  /** 타이핑 시 setWords 업데이터 안에서 매번 전체 words를 다시 필터하지 않도록 캐시 */
  const wordsRef = useRef(words)
  const filteredRef = useRef(filtered)
  wordsRef.current = words
  filteredRef.current = filtered

  const daysInSelectedSet = useMemo(() => {
    if (!setFilter.trim()) return []
    const s = new Set()
    for (const w of words) {
      if (String(w.set_name || '') !== setFilter) continue
      if (w.day != null) s.add(Number(w.day))
    }
    return [...s].sort((a, b) => a - b)
  }, [words, setFilter])

  const changeSetFilter = (v) => {
    setSetFilter(v)
    setDayFilter(null)
  }

  const handleRowDelete = async (row) => {
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
    const { error } = await supabase.from('words').delete().eq('id', id)
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
  }

  const handleRowCommit = async (row) => {
    const id = String(row.id)
    const word = String(row.word || '').trim()
    const meaning = String(row.meaning || '').trim()
    if (!word || !meaning) return

    const payload = {
      word,
      meaning,
      example_sentence: String(row.example_sentence || '').trim() || null,
      set_name: String(row.set_name || '토익 기본 단어').trim() || '토익 기본 단어',
      day: Math.max(1, parseInt(String(row.day ?? 1), 10) || 1),
      difficulty: normalizeWordDifficulty(row?.difficulty),
      image_url: row.image_url ? String(row.image_url).trim() : null,
      image_source: row.image_url ? String(row.image_source || 'none') : 'none',
    }

    if (id.startsWith('temp-')) {
      const { data, error } = await supabase
        .from('words')
        .upsert(payload, {
          onConflict: 'set_name,word',
          defaultToNull: false,
        })
        .select()
        .single()
      if (error) {
        console.warn(error)
        alert(`추가 실패: ${error.message}`)
        return
      }
      setWords((prev) => prev.map((r) => (String(r.id) === id ? data : r)))
      if (saveHintTimerRef.current) clearTimeout(saveHintTimerRef.current)
      setSaveHint('저장했습니다. (같은 세트에 같은 영단어가 이미 있으면 그 행을 덮어씁니다)')
      saveHintTimerRef.current = setTimeout(() => setSaveHint(null), 3000)
    } else {
      const { error } = await supabase.from('words').update(payload).eq('id', id)
      if (error) {
        console.warn(error)
        alert(`저장 실패: ${error.message}`)
        return
      }
      if (saveHintTimerRef.current) clearTimeout(saveHintTimerRef.current)
      setSaveHint('저장했습니다.')
      saveHintTimerRef.current = setTimeout(() => setSaveHint(null), 2500)
    }
  }

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
      },
      ...prev,
    ])
  }

  const autoFillRows =
    selectedIds.size > 0 ? filtered.filter((r) => selectedIds.has(String(r.id))) : filtered

  const handleAutoFilled = async (updated) => {
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
      if (error) console.warn('[words] autofill save', error.message)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, padding: '20px 16px 40px' }}>
      <header
        style={{
          maxWidth: 1100,
          margin: '0 auto 20px',
          padding: '16px 20px',
          borderRadius: RADIUS.lg,
          background: COLORS.headerGradient,
          color: COLORS.textOnGreen,
          boxShadow: SHADOW.card,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/teacher/monitor" style={{ color: COLORS.textOnGreen, fontSize: 14, opacity: 0.95 }}>
            ← 모니터
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>단어 관리</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link
            href="/teacher/words/create"
            style={{
              padding: '10px 16px',
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.textOnGreen}`,
              color: COLORS.textOnGreen,
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            새 세트 만들기
          </Link>
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

      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
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
                <button
                  key={n}
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
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={n}
                >
                  {n} ({cnt})
                </button>
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

        <div style={{ flex: 1, minWidth: 0, maxWidth: 900 }}>
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
              예문은 탭만 바꾼다고 자동 입력되지 않습니다. 예문 칸{' '}
              <strong style={{ color: COLORS.textPrimary }}>안 오른쪽 돋보기</strong>를 누르거나{' '}
              <strong style={{ color: COLORS.textPrimary }}>Ctrl+S</strong>(예문 칸에 포커스)로 AI 예문을 넣을 수
              있고, 아래 패널에서 선택한 행을 한꺼번에 채울 수도 있습니다.
            </p>
            <WordTable
              rows={filtered}
              rowGroupMode={tableGroupMode}
              onRowsChange={(next) => {
                setWords((prev) => {
                  const prevFiltered = Object.is(prev, wordsRef.current)
                    ? filteredRef.current
                    : filterWordRows(prev, filterOpts)
                  const merged =
                    typeof next === 'function' ? next(prevFiltered) : next
                  const nextById = new Map(merged.map((r) => [String(r.id), r]))
                  return prev.map((r) => nextById.get(String(r.id)) ?? r)
                })
              }}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              onRowCommit={handleRowCommit}
              showDeleteColumn
              onRowDelete={handleRowDelete}
            />
            <AutoFillPanel rows={autoFillRows} onFilled={handleAutoFilled} />
          </>
        )}
        </div>
      </div>

      <BulkImport
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSaved={() => void loadWords()}
        existingSetNames={setNames}
        initialSetName={setFilter}
      />
    </div>
  )
}
