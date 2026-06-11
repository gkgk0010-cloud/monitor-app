'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/utils/supabaseClient'
import { useTeacher } from '@/utils/useTeacher'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import { TRAINING_KIND_LABELS } from './utils/grammarLabRows'
import { deleteGrammarLabSet } from './utils/grammarLabDelete'
import { fetchItemIdsWithBoxAnswers } from './utils/boxDrillQuery'
import { deleteReadingInterpretSet } from './utils/readingInterpretDelete'
import ReadingInterpretCreateModal from './components/ReadingInterpretCreateModal'

const TABS = [
  { id: 'word_order', label: '🔀 어순 배열' },
  { id: 'box_drill', label: '📦 박스 만들기' },
  { id: 'reading_interpret', label: '📝 독해해석' },
]

function setDetailHref(setName, kind) {
  return `/teacher/grammar-lab/${encodeURIComponent(setName)}?kind=${kind}`
}

function interpretDetailHref(setId) {
  return `/teacher/grammar-lab/interpret/${encodeURIComponent(setId)}`
}

function GrammarLabDashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { teacher, loading: teacherLoading } = useTeacher()
  const teacherId = teacher?.id
  const initialTab = searchParams.get('tab')
  const [tab, setTab] = useState(
    initialTab === 'reading_interpret' || initialTab === 'box_drill' || initialTab === 'word_order'
      ? initialTab
      : 'word_order',
  )
  const [sets, setSets] = useState([])
  const [interpretSets, setInterpretSets] = useState([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editSet, setEditSet] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (initialTab === 'reading_interpret' || initialTab === 'box_drill' || initialTab === 'word_order') {
      setTab(initialTab)
    }
  }, [initialTab])

  const loadGrammarSets = useCallback(async () => {
    if (!teacherId) return []
    const { data: items, error } = await supabase
      .from('sentence_training_items')
      .select('id, set_name, training_kind')
      .eq('teacher_id', teacherId)
    if (error) {
      console.warn('[grammar-lab]', error.message)
      return []
    }
    const byKey = {}
    for (const row of items || []) {
      const kind = row.training_kind
      const name = String(row.set_name || '').trim()
      if (!name || !kind) continue
      const key = `${kind}\0${name}`
      if (!byKey[key]) byKey[key] = { set_name: name, training_kind: kind, total: 0, itemIds: [] }
      byKey[key].total++
      byKey[key].itemIds.push(row.id)
    }

    const boxIds = (items || []).filter((r) => r.training_kind === 'box_drill').map((r) => r.id)
    const boxedSet = boxIds.length ? await fetchItemIdsWithBoxAnswers(supabase, boxIds) : new Set()

    return Object.values(byKey).map((s) => {
      let incomplete = 0
      if (s.training_kind === 'box_drill') {
        for (const id of s.itemIds) {
          if (!boxedSet.has(id)) incomplete++
        }
      }
      return {
        set_name: s.set_name,
        training_kind: s.training_kind,
        total: s.total,
        incomplete,
      }
    })
  }, [teacherId])

  const loadInterpretSets = useCallback(async () => {
    if (!teacherId) return []
    const { data: setRows, error } = await supabase
      .from('reading_interpret_sets')
      .select('id, set_name, description, hint_tone, awkward_guide')
      .eq('teacher_id', teacherId)
      .order('set_name')
    if (error) {
      console.warn('[reading-interpret sets]', error.message)
      return []
    }
    const ids = (setRows || []).map((s) => s.id)
    const counts = {}
    if (ids.length) {
      const { data: items } = await supabase.from('reading_interpret_items').select('set_id').in('set_id', ids)
      for (const row of items || []) {
        counts[row.set_id] = (counts[row.set_id] || 0) + 1
      }
    }
    return (setRows || []).map((s) => ({ ...s, item_count: counts[s.id] || 0 }))
  }, [teacherId])

  const loadSets = useCallback(async () => {
    if (!teacherId) {
      setSets([])
      setInterpretSets([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [grammarList, interpretList] = await Promise.all([loadGrammarSets(), loadInterpretSets()])
      grammarList.sort((a, b) => a.set_name.localeCompare(b.set_name, 'ko'))
      setSets(grammarList)
      setInterpretSets(interpretList)
    } finally {
      setLoading(false)
    }
  }, [teacherId, loadGrammarSets, loadInterpretSets])

  useEffect(() => {
    void loadSets()
  }, [loadSets])

  const handleDeleteGrammar = async (setName, kind) => {
    if (!teacherId) return
    if (
      !confirm(
        `「${setName}」 세트(${TRAINING_KIND_LABELS[kind]})의 구문 ${sets.find((s) => s.set_name === setName && s.training_kind === kind)?.total ?? ''}건을 모두 삭제할까요?`,
      )
    ) {
      return
    }
    const result = await deleteGrammarLabSet(supabase, { teacherId, setName, trainingKind: kind })
    if (!result.ok) {
      alert('삭제 실패: ' + (result.error || '알 수 없음'))
      return
    }
    void loadSets()
  }

  const handleDeleteInterpret = async (setRow) => {
    if (!teacherId) return
    if (!confirm(`「${setRow.set_name}」 독해해석 세트(${setRow.item_count}문항)를 모두 삭제할까요?`)) return
    const result = await deleteReadingInterpretSet(supabase, { teacherId, setId: setRow.id })
    if (!result.ok) {
      alert('삭제 실패: ' + (result.error || '알 수 없음'))
      return
    }
    void loadSets()
  }

  const handleCreateInterpret = async (values) => {
    if (!teacherId) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('reading_interpret_sets')
        .insert({ ...values, teacher_id: teacherId })
        .select('id')
        .single()
      if (error) {
        alert('생성 실패: ' + error.message)
        return
      }
      setCreateOpen(false)
      router.push(interpretDetailHref(data.id))
    } finally {
      setSaving(false)
    }
  }

  const handleEditInterpret = async (values) => {
    if (!teacherId || !editSet?.id) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('reading_interpret_sets')
        .update({
          set_name: values.set_name,
          description: values.description,
          hint_tone: values.hint_tone,
          awkward_guide: values.awkward_guide,
        })
        .eq('id', editSet.id)
        .eq('teacher_id', teacherId)
      if (error) {
        alert('저장 실패: ' + error.message)
        return
      }
      setEditSet(null)
      void loadSets()
    } finally {
      setSaving(false)
    }
  }

  const filtered = sets.filter((s) => s.training_kind === tab)
  const isInterpretTab = tab === 'reading_interpret'

  if (teacherLoading) {
    return <p style={{ color: COLORS.textSecondary }}>선생님 정보 확인 중…</p>
  }
  if (!teacherId) {
    return (
      <p style={{ color: COLORS.textSecondary }}>
        teachers 행이 없습니다. <Link href="/teacher/monitor">모니터</Link>
      </p>
    )
  }

  return (
    <div className="teacher-grammar-lab-page" style={{ width: '100%', maxWidth: 'none', minHeight: '100%' }}>
      <header
        className="teacher-page-header-bleed"
        style={{
          marginBottom: 20,
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
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>독해 훈련소</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, opacity: 0.92 }}>어순 배열 · 박스 만들기 · 독해해석</p>
        </div>
        {isInterpretTab ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            style={{
              padding: '10px 18px',
              borderRadius: RADIUS.md,
              background: '#fff',
              color: COLORS.primary,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            + 새 세트 만들기
          </button>
        ) : (
          <Link
            href={`/teacher/grammar-lab/create?kind=${tab}`}
            style={{
              padding: '10px 18px',
              borderRadius: RADIUS.md,
              background: '#fff',
              color: COLORS.primary,
              fontWeight: 800,
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            + 새 세트 만들기
          </Link>
        )}
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 16px',
              borderRadius: RADIUS.md,
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
              background: tab === t.id ? COLORS.primary : '#e2e8f0',
              color: tab === t.id ? COLORS.textOnGreen : COLORS.textPrimary,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>
      ) : isInterpretTab ? (
        interpretSets.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} isInterpret />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {interpretSets.map((s) => (
              <div
                key={s.id}
                style={{
                  padding: '16px 18px',
                  borderRadius: RADIUS.lg,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface,
                  boxShadow: SHADOW.card,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(interpretDetailHref(s.id))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') router.push(interpretDetailHref(s.id))
                  }}
                  style={{ flex: '1 1 240px', cursor: 'pointer', minWidth: 0 }}
                >
                  <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.textPrimary }}>
                    📝 {s.set_name} ({s.item_count}문항)
                  </div>
                  {s.description ? (
                    <div style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 6 }}>설명: {s.description}</div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setEditSet(s)} style={editBtnStyle}>
                    편집
                  </button>
                  <button type="button" onClick={() => void handleDeleteInterpret(s)} style={deleteBtnStyle}>
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState href={`/teacher/grammar-lab/create?kind=${tab}`} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((s) => (
            <div
              key={`${s.training_kind}-${s.set_name}`}
              role="button"
              tabIndex={0}
              onClick={() => router.push(setDetailHref(s.set_name, s.training_kind))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') router.push(setDetailHref(s.set_name, s.training_kind))
              }}
              style={{
                padding: '16px 18px',
                borderRadius: RADIUS.lg,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surface,
                boxShadow: SHADOW.card,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.textPrimary }}>{s.set_name}</div>
                <div style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 4 }}>
                  구문 {s.total}건 · {TRAINING_KIND_LABELS[s.training_kind]}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {s.training_kind === 'box_drill' && s.incomplete > 0 ? (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: '#fee2e2',
                      color: '#b91c1c',
                    }}
                  >
                    박스 미완료 {s.incomplete}건
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleDeleteGrammar(s.set_name, s.training_kind)
                  }}
                  style={deleteBtnStyle}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ReadingInterpretCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateInterpret}
        saving={saving}
      />
      <ReadingInterpretCreateModal
        open={Boolean(editSet)}
        onClose={() => setEditSet(null)}
        onSubmit={handleEditInterpret}
        initial={editSet}
        saving={saving}
      />
    </div>
  )
}

