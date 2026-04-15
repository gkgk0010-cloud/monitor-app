'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import { ensureTeacherRowForSession } from '@/utils/teacherSignup';
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (password !== password2) {
      setError('비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: signErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: name.trim() || undefined,
          },
        },
      });
      if (signErr) {
        setError(signErr.message || '회원가입에 실패했습니다.');
        setSubmitting(false);
        return;
      }

      const session = data?.session;
      if (session) {
        const ensured = await ensureTeacherRowForSession(session);
        if (!ensured.ok) {
          setError(ensured.error?.message || '선생님 정보 등록에 실패했습니다. 관리자에게 문의하세요.');
          setSubmitting(false);
          return;
        }
        router.replace('/teacher/monitor');
        router.refresh();
        return;
      }

      setInfo(
        '가입 메일을 보냈습니다. 메일함에서 링크를 확인한 뒤 로그인해 주세요. (인증 후 로그인 시 선생님 정보가 자동으로 연결됩니다.)',
      );
    } catch (err) {
      setError(err?.message || '회원가입 중 오류가 발생했습니다.');
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
          <p style={{ fontSize: 13, color: COLORS.textSecondary }}>회원가입</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label
              htmlFor="reg-name"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 6 }}
            >
              이름
            </label>
            <input
              id="reg-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              htmlFor="reg-email"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 6 }}
            >
              이메일
            </label>
            <input
              id="reg-email"
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
              htmlFor="reg-password"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 6 }}
            >
              비밀번호
            </label>
            <input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
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
              htmlFor="reg-password2"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 6 }}
            >
              비밀번호 확인
            </label>
            <input
              id="reg-password2"
              type="password"
              autoComplete="new-password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
              minLength={6}
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
          {info ? (
            <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: 0, lineHeight: 1.5 }} role="status">
              {info}
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
            {submitting ? '처리 중…' : '가입하기'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13 }}>
          <Link href="/login" style={{ color: COLORS.primary, fontWeight: 600, textDecoration: 'none' }}>
            이미 계정이 있으신가요? 로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
