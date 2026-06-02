'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS } from '@/utils/tokens'

function tokenizeWordsWithSpans(sentence) {
  const text = String(sentence || '')
  const re = /\S+/g
  const out = []
  let m
  let idx = 0
  while ((m = re.exec(text)) !== null) {
    out.push({ index: idx, text: m[0], start: m.index, end: m.index + m[0].length })
    idx += 1
  }
  return out
}

const btnStyle = {
  padding: '10px 18px',
  borderRadius: RADIUS.md,
  border: 'none',
  background: COLORS.primary,
  color: COLORS.textOnGreen,
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
}

const TOKEN_STYLE = {
  default: { border: '1px solid #e2e8f0', background: '#f8fafc' },
  dragging: { border: '2px solid #6366f1', background: '#c7d2fe' },
  overlap: { border: '2px solid #ef4444', background: '#fecaca' },
  inBox: { border: '1px solid #86efac', background: '#bbf7d0' },
}

/**
 * @param {{
 *   open: boolean
 *   item: { id: string, sentence_text: string } | null
 *   navItems: { id: string, sentence_text: string }[]
 *   queueMeta: { incompleteRemaining: number, totalSentences: number, navIndex: number }
 *   onClose: () => void
 *   onSaved: () => Promise<{ navItems: { id: string, sentence_text: string }[], incompleteItems: { id: string, sentence_text: string }[] } | void>
 *   onNavigateToItem: (item: { id: string, sentence_text: string }) => void
 * }} props
 */
