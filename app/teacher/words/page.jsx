'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import WordTable from './components/WordTable'
import BulkImport from './components/BulkImport'
import AutoFillPanel from './components/AutoFillPanel'

export default function WordsManagePage() {
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [setFilter, setSetFilter] = useState('')
  const [emptyOnly, setEmptyOnly] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)

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

  const stats = useMemo(() => {
    const total = words.length
    const noImage = words.filter((w) => !w.image_url || !String(w.image_url).trim()).length
    const noExample = words.filter((w) => !w.example_sentence || !String(w.example_sentence).trim()).length
    return { total, noImage, noExample }
  }, [words])

  const filtered = useMemo(() => {
    let list = words
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((w) => {
        const word = String(w.word || '').toLowerCase()
        const meaning = String(w.meaning || '').toLowerCase()
        return word.includes(q) || meaning.includes(q)
      })
    }
    if (setFilter.trim()) {
      list = list.filter((w) => String(w.set_name || '') === setFilter)
    }
    if (emptyOnly) {
      list = list.filter((w) => {
        const m = w.meaning != null ? String(w.meaning).trim() : ''
        const ex = w.example_sentence != null ? String(w.example_sentence).trim() : ''
        const im = w.image_url != null ? String(w.image_url).trim() : ''
        return !m || !ex || !im
      })
    }
    return list
  }, [words, search, setFilter, emptyOnly])

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
      difficulty: row.difficulty != null ? Number(row.difficulty) : null,
      image_url: row.image_url ? String(row.image_url).trim() : null,
      image_source: row.image_url ? String(row.image_source || 'none') : 'none',
    }

    if (id.startsWith('temp-')) {
      const { data, error } = await supabase.from('words').insert(payload).select().single()
      if (error) {
        console.warn(error)
        alert(`추가 실패: ${error.message}`)
        return
      }
      setWords((prev) => prev.map((r) => (String(r.id) === id ? data : r)))
    } else {
      const { error } = await supabase.from('words').update(payload).eq('id', id)
      if (error) {
        console.warn(error)
        alert(`저장 실패: ${error.message}`)
      }
    }
  }

  const addEmptyRow = () => {
    setWords((prev) => [
      {
        id: `temp-${Date.now()}`,
        word: '',
        meaning: '',
        example_sentence: '',
        set_name: '토익 기본 단어',
        day: 1,
        image_url: null,
        image_source: 'none',
        difficulty: null,
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
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
              onChange={(e) => setSetFilter(e.target.value)}
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
        </div>

        {loading ? (
          <p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>
        ) : (
          <>
            <WordTable
              rows={filtered}
              onRowsChange={(next) => {
                const nextById = new Map(next.map((r) => [String(r.id), r]))
                setWords((prev) => prev.map((r) => nextById.get(String(r.id)) ?? r))
              }}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              onRowCommit={handleRowCommit}
            />
            <AutoFillPanel rows={autoFillRows} onFilled={handleAutoFilled} />
          </>
        )}
      </div>

      <BulkImport
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSaved={() => void loadWords()}
        existingSetNames={setNames}
      />
    </div>
  )
}
