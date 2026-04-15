'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import { useTeacher } from '@/utils/useTeacher';
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
  const isWords =
    pathname === '/teacher/words' ||
    (pathname?.startsWith('/teacher/words/') && !pathname?.startsWith('/teacher/words/create'));

  const displayName = teacher?.name?.trim() || teacher?.email || '선생님';

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', flexDirection: 'column' }}>
      <header
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
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.95)', maxWidth: 160 }} title={teacher?.email}>
            {loading ? '…' : displayName}
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

      <main style={{ flex: 1, minHeight: 0 }}>{children}</main>
    </div>
  );
}
