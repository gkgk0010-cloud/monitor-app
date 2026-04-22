'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import { explainAuthEmailError } from '@/utils/authEmailHelp';
import { ensureTeacherRowForSession } from '@/utils/teacherSignup';
import { uploadAndAssignAcademyLogo } from '@/utils/academyStorage';
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens';
import AcademyLogoDropzone from '@/app/teacher/components/AcademyLogoDropzone';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [academyName, setAcademyName] = useState('');
  const [teachingType, setTeachingType] = useState('general');
  const [logoFile, setLogoFile] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendBusy, setResendBusy] = useState(false);
  const resendTickRef = useRef(null);

  useEffect(() => {
    return () => {
      if (resendTickRef.current) window.clearInterval(resendTickRef.current);
    };
  }, []);

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
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { data, error: signErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: name.trim() || undefined,
            teaching_type: teachingType,
            /** 이메일 인증 후 /auth/callback 에서 ensureTeacherRowForSession 이 학원 행 생성 시 사용 */
            academy_name: academyName.trim() || undefined,
          },
          /** 메일 링크가 배포 도메인(또는 로컬)의 /auth/callback 으로 오도록 함 */
          emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
        },
      });
      if (signErr) {
        setError(explainAuthEmailError(signErr) || '회원가입에 실패했습니다.');
        setSubmitting(false);
        return;
      }

      const session = data?.session;
      if (session) {
        const ensured = await ensureTeacherRowForSession(session, {
          academy_name: academyName.trim() || undefined,
          teaching_type: teachingType,
        });
        if (!ensured.ok) {
          setError(ensured.error?.message || '선생님 정보 등록에 실패했습니다. 관리자에게 문의하세요.');
          setSubmitting(false);
          return;
        }
        if (logoFile && ensured.created) {
          let tid = ensured.teacherId;
          if (!tid) {
            const { data: row } = await supabase
              .from('teachers')
              .select('id')
              .eq('email', email.trim())
              .maybeSingle();
            tid = row?.id;
          }
          if (tid) {
            try {
              await uploadAndAssignAcademyLogo(tid, logoFile, null);
            } catch (logoErr) {
              console.warn('[register] 학원 로고 업로드 실패:', logoErr);
            }
          }
        }
        if (typeof window !== 'undefined') {
          window.location.replace(`${window.location.origin}/teacher/monitor`);
        } else {
          router.replace('/teacher/monitor');
        }
        return;
      }

      setInfo(
        '가입 확인 메일을 보냈습니다. 받은편지함·스팸함을 확인해 주세요. 몇 분 걸릴 수 있습니다. 이미 가입된 주소면 보안상 메일이 가지 않을 수 있으니 로그인을 시도해 보세요. 메일이 자주 막히면 Supabase Authentication → SMTP 연동(Resend 등)을 권장합니다. 기본 메일만 쓰면 한도를 UI에서 잘 못 올립니다.',
      );
    } catch (err) {
      setError(err?.message || '회원가입 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendSignupEmail() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('이메일을 입력한 뒤 다시 시도해 주세요.');
      return;
    }
    setError('');
    setResendBusy(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { error: resendErr } = await supabase.auth.resend({
        type: 'signup',
        email: trimmed,
        options: origin ? { emailRedirectTo: `${origin}/auth/callback` } : undefined,
      });
      if (resendErr) {
        setError(explainAuthEmailError(resendErr) || '재전송에 실패했습니다.');
        return;
      }
      setInfo(
        '인증 메일을 다시 보냈습니다. 스팸함도 확인해 주세요. 안 오면 Rate limits 이메일 한도·SMTP 설정을 확인하세요.',
      );
      if (resendTickRef.current) window.clearInterval(resendTickRef.current);
      setResendCooldown(60);
      resendTickRef.current = window.setInterval(() => {
        setResendCooldown((c) => {
          if (c <= 1) {
            if (resendTickRef.current) window.clearInterval(resendTickRef.current);
            resendTickRef.current = null;
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err?.message || '재전송 중 오류가 발생했습니다.');
    } finally {
      setResendBusy(false);
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
              htmlFor="reg-academy"
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 6 }}
            >
              학원명 (선택)
            </label>
            <input
              id="reg-academy"
              type="text"
              autoComplete="organization"
              value={academyName}
              onChange={(e) => setAcademyName(e.target.value)}
              disabled={submitting}
              placeholder="예: 똑패스 영어학원"
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
            <span
              style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 8 }}
            >
              학원 로고 (선택)
            </span>
            <AcademyLogoDropzone
              existingUrl={null}
              pendingFile={logoFile}
              onFileChange={setLogoFile}
              disabled={submitting}
              inputId="reg-academy-logo"
            />
          </div>

          <fieldset
            disabled={submitting}
            style={{
              margin: 0,
              padding: 0,
              border: 'none',
              minWidth: 0,
            }}
          >
            <legend
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: COLORS.textPrimary,
                marginBottom: 10,
                padding: 0,
              }}
            >
              강의 유형
            </legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  color: COLORS.textPrimary,
                  lineHeight: 1.45,
                }}
              >
                <input
                  type="radio"
                  name="teaching-type"
                  checked={teachingType === 'toeic'}
                  onChange={() => setTeachingType('toeic')}
                  style={{ marginTop: 3, flexShrink: 0 }}
                />
                <span>
                  <strong style={{ fontWeight: 700 }}>토익 강의 위주</strong>
                  <span style={{ color: COLORS.textSecondary }}> (토익 전용 메뉴 활성)</span>
                </span>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  color: COLORS.textPrimary,
                  lineHeight: 1.45,
                }}
              >
                <input
                  type="radio"
                  name="teaching-type"
                  checked={teachingType === 'general'}
                  onChange={() => setTeachingType('general')}
                  style={{ marginTop: 3, flexShrink: 0 }}
                />
                <span>
                  <strong style={{ fontWeight: 700 }}>일반 어학원</strong>
                  <span style={{ color: COLORS.textSecondary }}> (단어 학습 중심)</span>
                </span>
              </label>
            </div>
            <p
              style={{
                margin: '12px 0 0',
                fontSize: 12,
                color: COLORS.textSecondary,
                lineHeight: 1.5,
              }}
            >
              ※ 단어 학습은 공통이며, 토익 전용 메뉴는 설정에서 나중에 바꿀 수 있습니다.
            </p>
          </fieldset>

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

          {info ? (
            <button
              type="button"
              onClick={handleResendSignupEmail}
              disabled={resendBusy || resendCooldown > 0}
              style={{
                padding: '10px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: COLORS.primary,
                background: COLORS.primarySoft,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.md,
                cursor: resendBusy || resendCooldown > 0 ? 'not-allowed' : 'pointer',
                opacity: resendBusy || resendCooldown > 0 ? 0.7 : 1,
              }}
            >
              {resendBusy
                ? '보내는 중…'
                : resendCooldown > 0
                  ? `인증 메일 다시 보내기 (${resendCooldown}초 후 가능)`
                  : '인증 메일 다시 보내기'}
            </button>
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
        <p
          style={{
            marginTop: 16,
            fontSize: 11,
            lineHeight: 1.5,
            color: COLORS.textSecondary,
            textAlign: 'center',
          }}
        >
          운영자: 기본 SMTP만 쓰면「이메일 발송」한도가 2/시간처럼 낮게 고정되고 Rate limits 숫자가 안 바뀌는 경우가 많습니다. Supabase 문서상 이메일 발송 한도 조정은 Custom SMTP 연동 후 가능합니다. Authentication → SMTP에 Resend 등을 넣은 뒤 한도·발송을 설정하세요.
        </p>
      </div>
    </div>
  );
}
