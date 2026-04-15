'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import { ensureTeacherRowForSession } from '@/utils/teacherSignup';
import { COLORS, RADIUS } from '@/utils/tokens';

/**
 * Supabase 이메일 인증·OAuth 후 ?code= 로 돌아올 때 세션으로 교환.
 * 대시보드 Redirect URLs에 이 경로(프로덕션 도메인 포함)를 등록해야 합니다.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('인증 확인 중…');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      const errDesc = params.get('error_description');
      if (err) {
        if (!cancelled) {
          setDone(true);
          setMessage(errDesc ? decodeURIComponent(errDesc.replace(/\+/g, ' ')) : err);
        }
        return;
      }

      const code = params.get('code');
      if (!code) {
        if (!cancelled) {
          setDone(true);
          setMessage('인증 코드가 없습니다. 메일의 링크를 다시 열거나 로그인을 시도해 주세요.');
        }
        return;
      }

      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;
      if (exErr) {
        setDone(true);
        setMessage(exErr.message || '인증에 실패했습니다.');
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const ensured = await ensureTeacherRowForSession(session);
        if (!ensured.ok) {
          setDone(true);
          setMessage(ensured.error?.message || '선생님 정보 연동에 실패했습니다.');
          return;
        }
      }

      router.replace('/teacher/monitor');
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: COLORS.bg,
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          maxWidth: 400,
          padding: 28,
          borderRadius: RADIUS.xl,
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0, fontSize: 15, color: COLORS.textPrimary, lineHeight: 1.5 }}>{message}</p>
        {done ? (
          <p style={{ marginTop: 20, marginBottom: 0 }}>
            <Link href="/login" style={{ color: COLORS.primary, fontWeight: 600, textDecoration: 'none' }}>
              로그인 화면으로
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
