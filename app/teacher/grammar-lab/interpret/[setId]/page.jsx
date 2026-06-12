'use client'

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/utils/supabaseClient'
import { useTeacher } from '@/utils/useTeacher'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import {
  emptyInterpretRow,
  itemToRow,
  rowToItemInsert,
  rowToItemUpdate,
  sortInterpretRowsByDay,
} from '../../utils/readingInterpretRows'
import { batchInsertReadingInterpretItems, batchUpdateReadingInterpretItems, scheduleClearSaveProgress } from '../../utils/readingInterpretBatchSave'
import { deleteReadingInterpretItem } from '../../utils/readingInterpretDelete'
import { bulkGenerateInterpretMeta } from '../../utils/readingInterpretAi'
import ReadingInterpretItemTable from '../../components/ReadingInterpretItemTable'
import ReadingInterpretBulkImport from '../../components/ReadingInterpretBulkImport'
import SaveProgressOverlay from '../../components/SaveProgressOverlay'

function ReadingInterpretSetDetailContent() {
  const params = useParams()
  const setId = decodeURIComponent(String(params.setId || ''))
  const { teacher, loading: teacherLoading } = useTeacher()
  const teacherId = teacher?.id

  const [quizSet, setQuizSet] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [importSaving, setImportSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(null)
  const [savingRowId, setSavingRowId] = useState(null)
  const [editSetName, setEditSetName] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [bulkAiRunning, setBulkAiRunning] = useState(false)
  const [bulkAiProgress, setBulkAiProgress] = useState(null)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [dayLabels, setDayLabels] = useState({})
  const [dayLabelsSaving, setDayLabelsSaving] = useState(false)

  const uniqueDays = useMemo(() => {
    const set = new Set()
    rows.forEach((r) => {
      const d = Number(r.day)
      if (Number.isFinite(d) && d >= 1) set.add(d)
    })
    return [...set].sort((a, b) => a - b)
  }, [rows])

  /** DB jsonb → 폼 state (키는 문자열 Day 번호) */
  const parseDayLabels = useCallback((raw) => {
    let obj = raw
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj)
      } catch (_parseErr) {
        return {}
      }
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
    const out = {}
    Object.entries(obj).forEach(([key, value]) => {
      const dayKey = String(key).trim()
      const text = String(value ?? '').trim()
      if (dayKey && text) out[dayKey] = text
    })
    return out
  }, [])

  /** uniqueDays + state → 저장용 payload (빈 칸 제외) */
  const buildDayLabelsPayload = useCallback(
    (labelsState, days) => {
      const cleaned = {}
      ;(days || []).forEach((day) => {
        const key = String(day)
        const raw = labelsState?.[key] ?? labelsState?.[day] ?? ''
        const text = String(raw).trim()
        if (text) cleaned[key] = text
      })
      return cleaned
    },
    [],
  )

  const loadSet = useCallback(async () => {
    if (!teacherId || !setId) return null
    const { data, error } = await supabase
      .from('reading_interpret_sets')
      .select('id, set_name, description, hint_tone, awkward_guide, day_labels')
      .eq('id', setId)
      .eq('teacher_id', teacherId)
      .maybeSingle()
    if (error) {
      console.warn('[reading-interpret]', error.message)
      return null
    }
    return data
  }, [teacherId, setId])

  const loadItems = useCallback(async () => {
    if (!setId) return
    const { data, error } = await supabase
      .from('reading_interpret_items')
      .select('id, set_id, order_index, day, sentence_en, correct_translation, key_words, hint, awkward_patterns, critical_phrases')
      .eq('set_id', setId)
      .order('day', { ascending: true, nullsFirst: false })
      .order('order_index', { ascending: true })
    if (error) {
      console.warn('[reading-interpret items]', error.message)
      setRows([])
      return
    }
    setRows(sortInterpretRowsByDay((data || []).map((item, i) => itemToRow(item, i))))
  }, [setId])

  const reload = useCallback(async () => {
    if (!teacherId || !setId) {
      setQuizSet(null)
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const setRow = await loadSet()
      setQuizSet(setRow)
      if (setRow) {
        setEditSetName(setRow.set_name)
        setDayLabels(parseDayLabels(setRow.day_labels))
        await loadItems()
      } else {
        setRows([])
      }
    } finally {
      setLoading(false)
    }
  }, [teacherId, setId, loadSet, loadItems, parseDayLabels])

  useEffect(() => {
    void reload()
  }, [reload])

  const nextOrderIndex = () => {
    if (!rows.length) return 0
    return Math.max(...rows.map((r) => Number(r.order_index) || 0)) + 1
  }

  const handleRowCommit = async (row) => {
    if (!quizSet) return
    setSavingRowId(row.id)
    try {
      if (String(row.id).startsWith('temp-')) {
        const payload = rowToItemInsert(row, setId, nextOrderIndex())
        const { data, error } = await supabase.from('reading_interpret_items').insert(payload).select('id').single()
        if (error) {
          alert('저장 실패: ' + error.message)
          return
        }
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...itemToRow({ ...payload, id: data.id }), _expanded: false } : r,
          ),
        )
        return
      }
      const payload = rowToItemUpdate(row)
      const { error } = await supabase
        .from('reading_interpret_items')
        .update(payload)
        .eq('id', row.id)
        .eq('set_id', setId)
      if (error) {
        alert('저장 실패: ' + error.message)
        return
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...payload, _expanded: false } : r)))
    } finally {
      setSavingRowId(null)
    }
  }

  const handleRowDelete = async (row) => {
    if (!confirm('이 문항을 삭제할까요?')) return
    if (String(row.id).startsWith('temp-')) {
      setRows((p) => p.filter((r) => r.id !== row.id))
      return
    }
    const result = await deleteReadingInterpretItem(supabase, { setId, itemId: row.id })
    if (!result.ok) {
      alert('삭제 실패: ' + (result.error || '알 수 없음'))
      return
    }
    void loadItems()
  }

  const handleBulkImport = async (imported) => {
    if (!quizSet || !imported.length) return
    setImportSaving(true)
    try {
      const startIndex = nextOrderIndex()
      const payload = imported.map((row, i) =>
        rowToItemInsert(
          {
            sentence_en: row.sentence_en,
            correct_translation: row.correct_translation,
            key_words: row.key_words,
            hint: row.hint,
            day: row.day,
          },
          setId,
          startIndex + i,
        ),
      )
      setSaveProgress({ stage: '문항 등록', current: 0, total: payload.length })
      await batchInsertReadingInterpretItems(supabase, payload, (p) => setSaveProgress(p))
      scheduleClearSaveProgress(setSaveProgress, payload.length)
      setBulkOpen(false)
      await loadItems()
    } catch (e) {
      alert('저장 실패: ' + (e?.message || e))
      setSaveProgress(null)
    } finally {
      setImportSaving(false)
    }
  }

  const saveAllRows = async (rowsToSave) => {
    const count = await batchUpdateReadingInterpretItems(supabase, setId, rowsToSave, (p) =>
      setSaveProgress(p),
    )
    scheduleClearSaveProgress(setSaveProgress, count)
    return count
  }

  const handleBulkSaveAll = async () => {
    if (!quizSet || bulkSaving) return
    const targets = rows.filter((r) => !String(r.id).startsWith('temp-'))
    if (!targets.length) {
      alert('저장할 문항이 없습니다.')
      return
    }
    setBulkSaving(true)
    try {
      const count = await saveAllRows(targets)
      alert(`${count}개 항목 저장 완료`)
    } catch (e) {
      alert('저장 실패: ' + (e?.message || e))
      setSaveProgress(null)
    } finally {
      setBulkSaving(false)
    }
  }

  const handleBulkAi = async () => {
    if (!quizSet || bulkAiRunning) return
    if (!rows.some((r) => !String(r.id).startsWith('temp-'))) {
      alert('저장된 문항이 없습니다. 먼저 문항을 저장하세요.')
      return
    }
    setBulkAiRunning(true)
    setBulkAiProgress({ current: 0, total: 0 })
    try {
      const setContext = {
        hint_tone: quizSet.hint_tone,
        awkward_guide: quizSet.awkward_guide,
      }
      const { updatedRows, processed, skipped } = await bulkGenerateInterpretMeta(
        supabase,
        rows,
        setContext,
        (p) => setBulkAiProgress(p),
      )
      setRows(updatedRows)
      if (processed > 0) {
        const saved = await saveAllRows(updatedRows)
        alert(`${processed}개 AI 생성, ${skipped}개 스킵 · ${saved}개 항목 저장 완료`)
      } else {
        alert(`${processed}개 처리, ${skipped}개 스킵`)
      }
    } catch (e) {
      alert('일괄 AI 생성 실패: ' + (e?.message || e))
    } finally {
      setBulkAiRunning(false)
      setBulkAiProgress(null)
    }
  }

  const handleSaveDayLabels = async () => {
    if (!teacherId) {
      console.warn('[day_labels] save aborted — no teacherId')
      return
    }
    if (!quizSet?.id) {
      console.warn('[day_labels] save aborted — no quizSet.id')
      return
    }
    if (dayLabelsSaving) return

    const cleaned = buildDayLabelsPayload(dayLabels, uniqueDays)
    uniqueDays.forEach((day) => {
      const key = String(day)
      const el = document.getElementById(`day-label-${quizSet.id}-${day}`)
      if (!el || !('value' in el)) return
      const text = String(el.value || '').trim()
      if (text) cleaned[key] = text
      else delete cleaned[key]
    })
    console.log('[day_labels] save payload', cleaned)

    setDayLabelsSaving(true)
    try {
      const { data, error } = await supabase
        .from('reading_interpret_sets')
        .update({ day_labels: cleaned })
        .eq('id', quizSet.id)
        .eq('teacher_id', teacherId)
        .select('id, day_labels')
        .maybeSingle()
      if (error) {
        alert('Day 설명 저장 실패: ' + error.message)
        console.warn('[day_labels] update error', error.message)
        return
      }
      if (!data) {
        alert('Day 설명 저장 실패: 변경된 행이 없습니다. (권한 또는 세트 ID 확인)')
        console.warn('[day_labels] update returned no row', { setId: quizSet.id, teacherId })
        return
      }
      const saved = parseDayLabels(data.day_labels)
      setDayLabels(saved)
      setQuizSet((prev) => (prev ? { ...prev, day_labels: saved } : prev))
    } finally {
      setDayLabelsSaving(false)
    }
  }

  const handleRenameSet = async () => {
    if (!teacherId || !quizSet) return
    const newName = String(editSetName).trim()
    if (!newName) {
      alert('세트명을 입력하세요.')
      return
    }
    if (newName === quizSet.set_name) {
      setEditOpen(false)
      return
    }
    setRenaming(true)
    try {
      const { error } = await supabase
        .from('reading_interpret_sets')
        .update({ set_name: newName })
        .eq('id', setId)
        .eq('teacher_id', teacherId)
      if (error) {
        alert('이름 변경 실패: ' + error.message)
        return
      }
      setQuizSet((prev) => (prev ? { ...prev, set_name: newName } : prev))
      setEditOpen(false)
    } finally {
      setRenaming(false)
    }
  }

  if (teacherLoading || loading) {
    return <p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>
  }
  if (!teacherId) {
    return <p style={{ color: COLORS.textSecondary }}>선생님 정보가 없습니다.</p>
  }
  if (!quizSet) {
    return (
      <p style={{ color: COLORS.textSecondary }}>
        세트를 찾을 수 없습니다. <Link href="/teacher/grammar-lab">목록으로</Link>
      </p>
    )
  }

  return (
    <div className="teacher-grammar-lab-page" style={{ width: '100%', maxWidth: 'none', minHeight: '100%' }}>
      <Link href="/teacher/grammar-lab?tab=reading_interpret" style={{ fontSize: 14, color: COLORS.textSecondary }}>
        ← 독해 훈련소
      </Link>

      <header
        className="teacher-page-header-bleed"
        style={{
          margin: '12px 0 20px',
          padding: '14px 18px',
          borderRadius: RADIUS.lg,
          background: COLORS.headerGradient,
          color: COLORS.textOnGreen,
          boxShadow: SHADOW.card,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{quizSet.set_name}</h1>
          <button
            type="button"
            onClick={() => {
              setEditSetName(quizSet.set_name)
              setEditOpen(true)
            }}
            style={{
              padding: '6px 12px',
              borderRadius: RADIUS.md,
              border: '1px solid rgba(255,255,255,0.4)',
              background: 'rgba(255,255,255,0.15)',
              color: COLORS.textOnGreen,
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            편집
          </button>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.92 }}>
          독해해석 · 문항 {rows.length}건
        </p>
        {quizSet.description ? (
          <p style={{ margin: '6px 0 0', fontSize: 14, opacity: 0.88 }}>설명: {quizSet.description}</p>
        ) : null}
        {quizSet.hint_tone || quizSet.awkward_guide ? (
          <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.85 }}>
            AI 힌트 톤: {quizSet.hint_tone || '(기본)'} · 어색 가이드: {quizSet.awkward_guide || '(기본)'}
          </p>
        ) : null}
      </header>

      {editOpen ? (
        <section
          style={{
            marginBottom: 16,
            padding: 16,
            borderRadius: RADIUS.lg,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
          }}
        >
          <label style={{ fontWeight: 700, fontSize: 14 }}>세트명</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input
              value={editSetName}
              onChange={(e) => setEditSetName(e.target.value)}
              style={{
                flex: '1 1 200px',
                minWidth: 0,
                padding: '10px 12px',
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                fontSize: 15,
              }}
            />
            <button
              type="button"
              disabled={renaming || !String(editSetName).trim()}
              onClick={() => void handleRenameSet()}
              style={secondaryBtn}
            >
              {renaming ? '저장 중…' : '저장'}
            </button>
            <button type="button" onClick={() => setEditOpen(false)} style={secondaryBtn}>
              취소
            </button>
          </div>
        </section>
      ) : null}

      {uniqueDays.length > 0 ? (
        <section
          style={{
            marginBottom: 16,
            padding: 16,
            borderRadius: RADIUS.lg,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Day 설명</h2>
            <button
              type="button"
              disabled={dayLabelsSaving}
              onClick={() => void handleSaveDayLabels()}
              style={secondaryBtn}
            >
              {dayLabelsSaving ? '저장 중…' : 'Day 설명 저장'}
            </button>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: COLORS.textSecondary }}>
            학생앱 Day 선택 화면에 표시됩니다. 빈 칸은 저장되지 않습니다.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {uniqueDays.map((day) => (
              <div
                key={day}
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 14 }}
              >
                <span style={{ minWidth: 56, fontWeight: 800 }}>Day {day}</span>
                <input
                  id={`day-label-${quizSet.id}-${day}`}
                  value={dayLabels[String(day)] ?? ''}
                  onChange={(e) => {
                    const next = String(e.target.value)
                    setDayLabels((prev) => ({
                      ...prev,
                      [String(day)]: next,
                    }))
                  }}
                  placeholder="예: be+추상명사"
                  style={{
                    flex: '1 1 200px',
                    minWidth: 0,
                    padding: '8px 10px',
                    borderRadius: RADIUS.md,
                    border: `1px solid ${COLORS.border}`,
                    fontSize: 14,
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <button type="button" onClick={() => setBulkOpen(true)} style={primaryBtn}>
          가져오기 추가
        </button>
        <button
          type="button"
          onClick={() => setRows((p) => [emptyInterpretRow(nextOrderIndex()), ...p])}
          style={secondaryBtn}
        >
          + 행 추가
        </button>
        <button
          type="button"
          disabled={bulkAiRunning || !rows.length}
          onClick={() => void handleBulkAi()}
          style={{ ...secondaryBtn, borderColor: '#c4b5fd', background: '#f5f3ff', color: '#5b21b6' }}
        >
          {bulkAiRunning
            ? bulkAiProgress
              ? `${bulkAiProgress.current}/${bulkAiProgress.total || '…'} 처리 중`
              : 'AI 생성 중…'
            : '✨ 전체 AI 자동 생성'}
        </button>
        <button
          type="button"
          disabled={bulkSaving || bulkAiRunning || !rows.some((r) => !String(r.id).startsWith('temp-'))}
          onClick={() => void handleBulkSaveAll()}
          style={secondaryBtn}
        >
          {bulkSaving ? '저장 중…' : '💾 변경사항 전체 저장'}
        </button>
      </div>

      <ReadingInterpretItemTable
        rows={rows}
        onRowsChange={setRows}
        onRowCommit={handleRowCommit}
        onRowDelete={handleRowDelete}
        savingRowId={savingRowId}
        supabase={supabase}
        setContext={{
          hint_tone: quizSet.hint_tone,
          awkward_guide: quizSet.awkward_guide,
        }}
      />

      <SaveProgressOverlay progress={saveProgress} />

      <ReadingInterpretBulkImport
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onImported={handleBulkImport}
        saving={importSaving}
      />
    </div>
  )
}

const primaryBtn = {
  padding: '10px 16px',
  borderRadius: RADIUS.md,
  border: 'none',
  background: COLORS.primary,
  color: COLORS.textOnGreen,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 14,
}
const secondaryBtn = {
  padding: '8px 14px',
  borderRadius: RADIUS.md,
  border: `1px solid ${COLORS.border}`,
  background: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
}

export default function ReadingInterpretSetDetailPage() {
  return (
    <Suspense fallback={<p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>}>
      <ReadingInterpretSetDetailContent />
    </Suspense>
  )
}
