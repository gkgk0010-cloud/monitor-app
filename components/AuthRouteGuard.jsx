'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';

/**
 * 클라이언트 세션 기준 라우팅 (기존 supabase 단일 클라이언트 유지).
 * /teacher/* 비로그인 → /login, /login 로그인됨 → /teacher/monitor
 */
export default function AuthRouteGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const needCheck = pathname?.startsWith('/teacher') || pathname === '/login';
    if (!needCheck) return undefined;

    let alive = true;
    setChecking(true);

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!alive) return;

      const isTeacher = pathname?.startsWith('/teacher');
      const isLogin = pathname === '/login';

      if (isTeacher && !session) {
        router.replace('/login');
      } else if (isLogin && session) {
        router.replace('/teacher/monitor');
      }
      if (alive) setChecking(false);
    })();

    return () => {
      alive = false;
    };
  }, [pathname, router]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const isTeacher = pathname?.startsWith('/teacher');
      const isLogin = pathname === '/login';
      if (isTeacher && !session) {
        router.replace('/login');
      } else if (isLogin && session) {
        router.replace('/teacher/monitor');
      }
    });
    return () => subscription.unsubscribe();
  }, [pathname, router]);

  const needCheck = pathname?.startsWith('/teacher') || pathname === '/login';
  if (checking && needCheck) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg, #f8f7fc)',
          fontFamily: 'inherit',
        }}
      >
        <p style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)' }}>확인 중…</p>
      </div>
    );
  }

  return children;
}
