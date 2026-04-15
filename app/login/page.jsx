'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
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
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signErr) {
        setError(signErr.message || '로그인에 실패했습니다.');
        setSubmitting(false);
        return;
      }
      router.replace('/teacher/monitor');
      router.refresh();
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
        background: COLORS.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          padding: '36px 28px',
          borderRadius: RADIUS.xl,
          background: COLORS.surface,
          boxShadow: SHADOW.modal,
          border: `1px solid ${COLORS.border}`,
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
          <p style={{ fontSize: 13, color: COLORS.textSecondary }}>관리자 로그인</p>
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
              boxShadow: '0 4px 16px rgba(102, 126, 234, 0.35)',
              opacity: submitting ? 0.85 : 1,
            }}
          >
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13 }}>
          <Link href="/" style={{ color: COLORS.primary, fontWeight: 600, textDecoration: 'none' }}>
            ← 관리 홈으로
          </Link>
        </p>
      </div>
    </div>
  );
}
