'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabaseClient'
import { useTeacher } from '@/utils/useTeacher'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import { TRAINING_KIND_LABELS } from './utils/grammarLabRows'
import { deleteGrammarLabSet } from './utils/grammarLabDelete'

function setDetailHref(setName, kind) {
  return `/teacher/grammar-lab/${encodeURIComponent(setName)}?kind=${kind}`
}

export default function GrammarLabDashboardPage() {
  const router = useRouter()
  const { teacher, loading: teacherLoading } = useTeacher()
  const teacherId = teacher?.id
  const [tab, setTab] = useState('word_order')
  const [sets, setSets] = useState([])
  const [loading, setLoading] = useState(true)

  const loadSets = useCallback(async () => {
    if (!teacherId) {
      setSets([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data: items, error } = await supabase
        .from('sentence_training_items')
        .select('id, set_name, training_kind')
        .eq('teacher_id', teacherId)
      if (error) {
        console.warn('[grammar-lab]', error.message)
        setSets([])
        return
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
      let boxedSet = new Set()
      if (boxIds.length) {
        const { data: boxes } = await supabase.from('box_drill_answers').select('item_id').in('item_id', boxIds)
        boxedSet = new Set((boxes || []).map((b) => b.item_id))
      }

      const list = Object.values(byKey).map((s) => {
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
      list.sort((a, b) => a.set_name.localeCompare(b.set_name, 'ko'))
      setSets(list)
    } finally {
      setLoading(false)
    }
  }, [teacherId])

  useEffect(() => {
    void loadSets()
  }, [loadSets])

  const handleDelete = async (setName, kind) => {
    if (!teacherId) return
    if (!confirm(`「${setName}」 세트(${TRAINING_KIND_LABELS[kind]})의 구문 ${sets.find((s) => s.set_name === setName && s.training_kind === kind)?.total ?? ''}건을 모두 삭제할까요?`)) {
      return
    }
    const result = await deleteGrammarLabSet(supabase, {
      teacherId,
      setName,
      trainingKind: kind,
    })
    if (!result.ok) {
      alert('삭제 실패: ' + (result.error || '알 수 없음'))
      return
    }
    if (result.deletedItems > 0) {
      console.info(
        `[grammar-lab] 세트 삭제 완료: ${setName} (${TRAINING_KIND_LABELS[kind]}) 구문 ${result.deletedItems}건 — box_drill_answers는 CASCADE`,
      )
    }
    void loadSets()
  }

  const filtered = sets.filter((s) => s.training_kind === tab)

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
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>문법 해부실</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, opacity: 0.92 }}>어순 배열 · 박스 만들기 콘텐츠</p>
        </div>
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
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['word_order', 'box_drill']).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            style={{
              padding: '10px 16px',
              borderRadius: RADIUS.md,
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
              background: tab === k ? COLORS.primary : '#e2e8f0',
              color: tab === k ? COLORS.textOnGreen : COLORS.textPrimary,
            }}
          >
            {k === 'word_order' ? '🔀 어순 배열 세트' : '📦 박스 만들기 세트'}
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
          <Link href={`/teacher/grammar-lab/create?kind=${tab}`} style={{ color: COLORS.primary, fontWeight: 700 }}>
            + 새 세트 만들기
          </Link>
        </div>
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
                    void handleDelete(s.set_name, s.training_kind)
                  }}
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
    </div>
  )
}
