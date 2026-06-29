'use client'

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
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
import { fetchBoxCountsByItemId } from '../utils/boxDrillQuery'
import { estimateImportBoxCount, rowHasImportBoxes } from '../utils/boxDrillExcel'
import { deleteGrammarLabItem } from '../utils/grammarLabDelete'
import { renameGrammarLabSet } from '../utils/grammarLabRename'
import {
  batchInsertSentenceTrainingItems,
  scheduleClearSaveProgress,
} from '../utils/grammarLabBatchSave'
import SaveProgressOverlay from '../components/SaveProgressOverlay'
import GrammarHintFillPanel from '../components/GrammarHintFillPanel'
import { persistHintKoRow } from '../utils/grammarHintPersist'

function trainingKindFromQuery(searchParams) {
  const k = searchParams.get('kind')
  if (k === 'box_drill' || k === 'word_order') return k
  return null
}

function GrammarSetDetailContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const setName = decodeURIComponent(String(params.setName || ''))
  const kindFromUrl = trainingKindFromQuery(searchParams)
  const [trainingKind, setTrainingKind] = useState(kindFromUrl || 'word_order')
  const { teacher, loading: teacherLoading } = useTeacher()
  const teacherId = teacher?.id

  const [editSetName, setEditSetName] = useState(setName)
  const [renaming, setRenaming] = useState(false)

  const [rows, setRows] = useState([])
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [boxItem, setBoxItem] = useState(null)
  const [boxCounts, setBoxCounts] = useState({})
  const [importSaving, setImportSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(null)

  useEffect(() => {
    setEditSetName(setName)
  }, [setName])

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
      const counts =
        trainingKind === 'box_drill' && ids.length
          ? await fetchBoxCountsByItemId(supabase, ids)
          : {}
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

  const handleRenameSet = async () => {
    if (!teacherId) return
    const newSn = String(editSetName).trim()
    if (!newSn) {
      alert('세트 이름을 입력하세요.')
      return
    }
    if (newSn === setName) return
    setRenaming(true)
    try {
      const result = await renameGrammarLabSet(supabase, {
        teacherId,
        oldName: setName,
        newName: newSn,
        trainingKind,
      })
      if (!result.ok) {
        if (result.error === 'duplicate-name') {
          alert('같은 훈련 종류에 이미 같은 이름의 세트가 있습니다.')
        } else {
          alert('이름 변경 실패: ' + (result.error || '알 수 없음'))
        }
        return
      }
      router.replace(`/teacher/grammar-lab/${encodeURIComponent(newSn)}?kind=${trainingKind}`)
    } finally {
      setRenaming(false)
    }
  }

  const persistHintKo = useCallback(
    async (row) => {
      if (!teacherId) return { ok: false }
      return persistHintKoRow(supabase, { row, trainingKind, teacherId })
    },
    [teacherId, trainingKind],
  )

  if (teacherLoading || loading) {
    return <p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>
  }
  if (!teacherId) {
    return <p style={{ color: COLORS.textSecondary }}>선생님 정보가 없습니다.</p>
  }

  return (
    <div className="teacher-grammar-lab-page" style={{ width: '100%', maxWidth: 'none', minHeight: '100%' }}>
      <Link href="/teacher/grammar-lab" style={{ fontSize: 14, color: COLORS.textSecondary }}>
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
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{setName}</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.92 }}>
          {TRAINING_KIND_LABELS[trainingKind]} · 구문 {stats.total}건
          {trainingKind === 'box_drill'
            ? ` · 박스 완료 ${stats.complete} / 미완료 ${stats.incomplete}`
            : ''}
        </p>
      </header>

      <section
        style={{
          marginBottom: 16,
          padding: 16,
          borderRadius: RADIUS.lg,
          border: `1px solid ${COLORS.border}`,
          background: COLORS.surface,
        }}
      >
        <label style={{ fontWeight: 700, fontSize: 14 }}>세트 이름</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input
            value={editSetName}
            onChange={(e) => setEditSetName(e.target.value)}
            placeholder="예: RC 구문"
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
            disabled={renaming || !String(editSetName).trim() || String(editSetName).trim() === setName}
            onClick={() => void handleRenameSet()}
            style={{
              ...secondaryBtn,
              opacity: renaming || !String(editSetName).trim() || String(editSetName).trim() === setName ? 0.5 : 1,
            }}
          >
            {renaming ? '저장 중…' : '이름 저장'}
          </button>
        </div>
      </section>

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
        showDayColumn={trainingKind === 'box_drill'}
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

      <GrammarHintFillPanel
        rows={
          selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(String(r.id))) : rows
        }
        persistContext={{
          teacherId,
          setName,
          trainingKind,
          onPersistRow: persistHintKo,
        }}
        onFilled={async (updated) => {
          setRows(updated)
        }}
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
        forceDayOne={trainingKind !== 'box_drill'}
        onLocalImported={async (imported) => {
          if (!teacherId) return
          const validImported = imported.filter(isGrammarRowValid).map((r) => ({
            ...r,
            day:
              trainingKind === 'box_drill'
                ? Math.max(1, parseInt(String(r.day ?? 1), 10) || 1)
                : 1,
          }))
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
          try {
            let boxMsg = null
            if (trainingKind === 'box_drill') {
              setSaveProgress({ stage: '문장 등록', current: 0, total: payload.length })
              const inserted = await batchInsertSentenceTrainingItems(supabase, payload, (p) =>
                setSaveProgress(p),
              )
              const withBox = validImported.filter((r) => rowHasImportBoxes(r))
              if (withBox.length && inserted.length) {
                let estBoxRows = 0
                for (const r of withBox) {
                  estBoxRows += estimateImportBoxCount(r)
                }
                setSaveProgress({
                  stage: '박스 정답 등록',
                  current: 0,
                  total: Math.max(estBoxRows, 1),
                })
                const boxStats = await applyBoxAnswersForImportedRowsBatched(
                  supabase,
                  inserted,
                  validImported,
                  (p) => setSaveProgress(p),
                )
                boxMsg = formatBoxImportResultMessage(boxStats)
              }
              scheduleClearSaveProgress(setSaveProgress, payload.length)
            } else {
              const { error } = await supabase.from('sentence_training_items').insert(payload)
              if (error) throw error
            }
            setBulkOpen(false)
            await loadItems()
            if (boxMsg) alert(boxMsg)
          } catch (e) {
            alert('저장 실패: ' + (e?.message || e))
            setSaveProgress(null)
          } finally {
            setImportSaving(false)
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
