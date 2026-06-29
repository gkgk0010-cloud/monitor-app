'use client'

import { useMemo, useState } from 'react'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import { fillHintKoForGrammarRows, fetchHintKoBatch } from '../utils/grammarHintFill'

/**
 * @param {{
 *   rows: object[]
 *   onFilled: (rows: object[]) => void | Promise<void>
 *   selectedOnly?: boolean
 * }} props
 */
export default function GrammarHintFillPanel({ rows, onFilled, selectedOnly = false }) {
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState('')
  const [progress, setProgress] = useState(0)
  const [failedIds, setFailedIds] = useState(() => new Set())

  const stats = useMemo(() => {
    let missing = 0
    for (const r of rows) {
      const ex = String(r.example_sentence ?? '').trim()
      const m = String(r.meaning ?? '').trim()
      if (ex && !m) missing += 1
    }
    return { missing }
  }, [rows])

  const runFill = async (targetRows) => {
    if (!targetRows.length || busy) return
    setBusy(true)
    setProgress(0)
    setLog('시작…')
    try {
      const { updatedRows, filled, failedIds: failed } = await fillHintKoForGrammarRows(
        targetRows,
        (p) => {
          setLog(p.log)
          if (p.total) setProgress(Math.min(99, Math.round((p.current / p.total) * 100)))
        },
      )
      setProgress(100)
      setLog(filled > 0 ? `완료 · ${filled}건 채움` : '완료')
      setFailedIds(new Set(failed))
      const map = new Map(updatedRows.map((r) => [String(r.id), r]))
      const merged = rows.map((r) => map.get(String(r.id)) || r)
      await onFilled(merged)
      if (failed.length) {
        alert(`hint_ko ${filled}건 채움 · ${failed.length}건 실패 (재시도 버튼 사용)`)
      }
    } catch (e) {
      setLog(String(e?.message || e))
      alert('AI 자동 채우기 실패: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const retryOne = async (row) => {
    if (busy || !row) return
    setBusy(true)
    setLog('재시도…')
    try {
      const sentence_text = String(row.example_sentence ?? '').trim().split('\n')[0]
      const { filled } = await fetchHintKoBatch([
        { id: String(row.id), sentence_text, hint_ko: null },
      ])
      const hit = filled.find((f) => String(f.id) === String(row.id))
      if (!hit?.hint_ko) {
        alert('hint_ko를 받지 못했습니다.')
        setFailedIds((prev) => new Set(prev).add(String(row.id)))
        return
      }
      setFailedIds((prev) => {
        const next = new Set(prev)
        next.delete(String(row.id))
        return next
      })
      const merged = rows.map((r) =>
        String(r.id) === String(row.id) ? { ...r, meaning: hit.hint_ko } : r,
      )
      await onFilled(merged)
      setLog('재시도 완료')
    } catch (e) {
      alert('재시도 실패: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  if (!rows.length) return null

  const failedRows = rows.filter((r) => failedIds.has(String(r.id)))

  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: RADIUS.lg,
        border: `1px solid ${stats.missing > 0 ? '#fecaca' : COLORS.border}`,
        background: stats.missing > 0 ? 'rgba(254,226,226,0.35)' : COLORS.warningBg,
        boxShadow: SHADOW.card,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, color: COLORS.accentText }}>hint_ko (해석)</span>
        {stats.missing > 0 ? (
          <span
            style={{
              padding: '4px 10px',
              borderRadius: RADIUS.sm,
              background: '#ef4444',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            누락 {stats.missing}건
          </span>
        ) : (
          <span style={{ padding: '4px 10px', borderRadius: RADIUS.sm, background: COLORS.surface }}>
            모두 채움
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={busy || stats.missing === 0}
        onClick={() => void runFill(rows.filter((r) => String(r.example_sentence ?? '').trim() && !String(r.meaning ?? '').trim()))}
        style={{
          padding: '10px 18px',
          borderRadius: RADIUS.md,
          border: 'none',
          background: COLORS.primary,
          color: COLORS.textOnGreen,
          fontWeight: 700,
          cursor: busy || stats.missing === 0 ? 'not-allowed' : 'pointer',
          opacity: busy || stats.missing === 0 ? 0.7 : 1,
        }}
      >
        {busy ? '처리 중…' : '✨ AI 자동 채우기 (hint_ko)'}
      </button>
      {(busy || progress > 0) && log ? (
        <p style={{ marginTop: 10, fontSize: 13, color: COLORS.textSecondary }}>{log}</p>
      ) : null}
      {failedRows.length > 0 ? (
        <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13 }}>
          {failedRows.slice(0, 8).map((r) => {
            const label = String(r.example_sentence ?? '').trim().split('\n')[0]
            const short = label.length > 48 ? `${label.slice(0, 48)}…` : label
            return (
              <li key={String(r.id)} style={{ marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: '#b91c1c' }}>{short || '(예문 없음)'}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void retryOne(r)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: RADIUS.sm,
                    border: '1px solid #ef4444',
                    background: '#fff',
                    color: '#b91c1c',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  재시도
                </button>
              </li>
            )
          })}
          {failedRows.length > 8 ? (
            <li style={{ color: COLORS.textSecondary }}>… 외 {failedRows.length - 8}건</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
