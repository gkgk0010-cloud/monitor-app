'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import { assignDaysEqual, assignDaysChunk } from '../utils/dayAssign'
import {
  ALL_MODE_KEYS,
  parseAvailableModes,
  buildAvailableModesJson,
  defaultRequiredForBaseKeys,
} from '../utils/learningModes'
import LearningModesPicker from './LearningModesPicker'

const SET_TYPE_LABELS = {
  word: '단어 세트',
  sentence: '문장 세트',
  image: '이미지 세트',
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
 * }} props
 */
export default function SetSettingsModal({ open, onClose, setName, teacherId, inferredSetType, hasImageWords, onSaved }) {
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
  const [rows, setRows] = useState([])
  const [hasDayPreview, setHasDayPreview] = useState(false)
  const [savingDays, setSavingDays] = useState(false)
  const [savingModes, setSavingModes] = useState(false)
  const [hint, setHint] = useState(null)

  const load = useCallback(async () => {
    const sn = String(setName || '').trim()
    if (!sn || !teacherId) return
    setLoading(true)
    setHint(null)
    setHasDayPreview(false)
    setWordSetId(null)
    try {
      const [{ data: ws, error: wsErr }, { data: wordRows, error: wErr }] = await Promise.all([
        supabase.from('word_sets').select('id, set_type, available_modes').eq('teacher_id', teacherId).eq('name', sn).maybeSingle(),
        supabase
          .from('words')
          .select('id, word, meaning, example_sentence, day, difficulty, image_url, image_source, youtube_url')
          .eq('teacher_id', teacherId)
          .eq('set_name', sn)
          .order('day', { ascending: true }),
      ])
      if (wsErr) console.warn('[SetSettingsModal] word_sets', wsErr.message)
      if (wErr) console.warn('[SetSettingsModal] words', wErr.message)

      let st = String(ws?.set_type || inferredSetType || 'word').trim()
      if (st !== 'sentence' && st !== 'image') st = 'word'
      setSetType(st)

      const parsed = parseAvailableModes(ws?.available_modes, st)
      setModes(parsed.modes)
      setRequiredByMode(parsed.requiredByMode)
      let ps = parsed.passScore
      let ma = parsed.maxAttempts
      const wid = ws?.id ? String(ws.id) : null
      setWordSetId(wid)
      if (wid) {
        const { data: vts } = await supabase.from('vocab_test_settings').select('pass_score, max_attempts').eq('word_set_id', wid).maybeSingle()
        if (vts) {
          if (vts.pass_score != null) ps = Math.min(100, Math.max(0, Number(vts.pass_score)))
          if (vts.max_attempts != null) ma = Math.max(1, Number(vts.max_attempts))
        }
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
      if (setType === 'sentence') return Boolean(ex && m)
      return Boolean(w && m)
    }).length
    if (validCount === 0) {
      alert(setType === 'sentence' ? '예문·뜻이 있는 행이 없습니다.' : '영단어·뜻이 있는 행이 없습니다.')
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
    const seq =
      dayMode === 'equal'
        ? assignDaysEqual(validCount, Math.max(1, totalDays))
        : assignDaysChunk(validCount, Math.max(1, perDay))
    let vi = 0
    setRows((prev) =>
      prev.map((r) => {
        const w = String(r.word || '').trim()
        const m = String(r.meaning || '').trim()
        const ex = String(r.example_sentence || '').trim()
        const ok = setType === 'sentence' ? ex && m : w && m
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
      if (setType === 'sentence') return Boolean(ex && m)
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

  const saveModes = async () => {
    if (!teacherId) return
    const selected = ALL_MODE_KEYS.filter((k) => modes[k])
    if (selected.length === 0) {
      alert('학습 모드를 하나 이상 선택해 주세요.')
      return
    }
    const sn = String(setName || '').trim()
    const availableModes = buildAvailableModesJson(modes, requiredByMode, passScore, maxAttempts)
    setSavingModes(true)
    try {
      const { error } = await supabase.from('word_sets').upsert(
        {
          teacher_id: teacherId,
          name: sn,
          set_type: setType,
          available_modes: availableModes,
        },
        { onConflict: 'teacher_id,name' },
      )
      if (error) throw error

      const { data: row } = await supabase.from('word_sets').select('id').eq('teacher_id', teacherId).eq('name', sn).maybeSingle()
      const wid = row?.id ? String(row.id) : wordSetId

      if (wid && modes.test) {
        const { error: e2 } = await supabase.from('vocab_test_settings').upsert(
          {
            word_set_id: wid,
            pass_score: Math.min(100, Math.max(0, Math.round(Number(passScore) || 80))),
            max_attempts: Math.max(1, Math.round(Number(maxAttempts) || 3)),
          },
          { onConflict: 'word_set_id' },
        )
        if (e2) console.warn('[vocab_test_settings]', e2.message)
      }

      setHint('학습 모드가 저장되었습니다.')
      onSaved?.()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingModes(false)
    }
  }

  if (!open) return null

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
            <p style={{ margin: '0 0 8px', fontSize: 14, color: COLORS.textPrimary }}>
              <span style={{ fontWeight: 700, color: COLORS.accentText }}>세트 이름:</span> {String(setName).trim() || '—'}
            </p>
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
