'use client'

import { useState, useCallback, useMemo, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/utils/supabaseClient'
import { useTeacher } from '@/utils/useTeacher'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import WordTable from '../../words/components/WordTable'
import BulkImport from '../../words/components/BulkImport'
import WordAddedDaySplitModal from '../../words/components/WordAddedDaySplitModal'
import WorkflowSuccessModal from '../../words/components/WorkflowSuccessModal'
import { assignDaysEqual, assignDaysChunk, assignDaysFromManualCounts } from '../../words/utils/dayAssign'
import {
  meaningIsMissing,
  wordLabelForMeaningAlert,
  formatEmptyMeaningAlert,
} from '../../words/utils/wordMeaningGuard'
import {
  emptyGrammarRow,
  isGrammarRowValid,
  rowDayNumber,
  rowToStiInsert,
  TRAINING_KIND_LABELS,
} from '../utils/grammarLabRows'

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
  const [dayMode, setDayMode] = useState('equal')
  const [totalDays, setTotalDays] = useState(7)
  const [perDay, setPerDay] = useState(20)
  const [pageManualSegs, setPageManualSegs] = useState([{ day: 1, count: 0 }])
  const [importCanUseCsvDay, setImportCanUseCsvDay] = useState(false)
  const [hasDayPreview, setHasDayPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hint, setHint] = useState(null)
  const [meaningHighlightRowIds, setMeaningHighlightRowIds] = useState(() => new Set())
  const [workflowModal, setWorkflowModal] = useState(null)
  const [daySplitCount, setDaySplitCount] = useState(0)
  const skipGuideRef = useRef(false)

  const validCount = useMemo(() => rows.filter(isGrammarRowValid).length, [rows])

  const applyDayPreview = (p) => {
    const mode = p?.mode || dayMode
    const td = Math.max(1, parseInt(String(p?.totalDays ?? totalDays), 10) || 1)
    const pd = Math.max(1, parseInt(String(p?.perDay ?? perDay), 10) || 1)
    const manualSegs = p?.manualSegs || pageManualSegs

    if (mode === 'csv_day') {
      setHasDayPreview(true)
      setDaySplitCount(new Set(rows.filter(isGrammarRowValid).map((r) => r.day)).size)
      setHint('엑셀 day 컬럼이 적용되었습니다. 확인 후 저장하세요.')
      setWorkflowModal('day')
      return
    }

    if (mode === 'manual') {
      const res = assignDaysFromManualCounts(validCount, manualSegs)
      if (!res.ok) {
        alert(`Day별 개수 합(${res.sum})이 유효 행 수(${res.expected})와 다릅니다.`)
        return
      }
      let vi = 0
      setRows((prev) =>
        prev.map((r) => {
          if (!isGrammarRowValid(r)) return r
          return { ...r, day: res.seq[vi++] }
        }),
      )
      setDaySplitCount(new Set(res.seq).size)
      setHasDayPreview(true)
      setWorkflowModal('day')
      return
    }

    const seq = mode === 'equal' ? assignDaysEqual(validCount, td) : assignDaysChunk(validCount, pd)
    let vi = 0
    setRows((prev) =>
      prev.map((r) => {
        if (!isGrammarRowValid(r)) return r
        return { ...r, day: seq[vi++] }
      }),
    )
    setDaySplitCount(new Set(seq).size)
    setHasDayPreview(true)
    setWorkflowModal('day')
  }

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
    const candidates = rows.filter(isGrammarRowValid)
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
    if (!hasDayPreview || candidates.some((r) => rowDayNumber(r) < 1)) {
      setWorkflowModal('words')
      return
    }

    setSaving(true)
    setHint(null)
    try {
      const payload = candidates
        .map((r, i) =>
          rowToStiInsert({ ...r, set_name: sn }, teacherId, trainingKind, i),
        )
        .filter(Boolean)
      const { error } = await supabase.from('sentence_training_items').insert(payload)
      if (error) throw error
      router.push(`/teacher/grammar-lab/${encodeURIComponent(sn)}?kind=${trainingKind}`)
    } catch (e) {
      alert('저장 실패: ' + (e?.message || e))
    } finally {
      setSaving(false)
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
    <div style={{ width: '100%', maxWidth: '100%', minHeight: '100%' }}>
      <Link href="/teacher/grammar-lab" style={{ fontSize: 14, color: COLORS.textSecondary }}>
        ← 문법 해부실
      </Link>
      <h1 style={{ margin: '12px 0 4px', fontSize: 22, fontWeight: 800 }}>새 세트 만들기</h1>
      <p style={{ margin: '0 0 20px', color: COLORS.textSecondary, fontSize: 14 }}>
        엑셀·AI·텍스트 일괄 등록 후 Day 배정 · {trainingKind === 'box_drill' ? '박스 정답은 저장 후 세트 상세에서 입력' : '어순 구문 저장'}
      </p>

      <section style={{ marginBottom: 20, padding: 16, borderRadius: RADIUS.lg, border: `1px solid ${COLORS.border}`, background: COLORS.surface }}>
        <label style={{ fontWeight: 700, fontSize: 14 }}>세트 이름 *</label>
        <input
          value={setName}
          onChange={(e) => {
            setSetName(e.target.value)
            syncSetName(e.target.value)
          }}
          placeholder="예: RC 구문 Day1"
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
        <button type="button" onClick={() => setWorkflowModal('words')} style={secondaryBtn}>
          Day 나누기
        </button>
        <button type="button" disabled={saving} onClick={() => void saveAll()} style={{ ...primaryBtn, marginLeft: 'auto' }}>
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
      {hint ? <p style={{ fontSize: 14, color: COLORS.textSecondary }}>{hint}</p> : null}

      <WordTable
        rows={rows}
        onRowsChange={setRows}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        columnPreset="sentence"
        showSetNameColumn={false}
        showDeleteColumn
        onRowDelete={(row) => setRows((p) => p.filter((r) => r.id !== row.id))}
        highlightRowIds={meaningHighlightRowIds}
        rowGroupMode={hasDayPreview ? 'day' : 'chunk10'}
      />

      <BulkImport
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSaved={() => {}}
        existingSetNames={[]}
        localOnly
        initialSetName={setName}
        teacherId={teacherId}
        importSetType="sentence"
        onLocalImported={(imported, meta) => {
          skipGuideRef.current = true
          setHasDayPreview(false)
          setImportCanUseCsvDay(Boolean(meta?.canUseCsvDay))
          if (meta?.canUseCsvDay) setDayMode('csv_day')
          setRows((prev) => [...imported.map((r) => ({ ...r, set_name: setName })), ...prev])
          setBulkOpen(false)
          setWorkflowModal('words')
        }}
      />

      <WordAddedDaySplitModal
        open={workflowModal === 'words'}
        onClose={() => setWorkflowModal(null)}
        initialMode={importCanUseCsvDay ? 'csv_day' : dayMode}
        initialTotalDays={totalDays}
        initialPerDay={perDay}
        canUseCsvDay={importCanUseCsvDay}
        isSentenceStyleCreate
        validCount={validCount}
        onExecute={(p) => {
          if (p?.totalDays != null) setTotalDays(p.totalDays)
          if (p?.perDay != null) setPerDay(p.perDay)
          if (p?.manualSegs) setPageManualSegs(p.manualSegs)
          if (p?.mode) setDayMode(p.mode)
          applyDayPreview(p)
        }}
      />

      <WorkflowSuccessModal
        open={workflowModal === 'day'}
        onClose={() => setWorkflowModal(null)}
        title={`✓ Day ${daySplitCount}개로 나뉘었어요`}
        nextStepDescription="저장하면 학생 앱에 반영됩니다."
        primaryLabel="저장하기"
        onPrimary={() => {
          setWorkflowModal(null)
          void saveAll()
        }}
        secondaryLabel="미리보기 계속"
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
