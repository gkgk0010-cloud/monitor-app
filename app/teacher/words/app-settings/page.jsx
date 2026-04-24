'use client'

import Link from 'next/link'
import { useTeacher } from '@/utils/useTeacher'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import MenuSettingsSection from '../components/MenuSettingsSection'

/**
 * 학생 앱(토큰·메뉴) 표시 설정 — teachers.visible_menus
 */
export default function WordAppMenuSettingsPage() {
  const { teacher, loading: teacherLoading, refresh: refreshTeacher } = useTeacher()
  const teacherId = teacher?.id

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
          로그인한 이메일에 해당하는 선생님(teachers) 정보가 없습니다.
        </p>
        <Link href="/teacher/words" style={{ color: COLORS.primary, fontSize: 14 }}>
          ← 단어 관리
        </Link>
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '100%',
        minHeight: '100%',
        fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      }}
    >
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
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>앱 기능 설정</h1>
        </div>
      </header>

      <MenuSettingsSection
        teacherId={teacherId}
        visibleMenus={teacher?.visible_menus}
        onSaved={() => void refreshTeacher()}
      />

      <div style={{ marginTop: 8 }}>
        <Link
          href="/teacher/words"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '12px 20px',
            borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
            color: COLORS.accentText,
            fontWeight: 700,
            fontSize: 15,
            textDecoration: 'none',
          }}
        >
          ← 단어 관리로 돌아가기
        </Link>
      </div>
    </div>
  )
}
