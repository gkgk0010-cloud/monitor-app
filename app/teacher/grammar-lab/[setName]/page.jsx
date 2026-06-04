'use client'

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/utils/supabaseClient'
import { useTeacher } from '@/utils/useTeacher'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import WordTable from '../../words/components/WordTable'
import BulkImport from '../../words/components/BulkImport'
import BoxAnswerModal from '../components/BoxAnswerModal'
import {
  emptyGrammarRow,
  isGrammarRowValid,
  rowToStiInsert,
  rowToStiUpdate,
  stiToTableRow,
  TRAINING_KIND_LABELS,
} from '../utils/grammarLabRows'
import {
  applyBoxAnswersForImportedRowsBatched,
  formatBoxImportResultMessage,
} from '../utils/boxDrillImport'
import { deleteGrammarLabItem } from '../utils/grammarLabDelete'
import { batchInsertSentenceTrainingItems } from '../utils/grammarLabBatchSave'
import SaveProgressOverlay from '../components/SaveProgressOverlay'

function trainingKindFromQuery(searchParams) {
  const k = searchParams.get('kind')
  if (k === 'box_drill' || k === 'word_order') return k
  return null
}

function GrammarSetDetailContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const setName = decodeURIComponent(String(params.setName || ''))
  const kindFromUrl = trainingKindFromQuery(searchParams)
  const [trainingKind, setTrainingKind] = useState(kindFromUrl || 'word_order')
  const { teacher, loading: teacherLoading } = useTeacher()
  const teacherId = teacher?.id

  const [rows, setRows] = useState([])
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [boxItem, setBoxItem] = useState(null)
  const [boxCounts, setBoxCounts] = useState({})
  const [importSaving, setImportSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(null)

  /** URL에 ?kind= 가 없어도 DB training_kind 기준으로 박스/어순 분기 */
  useEffect(() => {
    if (!teacherId || !setName) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('sentence_training_items')
        .select('training_kind')
        .eq('teacher_id', teacherId)
        .eq('set_name', setName)
        .limit(1)
      if (cancelled || error) return
      const dbKind = data?.[0]?.training_kind
      if (dbKind === 'box_drill' || dbKind === 'word_order') {
        setTrainingKind(dbKind)
        return
      }
      if (kindFromUrl) setTrainingKind(kindFromUrl)
    })()
    return () => {
      cancelled = true
    }
  }, [teacherId, setName, kindFromUrl])

  const loadItems = useCallback(async () => {
    if (!teacherId || !setName) return { navItems: [], incompleteItems: [] }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('sentence_training_items')
        .select('id, sentence_text, hint_ko, set_name, day, sort_order, difficulty, image_url, youtube_url, training_kind')
        .eq('teacher_id', teacherId)
        .eq('set_name', setName)
        .eq('training_kind', trainingKind)
        .order('day')
        .order('sort_order')
      if (error) {
        console.warn('[grammar-lab detail]', error.message)
        setRows([])
        setBoxCounts({})
        return { navItems: [], incompleteItems: [] }
      }
      const ids = (data || []).map((d) => d.id)
      const counts = {}
      if (trainingKind === 'box_drill' && ids.length) {
        const { data: boxes } = await supabase.from('box_drill_answers').select('item_id').in('item_id', ids)
        for (const b of boxes || []) {
          counts[b.item_id] = (counts[b.item_id] || 0) + 1
        }
      }
      setBoxCounts(counts)
      const tableRows = (data || []).map((item) => stiToTableRow(item, counts[item.id] || 0))
      setRows(tableRows)
      const navItems = tableRows
        .filter((r) => !String(r.id).startsWith('temp-'))
        .map((r) => ({
          id: r.id,
          sentence_text: String(r.example_sentence || '').split('\n')[0],
          hint_ko: String(r.meaning || '').trim(),
        }))
      const incompleteItems = navItems.filter((item) => !(counts[item.id] > 0))
      return { navItems, incompleteItems }
    } finally {
      setLoading(false)
    }
  }, [teacherId, setName, trainingKind])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const stats = useMemo(() => {
    const total = rows.length
    if (trainingKind !== 'box_drill') return { total, complete: total, incomplete: 0 }
    let incomplete = 0
    for (const r of rows) {
      if (!(boxCounts[r.id] > 0)) incomplete++
    }
    return { total, complete: total - incomplete, incomplete }
  }, [rows, boxCounts, trainingKind])

  const navItems = useMemo(
    () =>
      rows
        .filter((r) => !String(r.id).startsWith('temp-'))
        .map((r) => ({
          id: r.id,
          sentence_text: String(r.example_sentence || '').split('\n')[0],
          hint_ko: String(r.meaning || '').trim(),
        })),
    [rows],
  )

  const boxQueueMeta = useMemo(() => {
    if (!boxItem) {
      return { incompleteRemaining: stats.incomplete, totalSentences: navItems.length, navIndex: 0 }
    }
    const navIndex = navItems.findIndex((n) => n.id === boxItem.id)
    return {
      incompleteRemaining: stats.incomplete,
      totalSentences: navItems.length,
      navIndex: navIndex >= 0 ? navIndex + 1 : 0,
    }
  }, [boxItem, navItems, stats.incomplete])

  const handleRowCommit = async (row) => {
    if (!teacherId || !isGrammarRowValid(row)) {
      alert('예문과 해석(뜻)은 필수입니다.')
      return
    }
    const payload = rowToStiUpdate(row, trainingKind)
    if (String(row.id).startsWith('temp-')) {
      const insertPayload = rowToStiInsert({ ...row, set_name: setName }, teacherId, trainingKind, rows.length)
      if (!insertPayload) return
      const { data, error } = await supabase.from('sentence_training_items').insert(insertPayload).select('id').single()
      if (error) {
        alert('저장 실패: ' + error.message)
        return
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, id: data.id, _boxCount: 0 } : r)))
      return
    }
    const { error } = await supabase
      .from('sentence_training_items')
      .update(payload)
      .eq('id', row.id)
      .eq('teacher_id', teacherId)
    if (error) {
      alert('저장 실패: ' + error.message)
      return
    }
  }

  const handleRowDelete = async (row) => {
    if (!confirm('이 구문을 삭제할까요?')) return
    if (String(row.id).startsWith('temp-')) {
      setRows((p) => p.filter((r) => r.id !== row.id))
      return
    }
    const result = await deleteGrammarLabItem(supabase, { teacherId, itemId: row.id })
    if (!result.ok) {
      alert('삭제 실패: ' + (result.error || '알 수 없음'))
      return
    }
    void loadItems()
  }

  const openBoxEditor = (row) => {
    setBoxItem({
      id: row.id,
      sentence_text: String(row.example_sentence || '').split('\n')[0],
      hint_ko: String(row.meaning || '').trim(),
    })
  }

  const handleNavigateBoxItem = (target) => {
    setBoxItem({
      id: target.id,
      sentence_text: target.sentence_text,
      hint_ko: target.hint_ko,
    })
  }

  if (teacherLoading || loading) {
    return <p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>
  }
  if (!teacherId) {
    return <p style={{ color: COLORS.textSecondary }}>선생님 정보가 없습니다.</p>
  }

  return (
    <div className="teacher-grammar-lab-page" style={{ width: '100%', maxWidth: 'none', minHeight: '100%' }}>
      <Link href="/teacher/grammar-lab" style={{ fontSize: 14, color: COLORS.textSecondary }}>
        ← 문법 해부실
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
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{setName}</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.92 }}>
          {TRAINING_KIND_LABELS[trainingKind]} · 구문 {stats.total}건
          {trainingKind === 'box_drill'
            ? ` · 박스 완료 ${stats.complete} / 미완료 ${stats.incomplete}`
            : ''}
        </p>
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" onClick={() => setBulkOpen(true)} style={primaryBtn}>
          가져오기 추가
        </button>
        <button
          type="button"
          onClick={() => setRows((p) => [emptyGrammarRow(setName), ...p])}
          style={secondaryBtn}
        >
          + 행 추가
        </button>
      </div>

      <WordTable
        rows={rows}
        onRowsChange={setRows}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        onRowCommit={handleRowCommit}
        columnPreset="sentence"
        showSetNameColumn={false}
        showDayColumn={false}
        showImageColumn
        showDeleteColumn
        onRowDelete={(row) => void handleRowDelete(row)}
        onBoxAnswerClick={trainingKind === 'box_drill' ? (row) => openBoxEditor(row) : undefined}
        getBoxCount={trainingKind === 'box_drill' ? (row) => Number(row._boxCount) || 0 : undefined}
        rowGroupMode="chunk10"
        scrollContainer="window"
        stickyHeaderOffsetPx={120}
        getRowBackground={(row) =>
          trainingKind === 'box_drill' && !row._boxCount ? 'rgba(254,226,226,0.2)' : undefined
        }
      />

      <SaveProgressOverlay progress={saveProgress} />

      <BulkImport
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSaved={() => {}}
        existingSetNames={[setName]}
        localOnly
        initialSetName={setName}
        teacherId={teacherId}
        importSetType={trainingKind === 'box_drill' ? 'box_drill' : 'sentence'}
        forceDayOne
        onLocalImported={async (imported) => {
          if (!teacherId) return
          const validImported = imported
            .filter(isGrammarRowValid)
            .map((r) => ({ ...r, day: 1 }))
          const payload = validImported
            .map((r, i) =>
              rowToStiInsert({ ...r, set_name: setName }, teacherId, trainingKind, rows.length + i),
            )
            .filter(Boolean)
          if (!payload.length) {
            alert('저장할 유효 구문이 없습니다.')
            return
          }
          setImportSaving(true)
          setSaveProgress({ done: 0, total: payload.length, phase: 'items' })
          try {
            const inserted = await batchInsertSentenceTrainingItems(supabase, payload, (p) =>
              setSaveProgress(p),
            )
            let boxMsg = null
            if (trainingKind === 'box_drill' && inserted.length) {
              const withBox = validImported.filter((r) => String(r._boxAnswer ?? '').trim())
              if (withBox.length) {
                setSaveProgress({ done: 0, total: withBox.length, phase: 'boxes' })
                const boxStats = await applyBoxAnswersForImportedRowsBatched(
                  supabase,
                  inserted,
                  validImported,
                  (p) => setSaveProgress(p),
                )
                boxMsg = formatBoxImportResultMessage(boxStats)
              }
            }
            setBulkOpen(false)
            await loadItems()
            if (boxMsg) alert(boxMsg)
          } catch (e) {
            alert('저장 실패: ' + (e?.message || e))
          } finally {
            setImportSaving(false)
            setSaveProgress(null)
          }
        }}
      />

      <BoxAnswerModal
        open={Boolean(boxItem)}
        item={boxItem}
        navItems={navItems}
        queueMeta={boxQueueMeta}
        onClose={() => setBoxItem(null)}
        onSaved={() => loadItems()}
        onNavigateToItem={handleNavigateBoxItem}
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

export default function GrammarSetDetailPage() {
  return (
    <Suspense fallback={<p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>}>
      <GrammarSetDetailContent />
    </Suspense>
  )
}
