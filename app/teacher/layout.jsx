'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import { useTeacher } from '@/utils/useTeacher';
import { formatTeacherName } from '@/utils/formatTeacherName';
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens';

function navItemStyle(active) {
  return {
    padding: '8px 14px',
    borderRadius: RADIUS.md,
    fontSize: 14,
    fontWeight: 700,
    textDecoration: 'none',
    color: active ? COLORS.textOnGreen : 'rgba(255,255,255,0.92)',
    background: active ? 'rgba(255,255,255,0.22)' : 'transparent',
    border: active ? '1px solid rgba(255,255,255,0.35)' : '1px solid transparent',
  };
}

export default function TeacherLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { teacher, loading } = useTeacher();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const isMonitor = pathname === '/teacher/monitor';
  const isTest = pathname === '/teacher/test';
  const isSettings = pathname === '/teacher/settings';
  const isWords =
    pathname === '/teacher/words' ||
    (pathname?.startsWith('/teacher/words/') && !pathname?.startsWith('/teacher/words/create'));

  const rawTeacherName = teacher?.name?.trim();
  const displayName = rawTeacherName
    ? formatTeacherName(rawTeacherName)
    : teacher?.email || '선생님';
  const academyLabel = (teacher?.academy_name && String(teacher.academy_name).trim()) || '';
  const academyLogo = (teacher?.academy_logo_url && String(teacher.academy_logo_url).trim()) || '';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f3e7ff 0%, #eef2ff 100%)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      }}
    >
      <header
        className="teacher-layout-header"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          padding: '12px 20px',
          background: COLORS.headerGradient,
          boxShadow: SHADOW.card,
          borderBottom: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <Link
          href="/teacher/monitor"
          style={{
            fontSize: 18,
            fontWeight: 900,
            color: COLORS.textOnGreen,
            textDecoration: 'none',
            letterSpacing: '-0.02em',
          }}
        >
          똑패스
        </Link>

        <nav
          className="teacher-app-nav"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: 1,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link href="/teacher/monitor" style={navItemStyle(isMonitor)}>
            모니터
          </Link>
          <Link href="/teacher/words" style={navItemStyle(isWords)}>
            단어 관리
          </Link>
          <Link href="/teacher/test" style={navItemStyle(isTest)}>
            테스트지
          </Link>
          <Link href="/teacher/settings" style={navItemStyle(isSettings)}>
            설정
          </Link>
        </nav>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
            flexWrap: 'nowrap',
            maxWidth: 'min(420px, 100%)',
          }}
        >
          {academyLogo ? (
            <img
              src={academyLogo}
              alt=""
              width={30}
              height={30}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                objectFit: 'cover',
                flexShrink: 0,
                border: '1px solid rgba(255,255,255,0.35)',
              }}
            />
          ) : null}
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.95)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 200,
            }}
            title={teacher?.email}
          >
            {loading ? '…' : displayName}
            {academyLabel ? (
              <>
                {' '}
                <span style={{ opacity: 0.85 }}>|</span>
                {' '}
                <span style={{ fontWeight: 500 }}>{academyLabel}</span>
              </>
            ) : null}
          </span>
          <button
            type="button"
            onClick={() => void handleLogout()}
            style={{
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 700,
              color: COLORS.accentText,
              background: 'rgba(255,255,255,0.95)',
              border: 'none',
              borderRadius: RADIUS.sm,
              cursor: 'pointer',
            }}
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="teacher-main-shell" style={{ flex: 1, minHeight: 0, width: '100%', maxWidth: '100%' }}>
        {children}
      </main>
    </div>
  );
}