function EmptyState({ href, onCreate, isInterpret }) {
  return (
    <div
      style={{
        padding: 32,
        textAlign: 'center',
        borderRadius: RADIUS.lg,
        border: `1px dashed ${COLORS.border}`,
        color: COLORS.textSecondary,
      }}
    >
      <p style={{ margin: 0 }}>등록된 세트가 없습니다.</p>
      {isInterpret ? (
        <button
          type="button"
          onClick={onCreate}
          style={{
            marginTop: 12,
            background: 'none',
            border: 'none',
            color: COLORS.primary,
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          + 새 세트 만들기
        </button>
      ) : (
        <Link href={href} style={{ color: COLORS.primary, fontWeight: 700 }}>
          + 새 세트 만들기
        </Link>
      )}
    </div>
  )
}

const editBtnStyle = {
  padding: '6px 12px',
  borderRadius: RADIUS.md,
  border: `1px solid ${COLORS.border}`,
  background: '#fff',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
}

const deleteBtnStyle = {
  padding: '6px 12px',
  borderRadius: RADIUS.md,
  border: 'none',
  background: '#64748b',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
}

export default function GrammarLabDashboardPage() {
  return (
    <Suspense fallback={<p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>}>
      <GrammarLabDashboardContent />
    </Suspense>
  )
}
