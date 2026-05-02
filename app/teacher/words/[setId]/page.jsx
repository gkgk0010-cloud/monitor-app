'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/utils/supabaseClient'
import { useTeacher } from '@/utils/useTeacher'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import WordsSetDetailView from '../components/WordsSetDetailView'

function WordSetDetailPageInner() {
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const setId = String(params?.setId || '')
  const editRoutineId = searchParams.get('editRoutine') || ''
  const newRoutine = searchParams.get('newRoutine') === '1'

  const { teacher, loading: teacherLoading } = useTeacher()
  const teacherId = teacher?.id
  const [wordSet, setWordSet] = useState(null)
  const [loadErr, setLoadErr] = useState(null)

  const consumeRoutineDeeplink = useCallback(() => {
    router.replace(pathname || `/teacher/words/${setId}`)
  }, [router, pathname, setId])

  const refetchWordSet = useCallback(async () => {
    if (!teacherId || !setId) return
    const { data, error } = await supabase
      .from('word_sets')
      .select('id, name, set_type, available_modes, invite_code')
      .eq('id', setId)
      .eq('teacher_id', teacherId)
      .maybeSingle()
    if (error) {
      console.warn('[word_sets]', error.message)
      return
    }
    if (data) setWordSet(data)
  }, [teacherId, setId])

  useEffect(() => {
    let cancelled = false
    if (teacherLoading || !teacherId || !setId) return undefined
    ;(async () => {
      const { data, error } = await supabase
        .from('word_sets')
        .select('id, name, set_type, available_modes, invite_code')
        .eq('id', setId)
        .eq('teacher_id', teacherId)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) {
        setLoadErr(error?.message || 'not_found')
        setWordSet(null)
        return
      }
      setLoadErr(null)
      setWordSet(data)
    })()
    return () => {
      cancelled = true
    }
  }, [teacherLoading, teacherId, setId])

  if (teacherLoading) {
    return (
      <div style={{ minHeight: '40vh', padding: '8px 0 24px' }}>
        <p style={{ color: COLORS.textSecondary }}>선생님 정보를 확인하는 중…</p>
      </div>
    )
  }

  if (!teacherId) {
    return (
      <div style={{ minHeight: '40vh', padding: '8px 0 24px' }}>
        <p style={{ color: COLORS.textSecondary }}>
          로그인한 이메일에 해당하는 선생님(teachers 테이블) 정보가 없습니다.
        </p>
        <Link href="/teacher/monitor" style={{ color: COLORS.primary, fontSize: 14 }}>
          ← 모니터
        </Link>
      </div>
    )
  }

  if (loadErr || !wordSet) {
    return (
      <div style={{ padding: '24px 0', maxWidth: 560 }}>
        <div
          style={{
            padding: 24,
            borderRadius: RADIUS.lg,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
            boxShadow: SHADOW.card,
          }}
        >
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>세트를 찾을 수 없습니다</h1>
          <p style={{ color: COLORS.textSecondary, margin: '0 0 16px', lineHeight: 1.5 }}>
            링크가 잘못됐거나 삭제된 세트일 수 있어요.
          </p>
          <Link
            href="/teacher/words"
            style={{ color: COLORS.primary, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}
          >
            ← 세트 목록으로
          </Link>
        </div>
      </div>
    )
  }

  return (
    <WordsSetDetailView
      wordSet={wordSet}
      onWordSetUpdated={() => void refetchWordSet()}
      onSetDeleted={() => router.push('/teacher/words')}
      deepLinkEditRoutineId={editRoutineId}
      deepLinkNewRoutine={newRoutine}
      onRoutineDeepLinkConsumed={consumeRoutineDeeplink}
    />
  )
}

export default function WordSetDetailPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '40vh', padding: '8px 0 24px' }}>
          <p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>
        </div>
      }
    >
      <WordSetDetailPageInner />
    </Suspense>
  )
}
