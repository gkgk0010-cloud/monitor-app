'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabaseClient'
import { useTeacher } from '@/utils/useTeacher'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import { QUIZ_CATEGORIES, QUIZ_CATEGORY_LABELS } from './utils/quizCategories'
import { deleteQuizSet } from './utils/quizDelete'
import CreateSetModal from './components/CreateSetModal'

function setDetailHref(setId) {
  return `/teacher/quiz/${encodeURIComponent(setId)}`
}

export default function QuizSetsPage() {
  const router = useRouter()
  const { teacher, loading: teacherLoading } = useTeacher()
  const teacherId = teacher?.id
  const [tab, setTab] = useState('reading')
  const [sets, setSets] = useState([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editSet, setEditSet] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadSets = useCallback(async () => {
    if (!teacherId) {
      setSets([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data: setRows, error } = await supabase
        .from('quiz_sets')
        .select('id, set_name, description, quiz_category, time_limit_seconds, random_order')
        .eq('teacher_id', teacherId)
        .order('set_name')
      if (error) {
        console.warn('[quiz]', error.message)
        setSets([])
        return
      }

      const ids = (setRows || []).map((s) => s.id)
      const counts = {}
      if (ids.length) {
        const { data: items, error: itemsErr } = await supabase
          .from('quiz_items')
          .select('set_id')
          .in('set_id', ids)
        if (!itemsErr) {
          for (const row of items || []) {
            counts[row.set_id] = (counts[row.set_id] || 0) + 1
          }
        }
      }

      setSets(
        (setRows || []).map((s) => ({
          ...s,
          item_count: counts[s.id] || 0,
        })),
      )
    } finally {
      setLoading(false)
    }
  }, [teacherId])

  useEffect(() => {
    void loadSets()
  }, [loadSets])

  const handleCreate = async (values) => {
    if (!teacherId) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('quiz_sets')
        .insert({ ...values, teacher_id: teacherId })
        .select('id')
        .single()
      if (error) {
        alert('생성 실패: ' + error.message)
        return
      }
      setCreateOpen(false)
      router.push(setDetailHref(data.id))
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (values) => {
    if (!teacherId || !editSet?.id) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('quiz_sets')
        .update({
          set_name: values.set_name,
          description: values.description,
          time_limit_seconds: values.time_limit_seconds,
          random_order: values.random_order,
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

  const handleDelete = async (setRow) => {
    if (!teacherId) return
    if (
      !confirm(
        `「${setRow.set_name}」 세트(${QUIZ_CATEGORY_LABELS[setRow.quiz_category]})의 문항 ${setRow.item_count}건을 모두 삭제할까요?`,
      )
    ) {
      return
    }
    const result = await deleteQuizSet(supabase, { teacherId, setId: setRow.id })
    if (!result.ok) {
      alert('삭제 실패: ' + (result.error || '알 수 없음'))
      return
    }
    void loadSets()
  }

  const filtered = sets.filter((s) => s.quiz_category === tab)
  const tabIcon = tab === 'reading' ? '📦' : '📝'

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
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>독해문제풀이 세트</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, opacity: 0.92 }}>패러프레이징 연습 · 문장삽입</p>
        </div>
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
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {QUIZ_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setTab(c)}
            style={{
              padding: '10px 16px',
              borderRadius: RADIUS.md,
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
              background: tab === c ? COLORS.primary : '#e2e8f0',
              color: tab === c ? COLORS.textOnGreen : COLORS.textPrimary,
            }}
          >
            {c === 'reading' ? '패러프레이징 연습' : '문장삽입'}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>
      ) : filtered.length === 0 ? (
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
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
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
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((s) => (
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
                onClick={() => router.push(setDetailHref(s.id))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') router.push(setDetailHref(s.id))
                }}
                style={{ flex: '1 1 240px', cursor: 'pointer', minWidth: 0 }}
              >
                <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.textPrimary }}>
                  {tabIcon} {s.set_name} ({s.item_count}문항)
                </div>
                {s.description ? (
                  <div style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 6 }}>설명: {s.description}</div>
                ) : null}
                <div style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 4 }}>
                  시간 제한: {s.time_limit_seconds}초
                  {s.random_order ? ' · 순서 랜덤' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setEditSet(s)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: RADIUS.md,
                    border: `1px solid ${COLORS.border}`,
                    background: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  편집
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(s)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: RADIUS.md,
                    border: 'none',
                    background: '#64748b',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateSetModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        defaultCategory={tab}
        saving={saving}
      />

      <CreateSetModal
        open={Boolean(editSet)}
        onClose={() => setEditSet(null)}
        onSubmit={handleEdit}
        initial={editSet}
        saving={saving}
      />
    </div>
  )
}
