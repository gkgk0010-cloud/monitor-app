'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import { assignDaysEqual, assignDaysChunk, assignDaysFromManualCounts } from '../utils/dayAssign'
import { generateInviteCode } from '@/utils/teacherSignup'
import {
  ALL_MODE_KEYS,
  parseAvailableModes,
  buildModesDataForWordSetSave,
  defaultRequiredForBaseKeys,
  normalizeSetType,
} from '../utils/learningModes'
import LearningModesPicker from './LearningModesPicker'

const QTYPE_KEYS = [
  { key: 'word_to_meaning', label: '단어 → 뜻' },
  { key: 'meaning_to_word', label: '뜻 → 단어' },
  { key: 'image_to_word', label: '이미지 → 단어' },
]

const SET_TYPE_LABELS = {
  word: '단어 세트',
  sentence_writing: '문장 세트 — 라이팅',
  sentence_speaking: '문장 세트 — 스피킹',
  sentence: '문장 세트 — 라이팅',
  image: '단어 세트',
}

/**
 * @param {{
 *   open: boolean
 *   onClose: () => void
 *   setName: string
 *   teacherId: string
 *   inferredSetType?: string
 *   hasImageWords?: boolean
 *   onSaved?: () => void
 *   onRenamed?: (oldName: string, newName: string) => void
 * }} props
 */
