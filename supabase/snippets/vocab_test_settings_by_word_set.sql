-- 세트 단위 객관식 테스트 기준 (monitor-app 세트 설정에서 저장)
-- word_sets.id 참조

CREATE TABLE IF NOT EXISTS public.vocab_test_settings (
  word_set_id uuid PRIMARY KEY REFERENCES public.word_sets (id) ON DELETE CASCADE,
  pass_score integer NOT NULL DEFAULT 80 CHECK (pass_score >= 0 AND pass_score <= 100),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  test_question_types text[] NOT NULL DEFAULT ARRAY['word_to_meaning']::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vocab_test_settings_word_set_id_idx ON public.vocab_test_settings (word_set_id);

ALTER TABLE public.vocab_test_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vocab_test_settings_select_own" ON public.vocab_test_settings;
DROP POLICY IF EXISTS "vocab_test_settings_insert_own" ON public.vocab_test_settings;
DROP POLICY IF EXISTS "vocab_test_settings_update_own" ON public.vocab_test_settings;
DROP POLICY IF EXISTS "vocab_test_settings_delete_own" ON public.vocab_test_settings;

CREATE POLICY "vocab_test_settings_select_own"
  ON public.vocab_test_settings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.word_sets ws
      JOIN public.teachers t ON t.id = ws.teacher_id
      WHERE ws.id = vocab_test_settings.word_set_id
        AND t.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "vocab_test_settings_insert_own"
  ON public.vocab_test_settings FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.word_sets ws
      JOIN public.teachers t ON t.id = ws.teacher_id
      WHERE ws.id = vocab_test_settings.word_set_id
        AND t.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "vocab_test_settings_update_own"
  ON public.vocab_test_settings FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.word_sets ws
      JOIN public.teachers t ON t.id = ws.teacher_id
      WHERE ws.id = vocab_test_settings.word_set_id
        AND t.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "vocab_test_settings_delete_own"
  ON public.vocab_test_settings FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.word_sets ws
      JOIN public.teachers t ON t.id = ws.teacher_id
      WHERE ws.id = vocab_test_settings.word_set_id
        AND t.email = (auth.jwt() ->> 'email')
    )
  );
