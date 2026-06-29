'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS } from '@/utils/tokens'
import { ROLE_HINT_SUGGESTIONS } from '../utils/slotDrillMode'
import { normalizeBoxSpan, tokenizeWordsWithSpans } from '../utils/boxSpanUtils'

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

const STICKY_HEADER_STYLE = {
  position: 'sticky',
  top: 0,
  zIndex: 10,
  background: '#ffffff',
  borderBottom: `1px solid ${COLORS.border}`,
  paddingBottom: 12,
  marginBottom: 0,
  flexShrink: 0,
}

/**
 * @param {{
 *   open: boolean
 *   item: { id: string, sentence_text: string, hint_ko?: string } | null
 *   navItems: { id: string, sentence_text: string, hint_ko?: string }[]
 *   queueMeta: { incompleteRemaining: number, totalSentences: number, navIndex: number }
 *   onClose: () => void
 *   onSaved: () => Promise<{ navItems: { id: string, sentence_text: string }[], incompleteItems: { id: string, sentence_text: string }[] } | void>
 *   onNavigateToItem: (item: { id: string, sentence_text: string, hint_ko?: string }) => void
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
  const [replaceHint, setReplaceHint] = useState(null)
  const [hoveredTokenIdx, setHoveredTokenIdx] = useState(null)
  const tokenContainerRef = useRef(null)

  const sentence = item?.sentence_text || ''
  const meaning = String(item?.hint_ko ?? '').trim()
  const tokens = tokenizeWordsWithSpans(sentence)

  const loadBoxes = useCallback(async () => {
    if (!item?.id) return
    const sent = String(item.sentence_text || '')
    setLoading(true)
    const { data, error } = await supabase
      .from('box_drill_answers')
      .select('box_index, start_char, end_char, chunk_label, role_hint')
      .eq('item_id', item.id)
      .order('box_index')
    setLoading(false)
    if (error) {
      setStatusMsg('박스 불러오기 실패: ' + error.message)
      return
    }
    setBoxes(
      (data || []).map((b) => {
        const norm = normalizeBoxSpan(sent, b.start_char, b.end_char)
        return {
          start: norm.start,
          end: norm.end,
          chunk_label: b.chunk_label,
          role_hint: b.role_hint != null ? String(b.role_hint) : '',
        }
      }),
    )
  }, [item?.id, item?.sentence_text])

  useEffect(() => {
    if (!open || !item?.id) return
    setDragStart(null)
    setDragEnd(null)
    setIsDragging(false)
    setOverlapWarn(false)
    setStatusMsg(null)
    setReplaceHint(null)
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

  const isInPreviewRange = (idx) => {
    if (dragStart == null || dragEnd == null) return false
    const lo = Math.min(dragStart, dragEnd)
    const hi = Math.max(dragStart, dragEnd)
    return idx >= lo && idx <= hi
  }

  const previewRangeOverlap = () => {
    if (dragStart == null || dragEnd == null) return false
    const lo = Math.min(dragStart, dragEnd)
    const hi = Math.max(dragStart, dragEnd)
    return rangeHasOverlap(lo, hi)
  }

  const commitRange = useCallback(
    (startIdx, endIdx) => {
      const lo = Math.min(startIdx, endIdx)
      const hi = Math.max(startIdx, endIdx)
      if (rangeHasOverlap(lo, hi)) {
        setOverlapWarn(true)
        setTimeout(() => setOverlapWarn(false), 2000)
        return false
      }
      const t0 = tokens[lo]
      const t1 = tokens[hi]
      if (!t0 || !t1) return false
      const span = normalizeBoxSpan(sentence, t0.start, t1.end)
      if (span.end <= span.start) return false
      setBoxes((p) => [...p, { start: span.start, end: span.end, chunk_label: null, role_hint: '' }])
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
      role_hint: String(b.role_hint ?? '').trim() || null,
    }))
    const { error } = await supabase.from('box_drill_answers').insert(rows)
    setSaving(false)
    if (error) {
      setStatusMsg('저장 실패: ' + error.message)
      return { ok: false, reason: 'save-error' }
    }
    return { ok: true }
  }, [item?.id, boxes])

  const removeBoxAt = useCallback(
    async (index) => {
      const next = boxes.filter((_, i) => i !== index)
      setBoxes(next)
      setReplaceHint(null)
      if (!item?.id) return
      if (next.length === 0) {
        await supabase.from('box_drill_answers').delete().eq('item_id', item.id)
        if (onSaved) await onSaved()
        return
      }
      setSaving(true)
      await supabase.from('box_drill_answers').delete().eq('item_id', item.id)
      const rows = next.map((b, i) => ({
        item_id: item.id,
        box_index: i,
        start_char: b.start,
        end_char: b.end,
        chunk_label: b.chunk_label ?? null,
        role_hint: String(b.role_hint ?? '').trim() || null,
      }))
      const { error } = await supabase.from('box_drill_answers').insert(rows)
      setSaving(false)
      if (error) {
        setStatusMsg('삭제 저장 실패: ' + error.message)
        void loadBoxes()
        return
      }
      if (onSaved) await onSaved()
    },
    [boxes, item?.id, loadBoxes, onSaved],
  )

  const editBoxAt = useCallback((index) => {
    setBoxes((p) => p.filter((_, i) => i !== index))
    setReplaceHint(`박스 ${index + 1}을 비웠습니다. 아래 영문 문장에서 드래그해 다시 만드세요.`)
    setStatusMsg(null)
  }, [])

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

  const getTokenIndexFromEvent = useCallback((clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY)
    if (!el) return null
    const btn = el.closest('[data-token-idx]')
    if (!btn || !tokenContainerRef.current?.contains(btn)) return null
    const idx = parseInt(btn.getAttribute('data-token-idx'), 10)
    return Number.isFinite(idx) ? idx : null
  }, [])

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
          maxWidth: 720,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: COLORS.surface,
          borderRadius: RADIUS.lg,
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...STICKY_HEADER_STYLE, padding: '16px 20px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>박스 정답 입력</h2>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: COLORS.textSecondary }}>
                {queueMeta.navIndex > 0 ? `${queueMeta.navIndex}번째 · ` : ''}
                미완료 {queueMeta.incompleteRemaining} / {queueMeta.totalSentences}문장
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>

          <p
            style={{
              margin: '10px 0 0',
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1.45,
              color: COLORS.textPrimary,
            }}
          >
            {sentence}
          </p>
          {meaning ? (
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 15,
                fontWeight: 600,
                lineHeight: 1.5,
                color: '#854d0e',
                background: '#fef9c3',
                border: '1px solid #fde047',
                borderRadius: RADIUS.md,
                padding: '8px 12px',
              }}
            >
              {meaning}
            </p>
          ) : null}
        </div>

        <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: '12px 20px' }}>
          {!loading && boxes.length === 0 && tokens.length > 0 ? (
            <div
              style={{
                marginBottom: 10,
                padding: '8px 10px',
                borderRadius: RADIUS.md,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                fontSize: 13,
                fontWeight: 700,
                color: '#1d4ed8',
              }}
            >
              💡 단어를 드래그하면 박스가 만들어져요.
            </div>
          ) : null}

          {loading ? (
            <p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>
          ) : tokens.length > 0 ? (
            <div
              ref={tokenContainerRef}
              style={{ margin: '0 0 12px', lineHeight: 2.2, userSelect: 'none', cursor: isDragging ? 'grabbing' : undefined }}
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
                      padding: '3px 7px',
                      borderRadius: 6,
                      border: ts.border,
                      background: ts.background,
                      cursor: getTokenCursor(i),
                      fontWeight: 600,
                      fontSize: 14,
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
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
              {overlapWarn ? '겹치는 구간은 박스로 만들 수 없습니다.' : '선택 구간이 기존 박스와 겹칩니다.'}
            </p>
          ) : null}

          <p style={{ fontSize: 11, color: COLORS.textSecondary, margin: '0 0 8px' }}>
            + 박스 추가: 위 문장에서 드래그 · ←/→ 이동(자동 저장) · Esc 닫기
          </p>

          {replaceHint ? (
            <p
              style={{
                margin: '0 0 8px',
                padding: '8px 10px',
                borderRadius: RADIUS.md,
                background: '#fffbeb',
                border: '1px solid #fde047',
                fontSize: 13,
                fontWeight: 600,
                color: '#854d0e',
              }}
            >
              {replaceHint}
            </p>
          ) : null}

          {boxes.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: COLORS.accentText }}>
                만든 박스 ({boxes.length})
              </p>
              {boxes.map((b, i) => (
                <div
                  key={`${b.start}-${b.end}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 36,
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: '#ecfdf5',
                    border: '1px solid #86efac',
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: 600,
                      color: COLORS.textPrimary,
                    }}
                    title={sentence.slice(b.start, b.end)}
                  >
                    [{sentence.slice(b.start, b.end)}]
                  </span>
                  <input
                    type="text"
                    list="gl-role-hint-suggestions"
                    value={b.role_hint ?? ''}
                    placeholder="역할 (끊어읽기)"
                    disabled={saving}
                    onChange={(e) => {
                      const v = e.target.value
                      setBoxes((prev) =>
                        prev.map((box, j) => (j === i ? { ...box, role_hint: v } : box)),
                      )
                    }}
                    style={{
                      width: 120,
                      flexShrink: 0,
                      padding: '4px 6px',
                      fontSize: 12,
                      borderRadius: RADIUS.sm,
                      border: String(b.role_hint ?? '').trim()
                        ? '1px solid #86efac'
                        : '1px solid #fca5a5',
                      background: '#fff',
                    }}
                  />
                  {!String(b.role_hint ?? '').trim() ? (
                    <span
                      title="끊어읽기(박스별) 모드에 필요"
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: '#b91c1c',
                        background: '#fee2e2',
                        padding: '2px 6px',
                        borderRadius: 999,
                        flexShrink: 0,
                      }}
                    >
                      역할 없음
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => editBoxAt(i)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${COLORS.primary}`,
                      background: '#fff',
                      color: COLORS.primaryDark,
                      cursor: saving ? 'wait' : 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void removeBoxAt(i)}
                    style={{
                      padding: '4px 8px',
                      fontSize: 14,
                      fontWeight: 700,
                      borderRadius: RADIUS.sm,
                      border: '1px solid #fca5a5',
                      background: '#fff',
                      color: '#dc2626',
                      cursor: saving ? 'wait' : 'pointer',
                      flexShrink: 0,
                      lineHeight: 1,
                    }}
                    title="박스 삭제"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: COLORS.textSecondary, margin: '0 0 8px' }}>만든 박스가 없습니다. 드래그로 추가하세요.</p>
          )}
          <datalist id="gl-role-hint-suggestions">
            {ROLE_HINT_SUGGESTIONS.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>

        <div
          style={{
            flexShrink: 0,
            padding: '12px 20px 16px',
            borderTop: `1px solid ${COLORS.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
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
          {statusMsg ? <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{statusMsg}</p> : null}
        </div>
      </div>
    </div>
  )
}
