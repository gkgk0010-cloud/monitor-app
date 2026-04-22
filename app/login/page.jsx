'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import { ensureTeacherRowForSession } from '@/utils/teacherSignup';
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data: signData, error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signErr) {
        setError(signErr.message || '로그인에 실패했습니다.');
        setSubmitting(false);
        return;
      }
      const session = signData?.session;
      if (session) {
        const ensured = await ensureTeacherRowForSession(session);
        if (!ensured.ok) {
          setError(ensured.error?.message || '선생님 정보 연동에 실패했습니다. 관리자에게 문의하세요.');
          setSubmitting(false);
          return;
        }
      }
      if (typeof window !== 'undefined') {
        window.location.replace(`${window.location.origin}/teacher/monitor`);
      } else {
        router.replace('/teacher/monitor');
      }
    } catch (err) {
      setError(err?.message || '로그인 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f3e7ff 0%, #eef2ff 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          padding: '36px 28px',
          borderRadius: RADIUS.xl,
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(31, 38, 135, 0.08)',
          border: '1px solid rgba(255,255,255,0.65)',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            marginBottom: 28,
          }}
        >
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              background: COLORS.headerGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: 6,
            }}
          >
            똑패스 선생님
          </h1>
          <p style={{ fontSize: 13, color: COLORS.textSecondary, fontWeight: 500 }}>관리자 로그인</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label
              htmlFor="login-email"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 6 }}
            >
              이메일
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={submitting}
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: 15,
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                outline: 'none',
                boxSizing: 'border-box',
                background: COLORS.surface,
              }}
            />
          </div>
          <div>
            <label
              htmlFor="login-password"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 6 }}
            >
              비밀번호
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: 15,
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                outline: 'none',
                boxSizing: 'border-box',
                background: COLORS.surface,
              }}
            />
          </div>

          {error ? (
            <p style={{ fontSize: 13, color: COLORS.danger, margin: 0 }} role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 4,
              padding: '14px 16px',
              fontSize: 15,
              fontWeight: 700,
              color: COLORS.textOnGreen,
              border: 'none',
              borderRadius: RADIUS.md,
              background: COLORS.headerGradient,
              cursor: submitting ? 'wait' : 'pointer',
              boxShadow: '0 4px 16px rgba(102, 126, 234, 0.28)',
              opacity: submitting ? 0.85 : 1,
            }}
          >
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link href="/login/register" style={{ color: COLORS.primary, fontWeight: 600, textDecoration: 'none' }}>
            회원가입
          </Link>
          <Link href="/" style={{ color: COLORS.primary, fontWeight: 600, textDecoration: 'none' }}>
            ← 관리 홈으로
          </Link>
        </p>
      </div>
    </div>
  );
}
