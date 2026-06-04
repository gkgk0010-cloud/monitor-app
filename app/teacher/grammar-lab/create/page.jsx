'use client'

import { useState, useCallback, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/utils/supabaseClient'
import { useTeacher } from '@/utils/useTeacher'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import WordTable from '../../words/components/WordTable'
import BulkImport from '../../words/components/BulkImport'
import {
  meaningIsMissing,
  wordLabelForMeaningAlert,
  formatEmptyMeaningAlert,
} from '../../words/utils/wordMeaningGuard'
import {
  emptyGrammarRow,
  isGrammarRowValid,
  rowToStiInsert,
  TRAINING_KIND_LABELS,
  GRAMMAR_LAB_FIXED_DAY,
} from '../utils/grammarLabRows'
import {
  applyBoxAnswersForImportedRowsBatched,
  formatBoxImportResultMessage,
} from '../utils/boxDrillImport'
import { batchInsertSentenceTrainingItems } from '../utils/grammarLabBatchSave'
import SaveProgressOverlay from '../components/SaveProgressOverlay'

function CreateGrammarSetContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { teacher, loading: teacherLoading } = useTeacher()
  const teacherId = teacher?.id

  const initialKind = searchParams.get('kind') === 'box_drill' ? 'box_drill' : 'word_order'
  const [trainingKind, setTrainingKind] = useState(initialKind)
  const [setName, setSetName] = useState('')
  const [rows, setRows] = useState(() => [emptyGrammarRow('')])
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(null)
  const [meaningHighlightRowIds, setMeaningHighlightRowIds] = useState(() => new Set())

  const validCount = useMemo(() => rows.filter(isGrammarRowValid).length, [rows])

  const saveAll = async () => {
    if (!teacherId) {
      alert('선생님 정보를 불러올 수 없습니다.')
      return
    }
    const sn = String(setName).trim()
    if (!sn) {
      alert('세트 이름을 입력하세요.')
      return
    }
    const candidates = rows
      .filter(isGrammarRowValid)
      .map((r) => ({ ...r, day: GRAMMAR_LAB_FIXED_DAY }))
    if (!candidates.length) {
      alert('저장할 구문이 없습니다. 예문과 해석(뜻)을 입력했는지 확인하세요.')
      return
    }
    const badMeaning = []
    for (const r of candidates) {
      if (!meaningIsMissing(r.meaning)) continue
      badMeaning.push({
        id: String(r.id),
        row: rows.findIndex((x) => x.id === r.id) + 1,
        label: wordLabelForMeaningAlert(r, { sentenceStyle: true }),
      })
    }
    if (badMeaning.length) {
      setMeaningHighlightRowIds(new Set(badMeaning.map((x) => x.id)))
      alert(formatEmptyMeaningAlert(badMeaning))
      return
    }

    setSaving(true)
    setSaveProgress({ done: 0, total: candidates.length, phase: 'items' })
    try {
      const payload = candidates
        .map((r, i) => rowToStiInsert({ ...r, set_name: sn }, teacherId, trainingKind, i))
        .filter(Boolean)
      const inserted = await batchInsertSentenceTrainingItems(supabase, payload, (p) =>
        setSaveProgress(p),
      )
      if (trainingKind === 'box_drill' && inserted.length) {
        const withBox = candidates.filter((r) => String(r._boxAnswer ?? '').trim())
        if (withBox.length) {
          setSaveProgress({ done: 0, total: withBox.length, phase: 'boxes' })
          const boxStats = await applyBoxAnswersForImportedRowsBatched(
            supabase,
            inserted,
            candidates,
            (p) => setSaveProgress(p),
          )
          const boxMsg = formatBoxImportResultMessage(boxStats)
          if (boxMsg) alert(boxMsg)
        }
      }
      router.push(`/teacher/grammar-lab/${encodeURIComponent(sn)}?kind=${trainingKind}`)
    } catch (e) {
      alert('저장 실패: ' + (e?.message || e))
    } finally {
      setSaving(false)
      setSaveProgress(null)
    }
  }

  const syncSetName = useCallback((name) => {
    setRows((prev) => prev.map((r) => ({ ...r, set_name: name })))
  }, [])

  if (teacherLoading) {
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
      <h1 style={{ margin: '12px 0 4px', fontSize: 22, fontWeight: 800 }}>새 세트 만들기</h1>
      <p style={{ margin: '0 0 20px', color: COLORS.textSecondary, fontSize: 14 }}>
        엑셀·AI·텍스트 일괄 등록 후 저장 ·{' '}
        {trainingKind === 'box_drill'
          ? '엑셀 정답(C) 컬럼이 있으면 저장 시 박스 정답 자동 등록'
          : '어순 구문 저장'}
        {' '}
        (Day 구분 없음)
      </p>

      <section style={{ marginBottom: 20, padding: 16, borderRadius: RADIUS.lg, border: `1px solid ${COLORS.border}`, background: COLORS.surface }}>
        <label style={{ fontWeight: 700, fontSize: 14 }}>세트 이름 *</label>
        <input
          value={setName}
          onChange={(e) => {
            setSetName(e.target.value)
            syncSetName(e.target.value)
          }}
          placeholder="예: RC 구문"
          style={{ width: '100%', marginTop: 8, padding: '10px 12px', borderRadius: RADIUS.md, border: `1px solid ${COLORS.border}`, fontSize: 15 }}
        />
        <p style={{ margin: '16px 0 8px', fontWeight: 700, fontSize: 14 }}>훈련 종류 *</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['word_order', 'box_drill']).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTrainingKind(k)}
              style={{
                padding: '10px 16px',
                borderRadius: RADIUS.md,
                border: trainingKind === k ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
                background: trainingKind === k ? '#ecfdf5' : '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {TRAINING_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" onClick={() => setBulkOpen(true)} style={primaryBtn}>
          가져오기 (AI / 텍스트 / 엑셀)
        </button>
        <button
          type="button"
          onClick={() => setRows((p) => [emptyGrammarRow(setName), ...p])}
          style={secondaryBtn}
        >
          + 행 추가
        </button>
        <button type="button" disabled={saving} onClick={() => void saveAll()} style={{ ...primaryBtn, marginLeft: 'auto' }}>
          {saving ? '저장 중…' : `저장${validCount > 0 ? ` (${validCount}건)` : ''}`}
        </button>
      </div>

      <WordTable
        rows={rows}
        onRowsChange={setRows}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        columnPreset="sentence"
        showSetNameColumn={false}
        showDayColumn={false}
        showDeleteColumn
        onRowDelete={(row) => setRows((p) => p.filter((r) => r.id !== row.id))}
        highlightRowIds={meaningHighlightRowIds}
        rowGroupMode="chunk10"
        scrollContainer="window"
        stickyHeaderOffsetPx={120}
      />

      <SaveProgressOverlay progress={saveProgress} />

      <BulkImport
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSaved={() => {}}
        existingSetNames={[]}
        localOnly
        initialSetName={setName}
        teacherId={teacherId}
        importSetType={trainingKind === 'box_drill' ? 'box_drill' : 'sentence'}
        forceDayOne
        onLocalImported={(imported) => {
          setRows((prev) => [
            ...imported.map((r) => ({
              ...r,
              set_name: setName,
              day: GRAMMAR_LAB_FIXED_DAY,
            })),
            ...prev,
          ])
          setBulkOpen(false)
        }}
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
  padding: '10px 16px',
  borderRadius: RADIUS.md,
  border: `1px solid ${COLORS.border}`,
  background: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 14,
}

export default function CreateGrammarSetPage() {
  return (
    <Suspense fallback={<p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>}>
      <CreateGrammarSetContent />
    </Suspense>
  )
}
