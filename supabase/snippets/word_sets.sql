-- word_sets: 세트 메타(타입·노출 학습 모드). monitor-app「새 세트 만들기」모달에서 insert.
-- Supabase SQL Editor에서 실행 후 RLS 확인.

CREATE TABLE IF NOT EXISTS public.word_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers (id) ON DELETE CASCADE,
  name text NOT NULL,
  set_type text NOT NULL CHECK (set_type IN ('word', 'sentence', 'image')),
  available_modes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, name)
);

CREATE INDEX IF NOT EXISTS word_sets_teacher_id_idx ON public.word_sets (teacher_id);

ALTER TABLE public.word_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "word_sets_select_own" ON public.word_sets;
DROP POLICY IF EXISTS "word_sets_insert_own" ON public.word_sets;
DROP POLICY IF EXISTS "word_sets_update_own" ON public.word_sets;
DROP POLICY IF EXISTS "word_sets_delete_own" ON public.word_sets;

CREATE POLICY "word_sets_select_own"
  ON public.word_sets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id = word_sets.teacher_id
        AND t.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "word_sets_insert_own"
  ON public.word_sets FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id = word_sets.teacher_id
        AND t.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "word_sets_update_own"
  ON public.word_sets FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id = word_sets.teacher_id
        AND t.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "word_sets_delete_own"
  ON public.word_sets FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id = word_sets.teacher_id
        AND t.email = (auth.jwt() ->> 'email')
    )
  );
