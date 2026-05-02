'use client'

import { useState, useMemo } from 'react'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'

/**
 * @param {{
 *   rows: Array<Record<string, unknown>>
 *   onFilled: updatedRows => void | Promise<void>
 *   dayEmptyCount?: number | null
 * }} props
 */
export default function AutoFillPanel({ rows, onFilled, dayEmptyCount = null }) {
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState('')
  const [progress, setProgress] = useState(0)

  const stats = useMemo(() => {
    let noMeaning = 0
    let noExample = 0
    let noImage = 0
    for (const r of rows) {
      const m = r.meaning != null ? String(r.meaning).trim() : ''
      const ex = r.example_sentence != null ? String(r.example_sentence).trim() : ''
      const im = r.image_url != null ? String(r.image_url).trim() : ''
      if (!m) noMeaning += 1
      if (!ex) noExample += 1
      if (!im) noImage += 1
    }
    return { noMeaning, noExample, noImage }
  }, [rows])

  const runAutoFill = async () => {
    if (rows.length === 0 || busy) return
    setBusy(true)
    setProgress(0)
    setLog('시작…')

    const byId = new Map(rows.map((r) => [String(r.id), { ...r }]))
    const needText = rows.filter((r) => {
      const m = r.meaning != null ? String(r.meaning).trim() : ''
      const ex = r.example_sentence != null ? String(r.example_sentence).trim() : ''
      return !m || !ex
    })

    const needImage = rows.filter((r) => {
      const im = r.image_url != null ? String(r.image_url).trim() : ''
      return !im && r.word
    })

    const totalSteps =
      Math.ceil(needText.length / 10) + (needImage.length > 0 ? needImage.length : 0) || 1
    let step = 0

    for (let i = 0; i < needText.length; i += 10) {
      const batch = needText.slice(i, i + 10)
      setLog(`뜻/예문 자동채우기 (배치 ${Math.floor(i / 10) + 1})…`)
      const res = await fetch('/api/autofill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: batch.map((w) => ({
            id: w.id,
            word: w.word,
            meaning: w.meaning,
            example_sentence: w.example_sentence,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok && json.error) {
        setLog(String(json.error))
        alert(String(json.error))
        setBusy(false)
        setProgress(0)
        return
      }
      const filled = json.filled || []
      for (const f of filled) {
        const id = String(f.id)
        const cur = byId.get(id)
        if (!cur) continue
        if (f.meaning != null && String(f.meaning).trim()) cur.meaning = f.meaning
        if (f.example_sentence != null && String(f.example_sentence).trim())
          cur.example_sentence = f.example_sentence
      }
      step += 1
      setProgress(Math.min(99, Math.round((step / totalSteps) * 100)))
    }

    for (const w of needImage) {
      const word = String(w.word || '').trim()
      if (!word) continue
      setLog(`이미지 검색: ${word}`)
      const res = await fetch(`/api/unsplash?q=${encodeURIComponent(word)}`)
      const json = await res.json()
      const photos = json.photos || []
      const first = photos[0]
      if (first?.regular) {
        const id = String(w.id)
        const cur = byId.get(id)
        if (cur) {
          cur.image_url = first.regular
          cur.image_source = 'unsplash'
        }
      }
      step += 1
      setProgress(Math.min(99, Math.round((step / totalSteps) * 100)))
    }

    setProgress(100)
    setLog('완료')
    const updated = rows.map((r) => byId.get(String(r.id)) || r)
    await onFilled(updated)
    setBusy(false)
  }

  if (rows.length === 0) return null

  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.warningBg,
        boxShadow: SHADOW.card,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, color: COLORS.accentText }}>빈 필드</span>
        <span style={{ padding: '4px 10px', borderRadius: RADIUS.sm, background: COLORS.surface }}>
          뜻 없음: <strong>{stats.noMeaning}</strong>
        </span>
        <span style={{ padding: '4px 10px', borderRadius: RADIUS.sm, background: COLORS.surface }}>
          예문 없음: <strong>{stats.noExample}</strong>
        </span>
        <span style={{ padding: '4px 10px', borderRadius: RADIUS.sm, background: COLORS.surface }}>
          이미지 없음: <strong>{stats.noImage}</strong>
        </span>
        {dayEmptyCount != null ? (
          <span style={{ padding: '4px 10px', borderRadius: RADIUS.sm, background: COLORS.surface }}>
            day 비어 있음: <strong>{dayEmptyCount}</strong>
          </span>
        ) : null}
      </div>
      <button
        type="button"
        disabled={busy || (stats.noMeaning === 0 && stats.noExample === 0 && stats.noImage === 0)}
        onClick={() => void runAutoFill()}
        style={{
          padding: '10px 18px',
          borderRadius: RADIUS.md,
          border: 'none',
          background: COLORS.primary,
          color: COLORS.textOnGreen,
          fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.85 : 1,
        }}
      >
        {busy ? '처리 중…' : '빈 필드 자동채우기'}
      </button>
      {busy || progress > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              background: COLORS.primaryLight,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: COLORS.primary,
                transition: 'width 0.2s ease',
              }}
            />
          </div>
          <p style={{ marginTop: 8, fontSize: 13, color: COLORS.textSecondary }}>{log}</p>
        </div>
      ) : null}
    </div>
  )
}
