-- 선생님 회원가입: teachers / academies RLS + 고아 auth 사용자 복구
-- Supabase SQL Editor에서 실행 (service role API 배포 후에도 방어용으로 권장)

-- ── 1) teachers: 본인 이메일 행 SELECT (authenticated) ──
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teachers_select_own_email" ON public.teachers;
CREATE POLICY "teachers_select_own_email"
  ON public.teachers FOR SELECT TO authenticated
  USING (email = (auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "teachers_update_own_email" ON public.teachers;
CREATE POLICY "teachers_update_own_email"
  ON public.teachers FOR UPDATE TO authenticated
  USING (email = (auth.jwt() ->> 'email'))
  WITH CHECK (email = (auth.jwt() ->> 'email'));

-- INSERT는 monitor-app /api/teacher/provision (service role)에서 처리.
-- 클라이언트 직접 INSERT 정책은 의도적으로 두지 않음.

-- ── 2) academies: authenticated UPDATE (설정에서 학원명 변경) ──
-- INSERT는 service role API만 사용
DROP POLICY IF EXISTS "academies_select_authenticated" ON public.academies;
CREATE POLICY "academies_select_authenticated"
  ON public.academies FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "academies_update_teacher_linked" ON public.academies;
CREATE POLICY "academies_update_teacher_linked"
  ON public.academies FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.academy_id = academies.id
        AND t.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.academy_id = academies.id
        AND t.email = (auth.jwt() ->> 'email')
    )
  );

-- ── 3) 2026-04-30 이후 auth만 있고 teachers 없는 계정 점검 ──
-- SELECT u.email, u.created_at
-- FROM auth.users u
-- LEFT JOIN public.teachers t ON t.email = u.email
-- WHERE t.id IS NULL
--   AND u.created_at > '2026-04-30'::timestamptz
-- ORDER BY u.created_at;

-- ── 4) 수동 복구 템플릿 (이메일·이름·학원명 치환 후 실행) ──
-- DO $$
-- DECLARE
--   v_email text := 'teacher@example.com';
--   v_name text := '홍길동';
--   v_academy_name text := '홍길동 학원';
--   v_academy_id uuid;
--   v_teacher_id uuid;
-- BEGIN
--   INSERT INTO public.academies (name, code, auth_mode)
--   VALUES (v_academy_name, 'ac-' || substr(md5(random()::text), 1, 12), 'open_access')
--   RETURNING id INTO v_academy_id;
--
--   INSERT INTO public.teachers (
--     email, name, academy_id, academy_name, code, invite_code,
--     teaching_type, visible_menus
--   )
--   VALUES (
--     v_email,
--     v_name,
--     v_academy_id,
--     v_academy_name,
--     'teacher-' || substr(md5(random()::text), 1, 8),
--     upper(substr(md5(random()::text), 1, 8)),
--     'general',
--     '{"vocab":true,"quiz":false,"result":false,"homework":false,"absence":false,"jokbo":false}'::jsonb
--   )
--   RETURNING id INTO v_teacher_id;
--
--   RAISE NOTICE 'restored teacher % for %', v_teacher_id, v_email;
-- END $$;