export default function SetSettingsModal({ open, onClose, setName, teacherId, inferredSetType, hasImageWords, onSaved, onRenamed }) {
  const isSentenceStyle = (st) => st === 'sentence_writing' || st === 'sentence_speaking'

  const [loading, setLoading] = useState(true)
  const [wordSetId, setWordSetId] = useState(null)
  const [setType, setSetType] = useState('word')
  const [modes, setModes] = useState({})
  const [requiredByMode, setRequiredByMode] = useState({})
  const [passScore, setPassScore] = useState(80)
  const [maxAttempts, setMaxAttempts] = useState(3)
  const [dayMode, setDayMode] = useState('equal')
  const [totalDays, setTotalDays] = useState(7)
  const [perDay, setPerDay] = useState(20)
  const [manualSegments, setManualSegments] = useState([{ day: 1, count: 0 }])
  const [rows, setRows] = useState([])
  const [hasDayPreview, setHasDayPreview] = useState(false)
  const [savingDays, setSavingDays] = useState(false)
  const [savingModes, setSavingModes] = useState(false)
  const [savingSetName, setSavingSetName] = useState(false)
  const [regeneratingInvite, setRegeneratingInvite] = useState(false)
  const [editableSetName, setEditableSetName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [hint, setHint] = useState(null)
  const [testQuestionTypes, setTestQuestionTypes] = useState(() => ['word_to_meaning'])

  const load = useCallback(async () => {
    const sn = String(setName || '').trim()
    if (!sn || !teacherId) return
    setLoading(true)
    setHint(null)
    setHasDayPreview(false)
    setWordSetId(null)
    try {
      const [{ data: ws, error: wsErr }, { data: wordRows, error: wErr }] = await Promise.all([
        supabase.from('word_sets').select('id, set_type, available_modes, invite_code, name').eq('teacher_id', teacherId).eq('name', sn).maybeSingle(),
        supabase
          .from('words')
          .select('id, word, meaning, example_sentence, day, difficulty, image_url, image_source, youtube_url')
          .eq('teacher_id', teacherId)
          .eq('set_name', sn)
          .order('day', { ascending: true }),
      ])
      if (wsErr) console.warn('[SetSettingsModal] word_sets', wsErr.message)
      if (wErr) console.warn('[SetSettingsModal] words', wErr.message)

      let st = normalizeSetType(ws?.set_type || inferredSetType || 'word')
      setSetType(st)

      const parsed = parseAvailableModes(ws?.available_modes, st)
      setModes(parsed.modes)
      setRequiredByMode(parsed.requiredByMode)
      let ps = parsed.passScore
      let ma = parsed.maxAttempts
      const wid = ws?.id ? String(ws.id) : null
      setWordSetId(wid)
      setEditableSetName(ws?.name != null ? String(ws.name).trim() : sn)
      setInviteCode(ws?.invite_code != null ? String(ws.invite_code).trim() : '')
      if (wid) {
        const { data: vts } = await supabase
          .from('vocab_test_settings')
          .select('pass_score, max_attempts, test_question_types')
          .eq('word_set_id', wid)
          .maybeSingle()
        if (vts) {
          if (vts.pass_score != null) ps = Math.min(100, Math.max(0, Number(vts.pass_score)))
          if (vts.max_attempts != null) ma = Math.max(1, Number(vts.max_attempts))
          if (Array.isArray(vts.test_question_types) && vts.test_question_types.length) {
            const allow = new Set(QTYPE_KEYS.map((x) => x.key))
            const next = vts.test_question_types.map(String).filter((k) => allow.has(k))
            if (next.length) setTestQuestionTypes(next)
            else setTestQuestionTypes(['word_to_meaning'])
          } else {
            setTestQuestionTypes(['word_to_meaning'])
          }
        } else {
          setTestQuestionTypes(['word_to_meaning'])
        }
      } else {
        setTestQuestionTypes(['word_to_meaning'])
      }
      setPassScore(ps)
      setMaxAttempts(ma)

      const list = (wordRows || []).map((r) => ({
        id: String(r.id),
        word: String(r.word ?? ''),
        meaning: String(r.meaning ?? ''),
        example_sentence: String(r.example_sentence ?? ''),
        day: r.day != null ? Number(r.day) : 1,
        difficulty: r.difficulty,
        image_url: r.image_url,
        image_source: r.image_source,
        youtube_url: r.youtube_url,
      }))
      setRows(list)
    } finally {
      setLoading(false)
    }
  }, [setName, teacherId, inferredSetType])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  const handleToggleMode = (key) => {
    setModes((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      if (next[key]) {
        setRequiredByMode((r) => ({
          ...r,
          [key]: defaultRequiredForBaseKeys(setType)[key] ?? false,
        }))
      }
      return next
    })
  }

  const applyDayPreview = () => {
    const validCount = rows.filter((r) => {
      const w = String(r.word || '').trim()
      const m = String(r.meaning || '').trim()
      const ex = String(r.example_sentence || '').trim()
      if (isSentenceStyle(setType)) return Boolean(ex && m)
      return Boolean(w && m)
    }).length
    if (validCount === 0) {
      alert(isSentenceStyle(setType) ? '예문·뜻이 있는 행이 없습니다.' : '영단어·뜻이 있는 행이 없습니다.')
      return
    }
    if (dayMode === 'equal' && totalDays < 1) {
      alert('총 일수는 1 이상이어야 합니다.')
      return
    }
    if (dayMode === 'chunk' && perDay < 1) {
      alert('일당 개수는 1 이상이어야 합니다.')
      return
    }
    let seq
    if (dayMode === 'manual') {
      const segs = manualSegments.map((s) => ({
        day: Math.max(1, Math.floor(parseInt(String(s.day), 10) || 1)),
        count: Math.max(0, Math.floor(parseInt(String(s.count), 10) || 0)),
      }))
      const res = assignDaysFromManualCounts(validCount, segs)
      if (!res.ok) {
        if (res.sum < res.expected) {
          alert(
            `입력 합계(${res.sum})와 빈 행 수(${res.expected})가 다릅니다. 남은 ${res.expected - res.sum}개를 day에 배정해 주세요.`,
          )
        } else {
          alert(`입력 합계(${res.sum})와 빈 행 수(${res.expected})가 다릅니다. ${res.sum - res.expected}개를 줄여 주세요.`)
        }
        return
      }
      seq = res.seq
    } else if (dayMode === 'equal') {
      seq = assignDaysEqual(validCount, Math.max(1, totalDays))
    } else {
      seq = assignDaysChunk(validCount, Math.max(1, perDay))
    }
    let vi = 0
    setRows((prev) =>
      prev.map((r) => {
        const w = String(r.word || '').trim()
        const m = String(r.meaning || '').trim()
        const ex = String(r.example_sentence || '').trim()
        const ok = isSentenceStyle(setType) ? ex && m : w && m
        if (!ok) return { ...r, day: r.day ?? 1 }
        const d = seq[vi++]
        return { ...r, day: d }
      }),
    )
    setHasDayPreview(true)
    setHint('Day가 배정되었습니다. 「DB에 저장」으로 반영하거나, 아래에서 학습 모드를 저장하세요.')
  }

  const saveDaysToDb = async () => {
    if (!teacherId) return
    if (!hasDayPreview) {
      alert('먼저 「Day 미리보기」로 day를 배정하세요.')
      return
    }
    const valid = rows.filter((r) => {
      const w = String(r.word || '').trim()
      const m = String(r.meaning || '').trim()
      const ex = String(r.example_sentence || '').trim()
      if (isSentenceStyle(setType)) return Boolean(ex && m)
      return Boolean(w && m)
    })
    if (valid.length === 0) {
      alert('저장할 행이 없습니다.')
      return
    }
    setSavingDays(true)
    setHint(null)
    try {
      const results = await Promise.all(
        valid.map((r) =>
          supabase
            .from('words')
            .update({ day: Math.max(1, parseInt(String(r.day ?? 1), 10) || 1) })
            .eq('id', r.id)
            .eq('teacher_id', teacherId),
        ),
      )
      const err = results.find((x) => x.error)?.error
      if (err) throw new Error(err.message)
      setHint('DAY가 DB에 반영되었습니다.')
      onSaved?.()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingDays(false)
    }
  }

  const saveSetName = async () => {
    const oldSn = String(setName || '').trim()
    const newSn = String(editableSetName || '').trim()
    if (!teacherId || !oldSn) return
    if (!newSn) {
      alert('세트 이름을 입력해 주세요.')
      return
    }
    if (newSn === oldSn) {
      setHint('세트 이름이 동일합니다.')
      return
    }
    const wid = wordSetId ? String(wordSetId) : null
    if (!wid) {
      alert('word_sets 행이 없습니다. 먼저 아래에서 학습 모드를 저장한 뒤 이름을 바꿀 수 있습니다.')
      return
    }
    setSavingSetName(true)
    setHint(null)
    try {
      const { data: clash } = await supabase
        .from('word_sets')
        .select('id')
        .eq('teacher_id', teacherId)
        .eq('name', newSn)
        .neq('id', wid)
        .maybeSingle()
      if (clash?.id) {
        alert('이미 같은 이름의 세트가 있습니다.')
        return
      }
      const { error: e1 } = await supabase.from('word_sets').update({ name: newSn }).eq('id', wid).eq('teacher_id', teacherId)
      if (e1) throw new Error(e1.message)
      const { error: e2 } = await supabase.from('words').update({ set_name: newSn }).eq('teacher_id', teacherId).eq('set_name', oldSn)
      if (e2) throw new Error(e2.message)
      const { error: e3 } = await supabase.from('routines').update({ set_name: newSn }).eq('teacher_id', teacherId).eq('set_name', oldSn)
      if (e3) console.warn('[SetSettingsModal] routines rename', e3.message)
      onRenamed?.(oldSn, newSn)
      setHint('세트 이름이 저장되었습니다.')
      onSaved?.()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingSetName(false)
    }
  }

  const regenerateInvite = async () => {
    const wid = wordSetId ? String(wordSetId) : null
    if (!wid || !teacherId) {
      alert('세트를 먼저 저장해 주세요.')
      return
    }
    if (
      !window.confirm(
        '초대코드를 재발급할까요? 옛 코드로 가입한 학생은 앱에서 비활성화되며, 새 코드로 다시 입력해야 합니다.',
      )
    )
      return
    setRegeneratingInvite(true)
    setHint(null)
    try {
      let code = generateInviteCode()
      let lastErr = null
      for (let attempt = 0; attempt < 15; attempt++) {
        const { error: upErr } = await supabase
          .from('word_sets')
          .update({ invite_code: code })
          .eq('id', wid)
          .eq('teacher_id', teacherId)
        if (!upErr) {
          lastErr = null
          break
        }
        lastErr = upErr
        const msg = String(upErr.message || '').toLowerCase()
        if (msg.includes('unique') || msg.includes('duplicate')) {
          code = generateInviteCode()
          continue
        }
        throw new Error(upErr.message)
      }
      if (lastErr) throw new Error(lastErr.message)
      const { error: delErr } = await supabase.from('student_set_access').delete().eq('set_id', wid)
      if (delErr) throw new Error(delErr.message)
      setInviteCode(code)
      setHint('초대코드가 변경됐어요. 옛 코드로 가입한 학생들은 새 코드로 다시 입력해야 해요.')
      onSaved?.()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setRegeneratingInvite(false)
    }
  }

  const saveModes = async () => {
    if (!teacherId) return
    const selected = ALL_MODE_KEYS.filter((k) => modes[k])
    if (selected.length === 0) {
      alert('학습 모드를 하나 이상 선택해 주세요.')
      return
    }
    const sn = String(setName || '').trim()
    const modesData = buildModesDataForWordSetSave(modes, requiredByMode, passScore, maxAttempts)
    setSavingModes(true)
    try {
      let wid = wordSetId ? String(wordSetId) : null
      if (wid) {
        const { error } = await supabase
          .from('word_sets')
          .update({
            available_modes: modesData,
            set_type: setType,
          })
          .eq('id', wid)
          .eq('teacher_id', teacherId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('word_sets').upsert(
          {
            teacher_id: teacherId,
            name: sn,
            set_type: setType,
            available_modes: modesData,
          },
          { onConflict: 'teacher_id,name' },
        )
        if (error) throw error
        const { data: row } = await supabase.from('word_sets').select('id').eq('teacher_id', teacherId).eq('name', sn).maybeSingle()
        if (row?.id) wid = String(row.id)
      }

      if (wid && modes.test) {
        const allow = new Set(QTYPE_KEYS.map((x) => x.key))
        const tqt = (testQuestionTypes || []).map(String).filter((k) => allow.has(k))
        const tqtFinal = tqt.length > 0 ? tqt : ['word_to_meaning']
        const { error: e2 } = await supabase.from('vocab_test_settings').upsert(
          {
            word_set_id: wid,
            pass_score: Math.min(100, Math.max(0, Math.round(Number(passScore) || 80))),
            max_attempts: Math.max(1, Math.round(Number(maxAttempts) || 3)),
            test_question_types: tqtFinal,
          },
          { onConflict: 'word_set_id' },
        )
        if (e2) console.warn('[vocab_test_settings]', e2.message)
      }

      if (wid) setWordSetId(String(wid))
      setHint('학습 모드가 저장되었습니다.')
      onSaved?.()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingModes(false)
    }
  }

  if (!open) return null

  const validWordRowCount = rows.filter((r) => {
    const w = String(r.word || '').trim()
    const m = String(r.meaning || '').trim()
    const ex = String(r.example_sentence || '').trim()
    if (isSentenceStyle(setType)) return Boolean(ex && m)
    return Boolean(w && m)
  }).length
  const manualSum = manualSegments.reduce(
    (a, s) => a + Math.max(0, Math.floor(parseInt(String(s.count), 10) || 0)),
    0,
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="set-settings-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflow: 'auto',
      }}
    >
      <div
        style={{
          width: 'min(480px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: COLORS.surface,
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.modal,
          padding: 24,
          boxSizing: 'border-box',
        }}
      >
        <h2 id="set-settings-title" style={{ fontSize: 18, fontWeight: 800, color: COLORS.accentText, margin: '0 0 16px' }}>
          세트 설정
        </h2>

        {loading ? (
          <p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>
        ) : (
          <>
            <div style={{ margin: '0 0 14px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: COLORS.accentText, fontSize: 14 }}>세트 이름</span>
                <input
                  type="text"
                  value={editableSetName}
                  onChange={(e) => setEditableSetName(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: '8px 12px',
                    borderRadius: RADIUS.sm,
                    border: `1px solid ${COLORS.border}`,
                    fontSize: 14,
                  }}
                />
                <button
                  type="button"
                  disabled={savingSetName}
                  onClick={() => void saveSetName()}
                  style={{
                    padding: '8px 14px',
                    borderRadius: RADIUS.md,
                    border: `1px solid ${COLORS.primary}`,
                    background: COLORS.surface,
                    color: COLORS.accentText,
                    fontWeight: 700,
                    cursor: savingSetName ? 'wait' : 'pointer',
                    opacity: savingSetName ? 0.85 : 1,
                  }}
                >
                  {savingSetName ? '저장 중…' : '이름 저장'}
                </button>
              </div>
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: RADIUS.md,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.bg,
                }}
              >
                <div style={{ fontWeight: 700, color: COLORS.accentText, fontSize: 13, marginBottom: 6 }}>세트 초대코드</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <code style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.08em' }}>{inviteCode || '—'}</code>
                  <button
                    type="button"
                    disabled={!inviteCode || regeneratingInvite}
                    onClick={async () => {
                      const c = String(inviteCode || '').trim()
                      if (!c) return
                      try {
                        await navigator.clipboard.writeText(c)
                        setHint('초대코드를 복사했어요.')
                      } catch {
                        setHint('복사에 실패했어요. 코드를 직접 선택해 주세요.')
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${COLORS.border}`,
                      background: COLORS.surface,
                      cursor: 'pointer',
                    }}
                  >
                    복사
                  </button>
                  <button
                    type="button"
                    disabled={!wordSetId || regeneratingInvite}
                    onClick={() => void regenerateInvite()}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      borderRadius: RADIUS.sm,
                      border: 'none',
                      background: COLORS.primaryDark,
                      color: COLORS.textOnGreen,
                      cursor: regeneratingInvite || !wordSetId ? 'not-allowed' : 'pointer',
                      opacity: !wordSetId ? 0.5 : 1,
                    }}
                  >
                    {regeneratingInvite ? '처리 중…' : '재발급'}
                  </button>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.45 }}>
                  재발급 시 옛 코드로 가입한 학생 접근이 초기화됩니다. 새 코드를 다시 나눠 주세요.
                </p>
              </div>
            </div>
            <p style={{ margin: '0 0 18px', fontSize: 14, color: COLORS.textPrimary }}>
              <span style={{ fontWeight: 700, color: COLORS.accentText }}>세트 타입:</span>{' '}
              {SET_TYPE_LABELS[setType] || setType}
            </p>

            <div style={{ fontWeight: 800, color: COLORS.accentText, marginBottom: 10, fontSize: 14 }}>DAY 나누기</div>
            <div
              style={{
                display: 'grid',
                gap: 12,
                marginBottom: 12,
                padding: 14,
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.primarySoft,
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="radio"
                  name="set-day-mode"
                  checked={dayMode === 'equal'}
                  onChange={() => {
                    setDayMode('equal')
                    setHasDayPreview(false)
                  }}
                />
                <span>총 N일로 균등 분할</span>
                <span style={{ color: COLORS.textSecondary }}>N =</span>
                <input
                  type="number"
                  min={1}
                  value={totalDays}
                  onChange={(e) => setTotalDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={{ width: 72, padding: 8, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="radio"
                  name="set-day-mode"
                  checked={dayMode === 'chunk'}
                  onChange={() => {
                    setDayMode('chunk')
                    setHasDayPreview(false)
                  }}
                />
                <span>순서대로 일당 M개</span>
                <span style={{ color: COLORS.textSecondary }}>M =</span>
                <input
                  type="number"
                  min={1}
                  value={perDay}
                  onChange={(e) => setPerDay(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={{ width: 72, padding: 8, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="radio"
                  name="set-day-mode"
                  checked={dayMode === 'manual'}
                  onChange={() => {
                    setDayMode('manual')
                    setHasDayPreview(false)
                  }}
                  style={{ marginTop: 3 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span>day별 직접 입력</span>
                  {dayMode === 'manual' ? (
                    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                      {manualSegments.map((s, i) => (
                        <div key={`${s.day}-${i}`} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                          <span style={{ minWidth: 48, fontWeight: 700 }}>day {s.day}</span>
                          <input
                            type="number"
                            min={0}
                            value={s.count}
                            onChange={(e) => {
                              const c = Math.max(0, parseInt(e.target.value, 10) || 0)
                              setManualSegments((prev) => prev.map((x, j) => (j === i ? { ...x, count: c } : x)))
                            }}
                            style={{ width: 72, padding: 6, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}
                          />
                          <span style={{ fontSize: 13, color: COLORS.textSecondary }}>개</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            const maxD = Math.max(0, ...manualSegments.map((x) => x.day))
                            setManualSegments((prev) => [...prev, { day: maxD + 1, count: 0 }])
                          }}
                          style={{
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            borderRadius: RADIUS.sm,
                            border: `1px dashed ${COLORS.border}`,
                            background: COLORS.surface,
                            cursor: 'pointer',
                          }}
                        >
                          + day 추가
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setManualSegments((prev) => (prev.length <= 1 ? prev : prev.slice(0, -1)))
                          }}
                          style={{
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            borderRadius: RADIUS.sm,
                            border: `1px solid ${COLORS.border}`,
                            background: COLORS.bg,
                            cursor: 'pointer',
                          }}
                        >
                          − day 제거
                        </button>
                      </div>
                      {validWordRowCount > 0 ? (
                        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                          합계: {manualSum}개 / 빈 행: {validWordRowCount}개
                          {manualSum !== validWordRowCount ? (
                            <span style={{ color: '#b45309', marginLeft: 8 }}>→ 일치해야 적용됩니다</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  onClick={applyDayPreview}
                  style={{
                    padding: '10px 16px',
                    borderRadius: RADIUS.md,
                    border: `1px solid ${COLORS.primary}`,
                    background: COLORS.surface,
                    color: COLORS.accentText,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Day 미리보기
                </button>
                <button
                  type="button"
                  disabled={savingDays}
                  onClick={() => void saveDaysToDb()}
                  style={{
                    padding: '10px 16px',
                    borderRadius: RADIUS.md,
                    border: 'none',
                    background: COLORS.primaryDark,
                    color: COLORS.textOnGreen,
                    fontWeight: 700,
                    cursor: savingDays ? 'wait' : 'pointer',
                    opacity: savingDays ? 0.85 : 1,
                  }}
                >
                  {savingDays ? '저장 중…' : 'DB에 저장'}
                </button>
              </div>
            </div>

            <div style={{ fontWeight: 800, color: COLORS.accentText, margin: '18px 0 10px', fontSize: 14 }}>
              학습 모드 재설정
            </div>
            <p style={{ fontSize: 12, color: COLORS.textSecondary, margin: '0 0 10px' }}>
              새 세트 만들기 2단계와 동일합니다. 필수/선택과 테스트 통과 기준이 `word_sets`·`vocab_test_settings`에 저장됩니다.
            </p>

            <LearningModesPicker
              setType={setType}
              modes={modes}
              requiredByMode={requiredByMode}
              passScore={passScore}
              maxAttempts={maxAttempts}
              hasImageWords={hasImageWords}
              onToggleMode={handleToggleMode}
              onRequiredChange={(key, required) => setRequiredByMode((r) => ({ ...r, [key]: required }))}
              onPassScoreChange={setPassScore}
              onMaxAttemptsChange={setMaxAttempts}
            />

            {modes.test ? (
              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  borderRadius: RADIUS.md,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.primarySoft,
                }}
              >
                <div style={{ fontWeight: 800, color: COLORS.accentText, marginBottom: 8, fontSize: 13 }}>
                  객관식 테스트 출제 방식
                </div>
                <p style={{ fontSize: 11, color: COLORS.textSecondary, margin: '0 0 10px' }}>
                  여러 개 선택 시 문항마다 무작위로 섞어 출제합니다. 이미지가 없는 단어는 &quot;이미지 → 단어&quot;가 아니라
                  &quot;단어 → 뜻&quot;으로 대체됩니다.
                </p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                  {QTYPE_KEYS.map(({ key, label }) => {
                    const checked = (testQuestionTypes || []).includes(key)
                    return (
                      <li key={key}>
                        <label
                          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setTestQuestionTypes((prev) => {
                                const p = Array.isArray(prev) ? prev : ['word_to_meaning']
                                if (p.includes(key)) {
                                  if (p.length <= 1) {
                                    alert('출제 방식은 최소 한 가지를 선택해 주세요.')
                                    return p
                                  }
                                  return p.filter((x) => x !== key)
                                }
                                return [...p, key]
                              })
                            }}
                          />
                          <span>{label}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}

            {hint ? (
              <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: COLORS.accentText }}>{hint}</p>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 16px',
                  borderRadius: RADIUS.md,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.bg,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                닫기
              </button>
              <button
                type="button"
                disabled={savingModes}
                onClick={() => void saveModes()}
                style={{
                  padding: '10px 18px',
                  borderRadius: RADIUS.md,
                  border: 'none',
                  background: COLORS.headerGradient,
                  color: COLORS.textOnGreen,
                  fontWeight: 700,
                  cursor: savingModes ? 'wait' : 'pointer',
                  opacity: savingModes ? 0.85 : 1,
                }}
              >
                {savingModes ? '저장 중…' : '저장'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
