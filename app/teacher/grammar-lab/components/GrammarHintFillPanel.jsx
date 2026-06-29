'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import {
  fillHintKoForGrammarRows,
  fetchHintKoBatch,
  replayPersistHintKoRecovery,
} from '../utils/grammarHintFill'
import {
  clearHintKoRecoveryEntry,
  loadHintKoRecovery,
  saveHintKoRecoveryEntry,
} from '../utils/grammarHintPersist'

/**
 * @param {{
 *   rows: object[]
 *   onFilled: (rows: object[]) => void | Promise<void>
 *   selectedOnly?: boolean
 *   persistContext?: {
 *     teacherId: string
 *     setName: string
 *     trainingKind: string
 *     onPersistRow: (row: object) => Promise<{ ok?: boolean }>
 *   }
 * }} props
 */
export default function GrammarHintFillPanel({ rows, onFilled, selectedOnly = false, persistContext }) {
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState('')
  const [progress, setProgress] = useState(0)
  const [failedIds, setFailedIds] = useState(() => new Set())
  const [persistFailedIds, setPersistFailedIds] = useState(() => new Set())
  const [recoveryCount, setRecoveryCount] = useState(0)

  const refreshRecoveryCount = useCallback(() => {
    if (!persistContext?.teacherId) {
      setRecoveryCount(0)
      return
    }
    setRecoveryCount(loadHintKoRecovery(persistContext.teacherId, persistContext.setName).length)
  }, [persistContext?.teacherId, persistContext?.setName])

  useEffect(() => {
    refreshRecoveryCount()
  }, [refreshRecoveryCount, rows])

  const stats = useMemo(() => {
    let missing = 0
    for (const r of rows) {
      const ex = String(r.example_sentence ?? '').trim()
      const m = String(r.meaning ?? '').trim()
      if (ex && !m) missing += 1
    }
    return { missing }
  }, [rows])

  const buildPersistOptions = useCallback(() => {
    if (!persistContext?.onPersistRow) return {}
    const { teacherId, setName, onPersistRow } = persistContext
    return {
      onPersistRow,
      onRecoverySaved: (row) => saveHintKoRecoveryEntry(teacherId, setName, row),
      onRecoveryCleared: (rowId) => clearHintKoRecoveryEntry(teacherId, setName, rowId),
    }
  }, [persistContext])

  const runFill = async (targetRows) => {
    if (!targetRows.length || busy) return
    setBusy(true)
    setProgress(0)
    setLog('시작…')
    try {
      const { updatedRows, filled, saved, failedIds: failed, persistFailedIds: persistFailed } =
        await fillHintKoForGrammarRows(
          targetRows,
          (p) => {
            setLog(p.log)
            if (p.total) setProgress(Math.min(99, Math.round((p.current / p.total) * 100)))
          },
          buildPersistOptions(),
        )
      setProgress(100)
      const savedMsg = persistContext ? ` · DB 저장 ${saved}건` : ''
      setLog(filled > 0 ? `완료 · AI ${filled}건${savedMsg}` : '완료')
      setFailedIds(new Set(failed))
      setPersistFailedIds(new Set(persistFailed))
      refreshRecoveryCount()
      const map = new Map(updatedRows.map((r) => [String(r.id), r]))
      const merged = rows.map((r) => map.get(String(r.id)) || r)
      await onFilled(merged)
      if (failed.length || persistFailed.length) {
        alert(
          `hint_ko AI ${filled}건 · DB 저장 ${saved}건 · AI 실패 ${failed.length}건 · 저장 실패 ${persistFailed.length}건`,
        )
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
      const { filled, error } = await fetchHintKoBatch([
        { id: String(row.id), sentence_text, hint_ko: null },
      ])
      if (error) {
        alert('hint_ko 요청 실패: ' + error)
        setFailedIds((prev) => new Set(prev).add(String(row.id)))
        return
      }
      const hit = filled.find((f) => String(f.id) === String(row.id))
      if (!hit?.hint_ko) {
        alert('hint_ko를 받지 못했습니다.')
        setFailedIds((prev) => new Set(prev).add(String(row.id)))
        return
      }
      let mergedRow = { ...row, meaning: hit.hint_ko }
      if (persistContext?.onPersistRow) {
        const result = await persistContext.onPersistRow(mergedRow)
        if (result?.ok) {
          clearHintKoRecoveryEntry(persistContext.teacherId, persistContext.setName, row.id)
        } else {
          saveHintKoRecoveryEntry(persistContext.teacherId, persistContext.setName, mergedRow)
          setPersistFailedIds((prev) => new Set(prev).add(String(row.id)))
        }
        refreshRecoveryCount()
      }
      setFailedIds((prev) => {
        const next = new Set(prev)
        next.delete(String(row.id))
        return next
      })
      const merged = rows.map((r) => (String(r.id) === String(row.id) ? mergedRow : r))
      await onFilled(merged)
      setLog('재시도 완료')
    } catch (e) {
      alert('재시도 실패: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const replayRecovery = async () => {
    if (!persistContext?.onPersistRow || !persistContext.teacherId || busy) return
    const entries = loadHintKoRecovery(persistContext.teacherId, persistContext.setName)
    if (!entries.length) {
      alert('복구할 미저장 결과가 없습니다.')
      return
    }
    setBusy(true)
    setLog('미저장 결과 복구 중…')
    try {
      const { updatedRows, saved, failedIds: failed } = await replayPersistHintKoRecovery(
        rows,
        entries,
        persistContext.onPersistRow,
        (p) => {
          setLog(p.log)
          if (p.total) setProgress(Math.min(99, Math.round((p.current / p.total) * 100)))
        },
      )
      for (const entry of entries) {
        if (!failed.includes(String(entry.id))) {
          clearHintKoRecoveryEntry(persistContext.teacherId, persistContext.setName, entry.id)
        }
      }
      refreshRecoveryCount()
      setProgress(100)
      setLog(`복구 완료 · ${saved}건 저장`)
      const map = new Map(updatedRows.map((r) => [String(r.id), r]))
      await onFilled(rows.map((r) => map.get(String(r.id)) || r))
      if (failed.length) alert(`복구 ${saved}건 · 실패 ${failed.length}건`)
    } catch (e) {
      alert('복구 실패: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  if (!rows.length) return null

  const failedRows = rows.filter((r) => failedIds.has(String(r.id)) || persistFailedIds.has(String(r.id)))

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
        {recoveryCount > 0 ? (
          <span
            style={{
              padding: '4px 10px',
              borderRadius: RADIUS.sm,
              background: '#fef3c7',
              color: '#92400e',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            미저장 {recoveryCount}건
          </span>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: busy || log ? 10 : 0 }}>
        <button
          type="button"
          disabled={busy || stats.missing === 0}
          onClick={() =>
            void runFill(rows.filter((r) => String(r.example_sentence ?? '').trim() && !String(r.meaning ?? '').trim()))
          }
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
        {recoveryCount > 0 && persistContext ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void replayRecovery()}
            style={{
              padding: '10px 18px',
              borderRadius: RADIUS.md,
              border: '1px solid #f59e0b',
              background: '#fffbeb',
              color: '#92400e',
              fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            💾 미저장 결과 다시 저장 ({recoveryCount})
          </button>
        ) : null}
      </div>

      {(busy || progress > 0) && log ? (
        <>
          <div
            style={{
              marginTop: 8,
              height: 8,
              borderRadius: 999,
              background: '#e2e8f0',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: COLORS.primary,
                transition: 'width 0.2s ease',
              }}
            />
          </div>
          <p style={{ marginTop: 8, fontSize: 13, color: COLORS.textSecondary }}>{log}</p>
        </>
      ) : null}

      {failedRows.length > 0 ? (
        <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13 }}>
          {failedRows.slice(0, 8).map((r) => {
            const label = String(r.example_sentence ?? '').trim().split('\n')[0]
            const short = label.length > 48 ? `${label.slice(0, 48)}…` : label
            const isPersistFail = persistFailedIds.has(String(r.id))
            return (
              <li
                key={String(r.id)}
                style={{ marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
              >
                <span style={{ color: '#b91c1c' }}>
                  {short || '(예문 없음)'}
                  {isPersistFail ? ' · 저장 실패' : ''}
                </span>
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
