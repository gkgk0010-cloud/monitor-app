'use client'

import { useCallback, useEffect, useState } from 'react'
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

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 6,
  marginTop: 12,
  color: COLORS.textPrimary,
}
const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: RADIUS.md,
  border: `1px solid ${COLORS.border}`,
  fontSize: 15,
  boxSizing: 'border-box',
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

/**
 * @param {{ open: boolean, item: { id: string, sentence_text: string } | null, onClose: () => void, onSaved: () => void }} props
 */
export default function BoxAnswerModal({ open, item, onClose, onSaved }) {
  const [boxes, setBoxes] = useState([])
  const [selStart, setSelStart] = useState(null)
  const [selEnd, setSelEnd] = useState(null)
  const [chunkLabel, setChunkLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState(null)

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
    setSelStart(null)
    setSelEnd(null)
    setChunkLabel('')
    setStatusMsg(null)
    void loadBoxes()
  }, [open, item?.id, loadBoxes])

  const inBox = (idx) => {
    const t = tokens[idx]
    if (!t) return false
    return boxes.some((b) => t.start >= b.start && t.end <= b.end)
  }

  const isSelected = (idx) => {
    if (selStart == null || selEnd == null) return false
    const lo = Math.min(selStart, selEnd)
    const hi = Math.max(selStart, selEnd)
    return idx >= lo && idx <= hi
  }

  const addBox = useCallback(() => {
    if (selStart == null || selEnd == null) return
    const lo = Math.min(selStart, selEnd)
    const hi = Math.max(selStart, selEnd)
    for (let i = lo; i <= hi; i++) {
      if (inBox(i)) return
    }
    const start = tokens[lo].start
    const end = tokens[hi].end
    setBoxes((prev) =>
      [...prev, { start, end, chunk_label: chunkLabel.trim() || null }].sort((a, b) => a.start - b.start),
    )
    setSelStart(null)
    setSelEnd(null)
    setChunkLabel('')
  }, [selStart, selEnd, tokens, chunkLabel, boxes])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Enter' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        addBox()
      }
      if (e.key === 'Backspace' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
        setBoxes((p) => p.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, addBox])

  const handleSave = async () => {
    if (!item?.id || !boxes.length) {
      setStatusMsg('박스 1개 이상 필요합니다.')
      return
    }
    setSaving(true)
    setStatusMsg(null)
    await supabase.from('box_drill_answers').delete().eq('item_id', item.id)
    const rows = boxes.map((b, i) => ({
      item_id: item.id,
      box_index: i,
      start_char: b.start,
      end_char: b.end,
      chunk_label: b.chunk_label,
    }))
    const { error } = await supabase.from('box_drill_answers').insert(rows)
    setSaving(false)
    if (error) {
      setStatusMsg('저장 실패: ' + error.message)
      return
    }
    onSaved()
    onClose()
  }

  if (!open || !item) return null

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
          maxWidth: 640,
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>박스 정답 입력</h2>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer' }}>
            ✕
          </button>
        </div>
        <p style={{ fontSize: 14, color: COLORS.textSecondary, margin: '8px 0 0', lineHeight: 1.5 }}>{sentence}</p>
        {loading ? (
          <p style={{ marginTop: 16, color: COLORS.textSecondary }}>불러오는 중…</p>
        ) : tokens.length > 0 ? (
          <div style={{ margin: '16px 0', lineHeight: 2.4 }}>
            {tokens.map((t, i) => (
              <button
                key={i}
                type="button"
                disabled={inBox(i)}
                onClick={() => {
                  if (inBox(i)) return
                  if (selStart == null) {
                    setSelStart(i)
                    setSelEnd(i)
                  } else {
                    setSelEnd(i)
                  }
                }}
                style={{
                  margin: 2,
                  padding: '4px 8px',
                  borderRadius: 8,
                  border: isSelected(i) ? '2px solid #8b5cf6' : '1px solid #e2e8f0',
                  background: inBox(i) ? '#bbf7d0' : isSelected(i) ? '#ddd6fe' : '#f8fafc',
                  cursor: inBox(i) ? 'default' : 'pointer',
                  fontWeight: 600,
                }}
              >
                {t.text}
              </button>
            ))}
          </div>
        ) : null}
        <label style={labelStyle}>박스 라벨 (선택)</label>
        <input value={chunkLabel} onChange={(e) => setChunkLabel(e.target.value)} placeholder="주어, 동사구…" style={inputStyle} />
        <p style={{ fontSize: 12, color: COLORS.textSecondary }}>Enter = 박스 추가 · Backspace = 마지막 박스 삭제</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button type="button" onClick={addBox} style={btnStyle}>
            박스 추가
          </button>
          <button type="button" onClick={() => setBoxes((p) => p.slice(0, -1))} style={{ ...btnStyle, background: '#64748b' }}>
            삭제
          </button>
        </div>
        {boxes.length > 0 ? (
          <ul style={{ fontSize: 14, marginBottom: 16, paddingLeft: 18 }}>
            {boxes.map((b, i) => (
              <li key={i}>
                [{b.start}–{b.end}] {sentence.slice(b.start, b.end)}
                {b.chunk_label ? ` (${b.chunk_label})` : ''}
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" onClick={() => void handleSave()} disabled={saving} style={{ ...btnStyle, width: '100%' }}>
          {saving ? '저장 중…' : '박스 정답 저장'}
        </button>
        {statusMsg ? <p style={{ marginTop: 12, fontSize: 14, color: '#b91c1c' }}>{statusMsg}</p> : null}
      </div>
    </div>
  )
}
