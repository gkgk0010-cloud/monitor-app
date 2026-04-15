-- words 테이블 RLS 오류: "new row violates row-level security policy for table words"
-- Supabase → SQL Editor 에서 실행. 앱은 teacher_id + 로그인 이메일로 teachers 와 연결됨.
--
-- 전제: teachers 에 본인 이메일 행이 있고, words.teacher_id 가 그 id 를 가리킴.
-- teachers 테이블에 RLS가 켜져 있으면, 아래 EXISTS 가 teachers 를 읽을 수 있도록
-- teachers 에도 "본인 행 SELECT" 정책이 필요할 수 있음.

ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "words_select_own" ON public.words;
DROP POLICY IF EXISTS "words_insert_own" ON public.words;
DROP POLICY IF EXISTS "words_update_own" ON public.words;
DROP POLICY IF EXISTS "words_delete_own" ON public.words;

CREATE POLICY "words_select_own"
  ON public.words FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id = words.teacher_id
        AND t.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "words_insert_own"
  ON public.words FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id = words.teacher_id
        AND t.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "words_update_own"
  ON public.words FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id = words.teacher_id
        AND t.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id = words.teacher_id
        AND t.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "words_delete_own"
  ON public.words FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id = words.teacher_id
        AND t.email = (auth.jwt() ->> 'email')
    )
  );

-- teachers 에 RLS가 있어서 위 정책 평가 시 본인 행을 못 읽으면, 아래도 실행.
-- (teachers 가 UNRESTRICTED / RLS off 이면 생략 가능)

-- ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "teachers_select_own_email" ON public.teachers;
-- CREATE POLICY "teachers_select_own_email"
--   ON public.teachers FOR SELECT TO authenticated
--   USING (email = (auth.jwt() ->> 'email'));
