'use client'

import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabaseClient'
import { DEFAULT_ACADEMY_ID } from '@/utils/defaults'
import { useTeacher } from '@/utils/useTeacher'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import WordTable from '../components/WordTable'
import BulkImport from '../components/BulkImport'
import AutoFillPanel from '../components/AutoFillPanel'
import { normalizeWordDifficulty } from '../utils/parsers'
import { assignDaysEqual, assignDaysChunk } from '../utils/dayAssign'
import WorkflowSuccessModal from '../components/WorkflowSuccessModal'

const SET_TYPE_LABELS = {
  word: '단어 세트',
  sentence_writing: '문장 세트 — 라이팅',
  sentence_speaking: '문장 세트 — 스피킹',
}

function emptyRow(setName) {
  return {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2, 11)}`,
    word: '',
    meaning: '',
    example_sentence: '',
    set_name: setName,
    day: 1,
    difficulty: 1,
    image_url: null,
    image_source: 'none',
    youtube_url: null,
  }
}

function CreateWordSetPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryAppliedRef = useRef(false)
  const skipWordsGuideEffectRef = useRef(false)
  const prevValidWordCountRef = useRef(0)
  /** 'words' | 'day' | 'saved' | null */
  const [workflowModal, setWorkflowModal] = useState(null)
  /** applyDayPreview 성공 시 unique day 수 (모달 문구) */
  const [daySplitCount, setDaySplitCount] = useState(0)

  const [setName, setSetName] = useState('')
  const [rows, setRows] = useState(() => [emptyRow('')])
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [dayMode, setDayMode] = useState('equal')
  const [totalDays, setTotalDays] = useState(7)
  const [perDay, setPerDay] = useState(20)
  const [hasDayPreview, setHasDayPreview] = useState(false)
  /** Day 번호 → 해당 Day에 속한 단어 행에 일괄 적용할 유튜브 URL */
  const [dayYoutubeByDay, setDayYoutubeByDay] = useState(() => ({}))
  const [saving, setSaving] = useState(false)
  const [hint, setHint] = useState(null)
  /** none | day | chunk10 | day_chunk */
  const [tableGroupMode, setTableGroupMode] = useState('chunk10')

  const { teacher, loading: teacherLoading } = useTeacher()
  const teacherId = teacher?.id
  const academyId = teacher?.academy_id ?? DEFAULT_ACADEMY_ID

  const effectiveGroupMode = useMemo(() => {
    if (!hasDayPreview && (tableGroupMode === 'day' || tableGroupMode === 'day_chunk')) return 'none'
    return tableGroupMode
  }, [hasDayPreview, tableGroupMode])

  /** URL `?type=` → WordTable·가져오기·저장 검증 (기본 단어 세트) */
  const createSetType = useMemo(() => {
    const t = searchParams.get('type')
    if (t === 'sentence_writing' || t === 'sentence_speaking') return t
    if (t === 'sentence' || t === 'image') return 'sentence_writing'
    return 'word'
  }, [searchParams])

  const isSentenceStyleCreate =
    createSetType === 'sentence_writing' || createSetType === 'sentence_speaking'
  const wordTableColumnPreset = isSentenceStyleCreate ? 'sentence' : 'word'

  const isRowValidForCreate = useCallback(
    (r) => {
      const w = String(r.word || '').trim()
      const m = String(r.meaning || '').trim()
      const ex = String(r.example_sentence || '').trim()
      if (isSentenceStyleCreate) return Boolean(ex && m)
      return Boolean(w && m)
    },
    [isSentenceStyleCreate],
  )

  /** Day 미리보기 후 배정된 Day 목록 (유튜브 URL 입력란용) */
  const uniqueDaysInPreview = useMemo(() => {
    if (!hasDayPreview) return []
    const s = new Set()
    for (const r of rows) {
      const w = String(r.word || '').trim()
      const m = String(r.meaning || '').trim()
      const ex = String(r.example_sentence || '').trim()
      const ok = isSentenceStyleCreate ? ex && m : w && m
      if (!ok) continue
      s.add(Math.max(1, parseInt(String(r.day ?? 1), 10) || 1))
    }
    return [...s].sort((a, b) => a - b)
  }, [rows, hasDayPreview, isSentenceStyleCreate])

  useEffect(() => {
    if (!hasDayPreview) {
      setTableGroupMode((m) => (m === 'day' || m === 'day_chunk' ? 'none' : m))
    }
  }, [hasDayPreview])

  /** 수동 입력으로 첫 유효 행이 생기면 Step1 모달 (가져오기와 별개) */
  useEffect(() => {
    const validCount = rows.filter((r) => isRowValidForCreate(r)).length
    if (skipWordsGuideEffectRef.current) {
      skipWordsGuideEffectRef.current = false
      prevValidWordCountRef.current = validCount
      return
    }
    if (hasDayPreview) {
      prevValidWordCountRef.current = validCount
      return
    }
    if (validCount >= 1 && prevValidWordCountRef.current < 1) {
      setWorkflowModal('words')
    }
    prevValidWordCountRef.current = validCount
  }, [rows, hasDayPreview, isRowValidForCreate])

  const syncSetName = (name) => {
    const v = String(name)
    setSetName(v)
    setRows((prev) => prev.map((r) => ({ ...r, set_name: v })))
  }

  useEffect(() => {
    if (queryAppliedRef.current) return
    const rawName = searchParams.get('name')
    if (!rawName?.trim()) return
    queryAppliedRef.current = true
    let v = rawName.trim()
    try {
      v = decodeURIComponent(v)
    } catch {
      /* keep trimmed raw */
    }
    setSetName(v)
    setRows((prev) => prev.map((r) => ({ ...r, set_name: v })))
  }, [searchParams])

  /** 세트 이름은 syncSetName에서만 전 행에 반영. 참조 안정화로 WordTable 불필요 리렌더 감소 */
  const onRowsChange = useCallback((next) => {
    setRows((prev) => (typeof next === 'function' ? next(prev) : next))
  }, [])

  const addEmptyRow = () => {
    setRows((prev) => [emptyRow(setName), ...prev])
  }

  const applyDayPreview = () => {
    const validCount = rows.filter((r) => isRowValidForCreate(r)).length
    if (validCount === 0) {
      alert(isSentenceStyleCreate ? '예문·뜻이 있는 행이 없습니다.' : '영단어·뜻이 있는 행이 없습니다.')
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

    const uniqueDays = new Set(seq).size
    setDaySplitCount(uniqueDays)

    let vi = 0
    setRows((prev) =>
      prev.map((r) => {
        const w = String(r.word || '').trim()
        const m = String(r.meaning || '').trim()
        const ex = String(r.example_sentence || '').trim()
        const ok = isSentenceStyleCreate ? ex && m : w && m
        if (!ok) return { ...r, day: r.day ?? 1 }
        const d = seq[vi++]
        return { ...r, day: d }
      }),
    )
    setHasDayPreview(true)
    setHint('Day가 배정되었습니다. 확인 후 「DB에 저장」을 누르세요.')
    setWorkflowModal('day')
  }

  const saveAll = async () => {
    if (!teacherId) {
      alert('선생님 정보를 불러올 수 없습니다. 다시 로그인하거나 페이지를 새로고침해 주세요.')
      return
    }
    const sn = String(setName).trim()
    if (!sn) {
      alert('세트 이름을 입력하세요.')
      return
    }
    if (!hasDayPreview) {
      alert('먼저 「Day 미리보기」로 day를 배정하세요.')
      return
    }
    const valid = rows.filter((r) => isRowValidForCreate(r))
    if (valid.length === 0) {
      alert(isSentenceStyleCreate ? '저장할 행이 없습니다. 예문·뜻을 확인하세요.' : '저장할 단어가 없습니다.')
      return
    }
    setSaving(true)
    setHint(null)
    try {
      const payload = valid.map((r) => {
        const ex = String(r.example_sentence || '').trim()
        let word = String(r.word || '').trim()
        if (isSentenceStyleCreate && !word) {
          word = ex.length > 300 ? ex.slice(0, 300) : ex
        }
        const dnum = Math.max(1, parseInt(String(r.day ?? 1), 10) || 1)
        const fromDayMap = String(dayYoutubeByDay[dnum] ?? '').trim()
        const fromRow = r.youtube_url != null && String(r.youtube_url).trim() ? String(r.youtube_url).trim() : ''
        const yt = (fromDayMap || fromRow) || null
        return {
          word,
          meaning: String(r.meaning).trim(),
          example_sentence: ex || null,
          set_name: sn,
          day: Math.max(1, parseInt(String(r.day ?? 1), 10) || 1),
          difficulty: normalizeWordDifficulty(r.difficulty),
          image_url: r.image_url ? String(r.image_url).trim() : null,
          image_source: r.image_url ? String(r.image_source || 'none') : 'none',
          youtube_url: yt,
          academy_id: academyId,
          teacher_id: teacherId,
        }
      })
      const { error } = await supabase.from('words').upsert(payload, {
        onConflict: 'set_name,word',
        defaultToNull: false,
      })
      if (error) throw error
      const savedMarked = valid.map((r) => ({ ...r, _localSaved: true }))
      const tail = [emptyRow(sn), emptyRow(sn), emptyRow(sn)]
      setRows([...savedMarked, ...tail])
      setSelectedIds(new Set())
      setWorkflowModal('saved')
      setHint(
        `${valid.length}개를 저장했습니다. 방금 저장한 행은 연한 배경으로 표시됩니다. 아래 빈 행에 이어서 입력한 뒤 다시 「DB에 저장」할 수 있어요.`,
      )
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const autoFillRows = useMemo(
    () =>
      selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(String(r.id))) : rows,
    [rows, selectedIds],
  )

  const handleAutoFilled = (updated) => {
    const map = new Map(updated.map((r) => [String(r.id), r]))
    setRows((prev) => prev.map((r) => ({ ...(map.get(String(r.id)) || r), set_name: setName })))
  }

  const handleRowDelete = (row) => {
    if (!confirm('이 행을 목록에서 삭제할까요?')) return
    const id = String(row.id)
    setRows((prev) => prev.filter((r) => String(r.id) !== id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  if (teacherLoading) {
    return (
      <div style={{ padding: '8px 0 24px' }}>
        <p style={{ color: COLORS.textSecondary }}>선생님 정보를 확인하는 중…</p>
      </div>
    )
  }

  if (!teacherId) {
    return (
      <div style={{ padding: '8px 0 24px' }}>
        <p style={{ color: COLORS.textSecondary }}>
          로그인한 이메일에 해당하는 선생님(teachers 테이블) 정보가 없습니다. Supabase에서 이메일을 등록했는지 확인해 주세요.
        </p>
        <Link href="/teacher/words" style={{ color: COLORS.primary, fontSize: 14 }}>
          ← 단어 관리
        </Link>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: '100%', minHeight: '100%' }}>
      <header
        className="teacher-page-header-bleed"
        style={{
          marginBottom: 16,
          padding: '14px 18px',
          borderRadius: RADIUS.lg,
          background: COLORS.headerGradient,
          color: COLORS.textOnGreen,
          boxShadow: SHADOW.card,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/teacher/words" style={{ color: COLORS.textOnGreen, fontSize: 14, opacity: 0.95 }}>
            ← 단어 관리
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>새 세트 만들기</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={addEmptyRow}
            style={{
              padding: '10px 16px',
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.textOnGreen}`,
              background: 'transparent',
              color: COLORS.textOnGreen,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + 행 추가
          </button>
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            style={{
              padding: '10px 16px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: COLORS.textOnGreen,
              color: COLORS.primaryDark,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            가져오기
          </button>
        </div>
      </header>

      <div style={{ width: '100%', maxWidth: '100%' }}>
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            borderRadius: RADIUS.md,
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            display: 'grid',
            gap: 12,
          }}
        >
          <label style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, color: COLORS.accentText }}>세트 이름</span>
            <input
              value={setName}
              onChange={(e) => syncSetName(e.target.value)}
              placeholder="세트 이름 (필수)"
              style={{
                flex: '1 1 240px',
                padding: '10px 12px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                fontSize: 15,
              }}
            />
          </label>
          {searchParams.get('type') ? (
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: COLORS.accentText }}>
              세트 유형(참고): {SET_TYPE_LABELS[createSetType] || createSetType}
            </p>
          ) : null}
          <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>
            DB에 있는 전체 단어 목록은 보이지 않습니다. 카드만 입력한 뒤, Day를 나누고 저장하면 됩니다. 예문
            돋보기·자동채우기는 Anthropic(Claude) API를 쓰며, 계정에 크레딧이 있어야 합니다. 이미지는 검색·URL·
            드래그·붙여넣기를 지원합니다.
          </p>
        </div>

        <div
          id="day-split-section"
          style={{
            marginBottom: 16,
            padding: 16,
            borderRadius: RADIUS.md,
            background: COLORS.primarySoft,
            border: `1px solid ${COLORS.border}`,
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 700, color: COLORS.accentText }}>Day 나누기</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="dayMode"
                checked={dayMode === 'equal'}
                onChange={() => {
                  setDayMode('equal')
                  setHasDayPreview(false)
                }}
              />
              <span>총 N일로 균등 분할</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: COLORS.textSecondary, fontSize: 14 }}>N =</span>
              <input
                type="number"
                min={1}
                value={totalDays}
                onChange={(e) => setTotalDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ width: 72, padding: 8, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="dayMode"
                checked={dayMode === 'chunk'}
                onChange={() => {
                  setDayMode('chunk')
                  setHasDayPreview(false)
                }}
              />
              <span>순서대로 일당 M개</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: COLORS.textSecondary, fontSize: 14 }}>M =</span>
              <input
                type="number"
                min={1}
                value={perDay}
                onChange={(e) => setPerDay(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ width: 72, padding: 8, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              onClick={applyDayPreview}
              style={{
                padding: '10px 18px',
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
              disabled={saving || !hasDayPreview}
              onClick={() => void saveAll()}
              style={{
                padding: '10px 18px',
                borderRadius: RADIUS.md,
                border: 'none',
                background: hasDayPreview ? COLORS.primaryDark : COLORS.border,
                color: COLORS.textOnGreen,
                fontWeight: 700,
                cursor: saving || !hasDayPreview ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? '저장 중…' : 'DB에 저장'}
            </button>
          </div>
          {hasDayPreview && uniqueDaysInPreview.length > 0 ? (
            <div style={{ display: 'grid', gap: 10, marginTop: 4 }}>
              <div style={{ fontWeight: 700, color: COLORS.accentText, fontSize: 14 }}>Day별 강의 영상 URL (선택)</div>
              <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.45 }}>
                Day마다 다른 영상을 넣을 수 있어요. 저장 시 해당 Day의 모든 단어에 같은 <code>youtube_url</code>이
                들어갑니다. 단어 관리 화면의 Day별 URL 저장과 동일한 방식입니다.
              </p>
              {uniqueDaysInPreview.map((d) => (
                <label
                  key={d}
                  style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}
                >
                  <span style={{ minWidth: 56, fontWeight: 700, color: COLORS.textPrimary }}>Day {d}</span>
                  <input
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    value={dayYoutubeByDay[d] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setDayYoutubeByDay((prev) => ({ ...prev, [d]: v }))
                    }}
                    placeholder="https://www.youtube.com/watch?v=…"
                    style={{
                      flex: '1 1 240px',
                      padding: '10px 12px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${COLORS.border}`,
                      fontSize: 14,
                    }}
                  />
                </label>
              ))}
            </div>
          ) : null}
          {hint ? (
            <p style={{ margin: 0, fontSize: 14, color: COLORS.accentText, fontWeight: 600 }}>{hint}</p>
          ) : null}
        </div>

        <div
          style={{
            marginBottom: 12,
            padding: '12px 14px',
            borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontWeight: 700, color: COLORS.accentText, fontSize: 14 }}>단어 목록 접기</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={tableGroupMode}
              onChange={(e) => setTableGroupMode(e.target.value)}
              style={{
                padding: '8px 10px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                fontSize: 14,
                minWidth: 200,
              }}
            >
              <option value="none">접지 않음 (한 목록)</option>
              <option value="chunk10">10개씩</option>
              <option value="day" disabled={!hasDayPreview}>
                Day별 {!hasDayPreview ? '(Day 미리보기 후)' : ''}
              </option>
              <option value="day_chunk" disabled={!hasDayPreview}>
                Day 안에서 10개씩 {!hasDayPreview ? '(Day 미리보기 후)' : ''}
              </option>
            </select>
          </label>
        </div>

        <WordTable
          rows={rows}
          onRowsChange={onRowsChange}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          showSetNameColumn={false}
          showDayColumn={hasDayPreview}
          dayReadOnly={hasDayPreview}
          showImageColumn
          showDeleteColumn
          onRowDelete={handleRowDelete}
          rowGroupMode={effectiveGroupMode}
          columnPreset={wordTableColumnPreset}
          getRowBackground={(row) => (row._localSaved ? 'rgba(16, 185, 129, 0.11)' : undefined)}
        />

        <AutoFillPanel rows={autoFillRows} onFilled={handleAutoFilled} />

        <BulkImport
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          onSaved={() => {}}
          existingSetNames={[]}
          localOnly
          initialSetName={setName}
          teacherId={teacherId}
          academyId={academyId}
          importSetType={createSetType}
          onLocalImported={(imported) => {
            skipWordsGuideEffectRef.current = true
            setHasDayPreview(false)
            setRows((prev) => [...imported.map((r) => ({ ...r, set_name: setName })), ...prev])
            setBulkOpen(false)
            setWorkflowModal('words')
          }}
        />
      </div>

      <WorkflowSuccessModal
        open={workflowModal === 'words'}
        onClose={() => setWorkflowModal(null)}
        title="✓ 단어가 추가됐어요"
        nextStepDescription="Day별로 단어를 나눠야 학생 앱에서 학습이 가능해요."
        primaryLabel="Day 자동 나누기"
        onPrimary={() => {
          const el = document.getElementById('day-split-section')
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          applyDayPreview()
        }}
        secondaryLabel="나중에 하기"
      />

      <WorkflowSuccessModal
        open={workflowModal === 'day'}
        onClose={() => setWorkflowModal(null)}
        title={`✓ Day ${daySplitCount}개로 나뉘었어요`}
        nextStepDescription="DB에 저장해야 학생 앱에 반영돼요."
        primaryLabel="DB 저장하기"
        onPrimary={() => {
          setWorkflowModal(null)
          void saveAll()
        }}
        secondaryLabel="미리보기 계속 보기"
      />

      <WorkflowSuccessModal
        open={workflowModal === 'saved'}
        onClose={() => setWorkflowModal(null)}
        title="✓ 저장 완료!"
        nextStepDescription="단어 관리로 돌아가서 학생들이 학습할 루틴을 설정해주세요."
        primaryLabel="루틴 관리로 이동"
        onPrimary={() => {
          setWorkflowModal(null)
          router.push('/teacher/words#routine-settings')
        }}
        secondaryLabel="단어 관리로 돌아가기"
        onSecondary={() => {
          setWorkflowModal(null)
          router.push('/teacher/words')
        }}
      />
    </div>
  )
}

export default function CreateWordSetPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '8px 0 24px' }}>
          <p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>
        </div>
      }
    >
      <CreateWordSetPageContent />
    </Suspense>
  )
}