export default function BoxAnswerModal({
  open,
  item,
  navItems = [],
  queueMeta = { incompleteRemaining: 0, totalSentences: 0, navIndex: 0 },
  onClose,
  onSaved,
  onNavigateToItem,
}) {
  const [boxes, setBoxes] = useState([])
  const [dragStart, setDragStart] = useState(null)
  const [dragEnd, setDragEnd] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [overlapWarn, setOverlapWarn] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState(null)
  const [hoveredTokenIdx, setHoveredTokenIdx] = useState(null)
  const tokenContainerRef = useRef(null)

  const sentence = item?.sentence_text || ''
  const tokens = tokenizeWordsWithSpans(sentence)

  const loadBoxes = useCallback(async () => {
    if (!item?.id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('box_drill_answers')
      .select('box_index, start_char, end_char, chunk_label')
      .eq('item_id', item.id)
      .order('box_index')
    setLoading(false)
    if (error) {
      setStatusMsg('박스 불러오기 실패: ' + error.message)
      return
    }
    setBoxes(
      (data || []).map((b) => ({
        start: b.start_char,
        end: b.end_char,
        chunk_label: b.chunk_label,
      })),
    )
  }, [item?.id])

  useEffect(() => {
    if (!open || !item?.id) return
    setDragStart(null)
    setDragEnd(null)
    setIsDragging(false)
    setOverlapWarn(false)
    setStatusMsg(null)
    setHoveredTokenIdx(null)
    void loadBoxes()
  }, [open, item?.id, loadBoxes])

  const inBox = useCallback(
    (idx) => {
      const t = tokens[idx]
      if (!t) return false
      return boxes.some((b) => t.start >= b.start && t.end <= b.end)
    },
    [tokens, boxes],
  )

  const rangeHasOverlap = useCallback(
    (lo, hi) => {
      for (let i = lo; i <= hi; i++) {
        if (inBox(i)) return true
      }
      return false
    },
    [inBox],
  )

  const isInPreviewRange = useCallback(
    (idx) => {
      if (!isDragging || dragStart == null || dragEnd == null) return false
      const lo = Math.min(dragStart, dragEnd)
      const hi = Math.max(dragStart, dragEnd)
      return idx >= lo && idx <= hi
    },
    [isDragging, dragStart, dragEnd],
  )

  const previewRangeOverlap = useCallback(() => {
    if (!isDragging || dragStart == null || dragEnd == null) return false
    const lo = Math.min(dragStart, dragEnd)
    const hi = Math.max(dragStart, dragEnd)
    return rangeHasOverlap(lo, hi)
  }, [isDragging, dragStart, dragEnd, rangeHasOverlap])

  const commitRange = useCallback(
    (lo, hi) => {
      if (lo == null || hi == null) return false
      const startIdx = Math.min(lo, hi)
      const endIdx = Math.max(lo, hi)
      if (rangeHasOverlap(startIdx, endIdx)) {
        setOverlapWarn(true)
        window.setTimeout(() => setOverlapWarn(false), 1600)
        return false
      }
      const start = tokens[startIdx].start
      const end = tokens[endIdx].end
      setBoxes((prev) =>
        [...prev, { start, end, chunk_label: null }].sort((a, b) => a.start - b.start),
      )
      setDragStart(null)
      setDragEnd(null)
      setIsDragging(false)
      setStatusMsg(null)
      return true
    },
    [tokens, rangeHasOverlap],
  )

  const persistBoxes = useCallback(async () => {
    if (!item?.id) return { ok: false, reason: 'no-item' }
    if (!boxes.length) return { ok: true, skipped: true }
    setSaving(true)
    setStatusMsg(null)
    await supabase.from('box_drill_answers').delete().eq('item_id', item.id)
    const rows = boxes.map((b, i) => ({
      item_id: item.id,
      box_index: i,
      start_char: b.start,
      end_char: b.end,
      chunk_label: b.chunk_label ?? null,
    }))
    const { error } = await supabase.from('box_drill_answers').insert(rows)
    setSaving(false)
    if (error) {
      setStatusMsg('저장 실패: ' + error.message)
      return { ok: false, reason: 'save-error' }
    }
    return { ok: true }
  }, [item?.id, boxes])

  const navigateByOffset = useCallback(
    async (offset) => {
      if (saving || !item?.id) return
      const currentIdx = navItems.findIndex((n) => n.id === item.id)
      if (currentIdx < 0) return
      const targetIdx = currentIdx + offset
      if (targetIdx < 0 || targetIdx >= navItems.length) return

      const saveResult = await persistBoxes()
      if (!saveResult.ok) return

      if (onSaved) await onSaved()
      onNavigateToItem(navItems[targetIdx])
    },
    [saving, item?.id, navItems, persistBoxes, onSaved, onNavigateToItem],
  )

  const handleSaveAndClose = async () => {
    if (!boxes.length) {
      setStatusMsg('박스 1개 이상 필요합니다.')
      return
    }
    const saveResult = await persistBoxes()
    if (!saveResult.ok) return
    if (onSaved) await onSaved()
    onClose()
  }

  const handleSaveAndNextIncomplete = async () => {
    if (!boxes.length) {
      setStatusMsg('박스 1개 이상 필요합니다.')
      return
    }
    const saveResult = await persistBoxes()
    if (!saveResult.ok) return

    let fresh = null
    if (onSaved) fresh = await onSaved()

    const incomplete = fresh?.incompleteItems || []
    const navIdx = (fresh?.navItems || navItems).findIndex((n) => n.id === item.id)
    const navList = fresh?.navItems || navItems

    let next =
      navList.slice(navIdx + 1).find((n) => incomplete.some((i) => i.id === n.id)) ||
      incomplete.find((n) => n.id !== item.id) ||
      null

    if (next) {
      onNavigateToItem(next)
      return
    }
    setStatusMsg('미완료 문장이 없습니다. 저장 완료!')
  }

  const getTokenIndexFromEvent = useCallback(
    (clientX, clientY) => {
      const el = document.elementFromPoint(clientX, clientY)
      if (!el) return null
      const btn = el.closest('[data-token-idx]')
      if (!btn || !tokenContainerRef.current?.contains(btn)) return null
      const idx = parseInt(btn.getAttribute('data-token-idx'), 10)
      return Number.isFinite(idx) ? idx : null
    },
    [],
  )

  useEffect(() => {
    if (!open || !isDragging) return

    const onMove = (e) => {
      const idx = getTokenIndexFromEvent(e.clientX, e.clientY)
      if (idx == null || inBox(idx)) return
      setDragEnd(idx)
    }

    const onUp = (e) => {
      const idx = getTokenIndexFromEvent(e.clientX, e.clientY)
      const endIdx = idx != null && !inBox(idx) ? idx : dragEnd
      if (dragStart != null && endIdx != null) {
        commitRange(dragStart, endIdx)
      }
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [open, isDragging, dragStart, dragEnd, getTokenIndexFromEvent, inBox, commitRange])

  useEffect(() => {
    if (!open) return

    const onKey = (e) => {
      const tag = document.activeElement?.tagName || ''
      const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)

      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      if (e.key === 'ArrowLeft' && !inField) {
        e.preventDefault()
        e.stopPropagation()
        void navigateByOffset(-1)
        return
      }

      if (e.key === 'ArrowRight' && !inField) {
        e.preventDefault()
        e.stopPropagation()
        void navigateByOffset(1)
        return
      }

      if (e.key === 'Backspace' && !inField) {
        e.preventDefault()
        e.stopPropagation()
        setBoxes((p) => p.slice(0, -1))
      }
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose, navigateByOffset])

  const handleTokenPointerDown = (e, i) => {
    if (inBox(i)) return
    e.preventDefault()
    setIsDragging(true)
    setDragStart(i)
    setDragEnd(i)
  }

  const getTokenStyle = (i) => {
    if (inBox(i)) return TOKEN_STYLE.inBox
    const preview = isInPreviewRange(i)
    if (preview && previewRangeOverlap()) return TOKEN_STYLE.overlap
    if (preview) return TOKEN_STYLE.dragging
    if (hoveredTokenIdx === i) return { border: '1px solid #cbd5e1', background: '#e2e8f0' }
    return TOKEN_STYLE.default
  }

  const getTokenCursor = (i) => {
    if (inBox(i)) return 'default'
    if (isDragging) return 'grabbing'
    return 'grab'
  }

  if (!open || !item) return null

  const hasOverlapPreview = previewRangeOverlap()

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 680,
          maxHeight: '90vh',
          overflow: 'auto',
          background: COLORS.surface,
          borderRadius: RADIUS.lg,
          padding: 20,
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>박스 정답 입력</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: COLORS.textSecondary }}>
              {queueMeta.navIndex > 0 ? `${queueMeta.navIndex}번째 문장 · ` : ''}
              미완료 {queueMeta.incompleteRemaining} / 전체 {queueMeta.totalSentences}문장
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        {!loading && boxes.length === 0 && tokens.length > 0 ? (
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: RADIUS.md,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              fontSize: 14,
              fontWeight: 700,
              color: '#1d4ed8',
              lineHeight: 1.45,
            }}
          >
            💡 단어를 드래그하면 박스가 만들어져요. 한 단어만 클릭해도 박스가 돼요.
          </div>
        ) : null}

        <p style={{ fontSize: 14, color: COLORS.textSecondary, margin: '12px 0 0', lineHeight: 1.5 }}>{sentence}</p>

        {loading ? (
          <p style={{ marginTop: 16, color: COLORS.textSecondary }}>불러오는 중…</p>
        ) : tokens.length > 0 ? (
          <div
            ref={tokenContainerRef}
            style={{ margin: '16px 0', lineHeight: 2.4, userSelect: 'none', cursor: isDragging ? 'grabbing' : undefined }}
          >
            {tokens.map((t, i) => {
              const ts = getTokenStyle(i)
              return (
                <button
                  key={i}
                  type="button"
                  data-token-idx={i}
                  disabled={inBox(i)}
                  onPointerDown={(e) => handleTokenPointerDown(e, i)}
                  onMouseEnter={() => {
                    if (!inBox(i)) setHoveredTokenIdx(i)
                  }}
                  onMouseLeave={() => {
                    setHoveredTokenIdx((prev) => (prev === i ? null : prev))
                  }}
                  style={{
                    margin: 2,
                    padding: '4px 8px',
                    borderRadius: 8,
                    border: ts.border,
                    background: ts.background,
                    cursor: getTokenCursor(i),
                    fontWeight: 600,
                    touchAction: 'none',
                  }}
                >
                  {t.text}
                </button>
              )
            })}
          </div>
        ) : null}

        {overlapWarn || hasOverlapPreview ? (
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
            {overlapWarn ? '겹치는 구간은 박스로 만들 수 없습니다.' : '선택 구간이 기존 박스와 겹칩니다.'}
          </p>
        ) : null}

        <p style={{ fontSize: 12, color: COLORS.textSecondary, margin: '0 0 12px' }}>
          단어 드래그로 박스 만들기 · Backspace = 마지막 삭제 · ←/→ = 이전/다음(자동 저장) · Esc = 닫기
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button type="button" onClick={() => setBoxes((p) => p.slice(0, -1))} style={{ ...btnStyle, background: '#64748b' }}>
            마지막 삭제
          </button>
        </div>

        {boxes.length > 0 ? (
          <ul style={{ fontSize: 14, marginBottom: 16, paddingLeft: 18 }}>
            {boxes.map((b, i) => (
              <li key={i}>
                <span style={{ color: '#059669', fontWeight: 700 }}>박스 {i + 1}</span> — {sentence.slice(b.start, b.end)}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 16 }}>만든 박스가 없습니다.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" onClick={() => void handleSaveAndClose()} disabled={saving} style={{ ...btnStyle, width: '100%' }}>
            {saving ? '저장 중…' : '박스 정답 저장'}
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAndNextIncomplete()}
            disabled={saving || queueMeta.incompleteRemaining <= 0}
            style={{
              ...btnStyle,
              width: '100%',
              background: '#6366f1',
              opacity: queueMeta.incompleteRemaining <= 0 ? 0.5 : 1,
            }}
          >
            {saving ? '저장 중…' : '다음 미완료 문장 →'}
          </button>
        </div>

        {statusMsg ? <p style={{ marginTop: 12, fontSize: 14, color: '#b91c1c' }}>{statusMsg}</p> : null}
      </div>
    </div>
  )
}
