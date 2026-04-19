'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import { ensureTeacherRowForSession } from '@/utils/teacherSignup';
import { COLORS, RADIUS } from '@/utils/tokens';

/** Supabase 이메일 템플릿·브라우저에 따라 ?code= · #access_token= · ?token_hash= 등으로 돌아옴 */
const OTP_TYPES = new Set(['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']);

function normalizeOtpType(raw) {
  if (raw && OTP_TYPES.has(raw)) return raw;
  return 'signup';
}

function parseHashParams() {
  const h = typeof window !== 'undefined' ? window.location.hash : '';
  if (!h || h.length < 2) return new URLSearchParams();
  return new URLSearchParams(h.replace(/^#/, ''));
}

/**
 * Supabase 이메일 인증·OAuth 후 돌아올 때 세션으로 교환.
 * Redirect URLs에 이 경로(프로덕션 도메인 포함)를 등록해야 합니다.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('인증 확인 중…');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const search = new URLSearchParams(window.location.search);
      const hash = parseHashParams();

      const err = search.get('error') || hash.get('error');
      const errDesc = search.get('error_description') || hash.get('error_description');
      if (err) {
        if (!cancelled) {
          setDone(true);
          setMessage(errDesc ? decodeURIComponent(String(errDesc).replace(/\+/g, ' ')) : err);
        }
        return;
      }

      /** 1) PKCE: ?code= */
      const code = search.get('code');
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exErr) {
          setDone(true);
          setMessage(exErr.message || '인증에 실패했습니다.');
          return;
        }
      } else {
        /** 2) 구형·implicit: #access_token= & refresh_token= */
        const access_token = hash.get('access_token');
        const refresh_token = hash.get('refresh_token');
        if (access_token && refresh_token) {
          const { error: sErr } = await supabase.auth.setSession({ access_token, refresh_token });
          if (cancelled) return;
          if (sErr) {
            setDone(true);
            setMessage(sErr.message || '세션 설정에 실패했습니다.');
            return;
          }
        } else {
          /** 3) 이메일 링크: ?token_hash= & type= (또는 해시에 동일) */
          const token_hash = search.get('token_hash') || hash.get('token_hash');
          const typeRaw = search.get('type') || hash.get('type');
          if (token_hash) {
            const { error: vErr } = await supabase.auth.verifyOtp({
              token_hash,
              type: normalizeOtpType(typeRaw),
            });
            if (cancelled) return;
            if (vErr) {
              setDone(true);
              setMessage(vErr.message || '이메일 인증에 실패했습니다.');
              return;
            }
          } else {
            /** 4) 클라이언트가 URL에서 세션을 이미 복구한 경우 */
            const {
              data: { session: existing },
            } = await supabase.auth.getSession();
            if (!existing) {
              if (!cancelled) {
                setDone(true);
                setMessage(
                  '인증 정보를 찾을 수 없습니다. 메일의 링크를 크롬·사파리에서 다시 열거나, 네이버 앱 내 브라우저가 아닌 기본 브라우저로 시도해 주세요. (링크가 만료됐다면 로그인 화면에서 인증 메일을 다시 요청할 수 있습니다.)',
                );
              }
              return;
            }
          }
        }
      }

      try {
        if (window.location.hash) {
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        }
      } catch {
        /* noop */
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session) {
        const ensured = await ensureTeacherRowForSession(session);
        if (!ensured.ok) {
          setDone(true);
          setMessage(ensured.error?.message || '선생님 정보 연동에 실패했습니다.');
          return;
        }
      } else {
        setDone(true);
        setMessage('로그인 세션을 만들지 못했습니다. 링크를 다시 열거나 로그인을 시도해 주세요.');
        return;
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
