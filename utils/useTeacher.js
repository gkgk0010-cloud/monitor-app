import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/utils/supabaseClient';

/**
 * 현재 로그인한 Auth 사용자 email로 teachers 테이블에서 선생님 행 조회.
 * @returns {{ teacher: object | null, loading: boolean, error: Error | null, refresh: function }}
 */
export function useTeacher() {
  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);

    /** 클라이언트 세션이 아직 storage에 안 올라온 직후(회원가입→라우트 전환) 대비 */
    let session = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      session = s;
      if (session?.user?.email) break;
      await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
    }

    const email = session?.user?.email?.trim();
    if (!email) {
      if (typeof window !== 'undefined') {
        console.warn('[useTeacher] session email 없음 — getSession 재시도 후에도 비어 있음');
      }
      setTeacher(null);
      setLoading(false);
      return;
    }

    /** insert 직후 RLS/세션 타이밍 — teachers 행이 잠깐 비는 경우 재시도 */
    let data = null;
    let qErr = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await supabase
        .from('teachers')
        .select(
          'id, name, email, invite_code, academy_id, visible_menus, academy_name, academy_logo_url, teaching_type',
        )
        .eq('email', email)
        .maybeSingle();
      qErr = res.error;
      data = res.data;
      if (qErr) break;
      if (data) break;
      await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
    }

    if (qErr) {
      console.warn('[useTeacher] teachers 조회 실패:', qErr.message);
      setError(qErr);
      setTeacher(null);
      setLoading(false);
      return;
    }

    if (!data) {
      console.warn('[useTeacher] teachers 행 없음 (재시도 후)', { email });
    }

    setTeacher(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (cancelled) return;
    })();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      load();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [load]);

  return { teacher, loading, error, refresh: load };
}
