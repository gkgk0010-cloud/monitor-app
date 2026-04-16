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
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const email = session?.user?.email?.trim();
    if (!email) {
      setTeacher(null);
      setLoading(false);
      return;
    }

    const { data, error: qErr } = await supabase
      .from('teachers')
      .select('id, name, email, invite_code, academy_id, visible_menus')
      .eq('email', email)
      .maybeSingle();

    if (qErr) {
      console.warn('[useTeacher] teachers 조회 실패:', qErr.message);
      setError(qErr);
      setTeacher(null);
      setLoading(false);
      return;
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
