-- 박스 만들기 세트 모드 (tokpass-app/migrations/grammar_lab_box_mode.sql 동일)

CREATE TABLE IF NOT EXISTS public.grammar_lab_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  set_name text NOT NULL,
  training_kind text NOT NULL CHECK (training_kind IN ('word_order', 'box_drill')),
  box_mode text NOT NULL DEFAULT 'full' CHECK (box_mode IN ('full', 'target')),
  task_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, set_name, training_kind)
);

COMMENT ON TABLE public.grammar_lab_sets IS '독해 훈련소 세트 메타 (이름·종류당 1행). box_mode는 box_drill 전용';
COMMENT ON COLUMN public.grammar_lab_sets.box_mode IS 'full=전체 박스 | target=타겟 박스 (box_drill)';
COMMENT ON COLUMN public.grammar_lab_sets.task_description IS '타겟 모드 학생 안내 (예: be동사구만 박스로 표시하세요)';

CREATE INDEX IF NOT EXISTS idx_grammar_lab_sets_teacher_kind
  ON public.grammar_lab_sets (teacher_id, training_kind);

ALTER TABLE public.grammar_lab_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gls_select_published ON public.grammar_lab_sets;
CREATE POLICY gls_select_published ON public.grammar_lab_sets
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sentence_training_items st
      WHERE st.teacher_id::text = grammar_lab_sets.teacher_id::text
        AND st.set_name = grammar_lab_sets.set_name
        AND st.training_kind = grammar_lab_sets.training_kind
        AND st.is_published = true
    )
  );

DROP POLICY IF EXISTS gls_teacher_all ON public.grammar_lab_sets;
CREATE POLICY gls_teacher_all ON public.grammar_lab_sets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id::text = grammar_lab_sets.teacher_id::text
        AND t.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id::text = grammar_lab_sets.teacher_id::text
        AND t.email = (auth.jwt() ->> 'email')
    )
  );
