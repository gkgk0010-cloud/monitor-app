'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
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
import { batchInsertReadingInterpretItems, scheduleClearSaveProgress } from '../../utils/readingInterpretBatchSave'
import { deleteReadingInterpretItem } from '../../utils/readingInterpretDelete'
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

  const loadSet = useCallback(async () => {
    if (!teacherId || !setId) return null
    const { data, error } = await supabase
      .from('reading_interpret_sets')
      .select('id, set_name, description')
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
      .select('id, set_id, order_index, day, sentence_en, correct_translation, key_words, hint')
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
        await loadItems()
      } else {
        setRows([])
      }
    } finally {
      setLoading(false)
    }
  }, [teacherId, setId, loadSet, loadItems])

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

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
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
      </div>

      <ReadingInterpretItemTable
        rows={rows}
        onRowsChange={setRows}
        onRowCommit={handleRowCommit}
        onRowDelete={handleRowDelete}
        savingRowId={savingRowId}
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
