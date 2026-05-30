'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/utils/supabaseClient'
import { useTeacher } from '@/utils/useTeacher'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'

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

function WordOrderEditor({ teacherId }) {
  const [sentence, setSentence] = useState('')
  const [hintKo, setHintKo] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [setName, setSetName] = useState('')
  const [day, setDay] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [difficulty, setDifficulty] = useState('3')
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState(null)
  const [items, setItems] = useState([])

  const loadItems = useCallback(async () => {
    if (!teacherId) return
    const { data, error } = await supabase
      .from('sentence_training_items')
      .select('id, sentence_text, set_name, day, sort_order, difficulty')
      .eq('teacher_id', teacherId)
      .eq('training_kind', 'word_order')
      .order('set_name')
      .order('day')
      .order('sort_order')
    if (!error && data) setItems(data)
  }, [teacherId])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const handleSave = async () => {
    if (!teacherId || !sentence.trim() || !setName.trim()) {
      setStatusMsg('구문과 set 이름은 필수입니다.')
      return
    }
    setSaving(true)
    setStatusMsg(null)
    const { error } = await supabase.from('sentence_training_items').insert({
      teacher_id: teacherId,
      set_name: setName.trim(),
      day: day !== '' ? parseInt(day, 10) : null,
      sentence_text: sentence.trim(),
      hint_ko: hintKo.trim() || null,
      youtube_url: youtubeUrl.trim() || null,
      image_url: imageUrl.trim() || null,
      difficulty: parseInt(difficulty, 10) || 3,
      training_kind: 'word_order',
      sort_order: parseInt(sortOrder, 10) || 0,
      is_published: true,
    })
    setSaving(false)
    if (error) {
      setStatusMsg('저장 실패: ' + error.message)
      return
    }
    setStatusMsg('저장되었습니다.')
    setSentence('')
    void loadItems()
  }

  return (
    <div>
      <label style={labelStyle}>구문 (sentence_text) *</label>
      <textarea value={sentence} onChange={(e) => setSentence(e.target.value)} rows={3} style={inputStyle} />
      <label style={labelStyle}>해석 힌트 (hint_ko)</label>
      <input value={hintKo} onChange={(e) => setHintKo(e.target.value)} style={inputStyle} />
      <label style={labelStyle}>YouTube URL</label>
      <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} style={inputStyle} />
      <label style={labelStyle}>이미지 URL</label>
      <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={inputStyle} />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <div style={{ flex: '1 1 140px' }}>
          <label style={labelStyle}>set_name *</label>
          <input value={setName} onChange={(e) => setSetName(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ width: 80 }}>
          <label style={labelStyle}>day</label>
          <input type="number" value={day} onChange={(e) => setDay(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ width: 80 }}>
          <label style={labelStyle}>sort</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ width: 80 }}>
          <label style={labelStyle}>난이도</label>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={inputStyle}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="button" onClick={() => void handleSave()} disabled={saving} style={saveBtnStyle}>
        {saving ? '저장 중…' : '어순 구문 저장'}
      </button>
      {statusMsg ? <p style={{ marginTop: 12, fontSize: 14, color: COLORS.textSecondary }}>{statusMsg}</p> : null}
      {items.length > 0 ? (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800 }}>등록된 어순 구문 ({items.length})</h3>
          <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
            {items.slice(0, 20).map((it) => (
              <li key={it.id}>
                [{it.set_name}
                {it.day != null ? ` D${it.day}` : ''}] {String(it.sentence_text).slice(0, 50)}…
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function BoxDrillEditor({ teacherId }) {
  const [sentence, setSentence] = useState('')
  const [hintKo, setHintKo] = useState('')
  const [setName, setSetName] = useState('')
  const [day, setDay] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [difficulty, setDifficulty] = useState('3')
  const [boxes, setBoxes] = useState([])
  const [selStart, setSelStart] = useState(null)
  const [selEnd, setSelEnd] = useState(null)
  const [chunkLabel, setChunkLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState(null)

  const tokens = tokenizeWordsWithSpans(sentence)

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
    const onKey = (e) => {
      if (e.key === 'Enter' && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        e.preventDefault()
        addBox()
      }
      if (e.key === 'Backspace' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        setBoxes((prev) => prev.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addBox])

  const handleSave = async () => {
    if (!teacherId || !sentence.trim() || !setName.trim() || !boxes.length) {
      setStatusMsg('구문, set, 박스 1개 이상 필요합니다.')
      return
    }
    setSaving(true)
    setStatusMsg(null)
    const { data: item, error: iErr } = await supabase
      .from('sentence_training_items')
      .insert({
        teacher_id: teacherId,
        set_name: setName.trim(),
        day: day !== '' ? parseInt(day, 10) : null,
        sentence_text: sentence.trim(),
        hint_ko: hintKo.trim() || null,
        difficulty: parseInt(difficulty, 10) || 3,
        training_kind: 'box_drill',
        sort_order: parseInt(sortOrder, 10) || 0,
        is_published: true,
      })
      .select('id')
      .single()
    if (iErr || !item) {
      setSaving(false)
      setStatusMsg('저장 실패: ' + (iErr?.message || 'item'))
      return
    }
    const rows = boxes.map((b, i) => ({
      item_id: item.id,
      box_index: i,
      start_char: b.start,
      end_char: b.end,
      chunk_label: b.chunk_label,
    }))
    const { error: bErr } = await supabase.from('box_drill_answers').insert(rows)
    setSaving(false)
    if (bErr) {
      setStatusMsg('박스 저장 실패: ' + bErr.message)
      return
    }
    setStatusMsg('저장되었습니다.')
    setSentence('')
    setBoxes([])
  }

  return (
    <div>
      <label style={labelStyle}>구문 (sentence_text) *</label>
      <textarea value={sentence} onChange={(e) => { setSentence(e.target.value); setBoxes([]); setSelStart(null); setSelEnd(null) }} rows={2} style={inputStyle} />
      {tokens.length > 0 ? (
        <div style={{ margin: '12px 0', lineHeight: 2.2 }}>
          {tokens.map((t, i) => (
            <button
              key={i}
              type="button"
              disabled={inBox(i)}
              onClick={() => {
                if (inBox(i)) return
                if (selStart == null) { setSelStart(i); setSelEnd(i) }
                else setSelEnd(i)
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
      <label style={labelStyle}>박스 라벨 (chunk_label, 선택)</label>
      <input value={chunkLabel} onChange={(e) => setChunkLabel(e.target.value)} placeholder="주어, 동사구…" style={inputStyle} />
      <p style={{ fontSize: 12, color: COLORS.textSecondary }}>Enter = 박스 추가 · Backspace = 마지막 박스 삭제</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={addBox} style={saveBtnStyle}>박스 추가</button>
        <button type="button" onClick={() => setBoxes((p) => p.slice(0, -1))} style={{ ...saveBtnStyle, background: '#64748b' }}>삭제</button>
      </div>
      {boxes.length > 0 ? (
        <ul style={{ fontSize: 14, marginBottom: 16 }}>
          {boxes.map((b, i) => (
            <li key={i}>
              [{b.start}–{b.end}] {sentence.slice(b.start, b.end)}
              {b.chunk_label ? ` (${b.chunk_label})` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      <label style={labelStyle}>해석 힌트</label>
      <input value={hintKo} onChange={(e) => setHintKo(e.target.value)} style={inputStyle} />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <div style={{ flex: '1 1 140px' }}>
          <label style={labelStyle}>set_name *</label>
          <input value={setName} onChange={(e) => setSetName(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ width: 80 }}>
          <label style={labelStyle}>day</label>
          <input type="number" value={day} onChange={(e) => setDay(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ width: 80 }}>
          <label style={labelStyle}>sort</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ width: 80 }}>
          <label style={labelStyle}>난이도</label>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={inputStyle}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={String(n)}>{n}</option>
            ))}
          </select>
        </div>
      </div>
      <button type="button" onClick={() => void handleSave()} disabled={saving} style={saveBtnStyle}>
        {saving ? '저장 중…' : '박스 구문 저장'}
      </button>
      {statusMsg ? <p style={{ marginTop: 12, fontSize: 14, color: COLORS.textSecondary }}>{statusMsg}</p> : null}
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, marginTop: 12, color: COLORS.textPrimary }
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: RADIUS.md, border: `1px solid ${COLORS.border}`, fontSize: 15, boxSizing: 'border-box' }
const saveBtnStyle = {
  marginTop: 16,
  padding: '12px 24px',
  borderRadius: RADIUS.md,
  border: 'none',
  background: COLORS.primary,
  color: COLORS.textOnGreen,
  fontWeight: 700,
  fontSize: 15,
  cursor: 'pointer',
}

export default function GrammarLabPage() {
  const { teacher, loading } = useTeacher()
  const [tab, setTab] = useState('word_order')

  if (loading) {
    return <p style={{ color: COLORS.textSecondary }}>선생님 정보 확인 중…</p>
  }
  if (!teacher?.id) {
    return (
      <p style={{ color: COLORS.textSecondary }}>
        teachers 행이 없습니다.{' '}
        <Link href="/teacher/monitor">모니터</Link>
      </p>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '8px 0 32px' }}>
      <header
        style={{
          marginBottom: 20,
          padding: '14px 18px',
          borderRadius: RADIUS.lg,
          background: COLORS.headerGradient,
          color: COLORS.textOnGreen,
          boxShadow: SHADOW.card,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>문법 해부실 콘텐츠</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.92 }}>어순 배열 · 박스 만들기 구문 관리</p>
      </header>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setTab('word_order')}
          style={{
            ...saveBtnStyle,
            marginTop: 0,
            background: tab === 'word_order' ? COLORS.primary : '#e2e8f0',
            color: tab === 'word_order' ? COLORS.textOnGreen : COLORS.textPrimary,
          }}
        >
          🔀 어순 배열
        </button>
        <button
          type="button"
          onClick={() => setTab('box_drill')}
          style={{
            ...saveBtnStyle,
            marginTop: 0,
            background: tab === 'box_drill' ? COLORS.primary : '#e2e8f0',
            color: tab === 'box_drill' ? COLORS.textOnGreen : COLORS.textPrimary,
          }}
        >
          📦 박스 만들기
        </button>
      </div>
      <section
        style={{
          padding: 20,
          borderRadius: RADIUS.lg,
          border: `1px solid ${COLORS.border}`,
          background: COLORS.surface,
        }}
      >
        {tab === 'word_order' ? <WordOrderEditor teacherId={teacher.id} /> : <BoxDrillEditor teacherId={teacher.id} />}
      </section>
    </div>
  )
}
