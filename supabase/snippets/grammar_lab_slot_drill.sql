-- 칸 나누기(slot_drill) — monitor-app snippets (tokpass-app/migrations/grammar_lab_slot_drill.sql 동일)

ALTER TABLE public.box_drill_answers
  ADD COLUMN IF NOT EXISTS role_hint text;

COMMENT ON COLUMN public.box_drill_answers.role_hint IS '칸 나누기 UI 박스 역할 라벨 (예: 주절, 시점)';

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, t.relname AS tbl
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname IN ('grammar_lab_session_completions', 'training_solve_history')
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%training_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.grammar_lab_session_completions
  DROP CONSTRAINT IF EXISTS grammar_lab_session_completions_training_type_check;

ALTER TABLE public.grammar_lab_session_completions
  ADD CONSTRAINT grammar_lab_session_completions_training_type_check
  CHECK (training_type IN ('word_order', 'box_drill', 'reading_interpret', 'slot_drill'));

ALTER TABLE public.training_solve_history
  DROP CONSTRAINT IF EXISTS training_solve_history_training_type_check;

ALTER TABLE public.training_solve_history
  ADD CONSTRAINT training_solve_history_training_type_check
  CHECK (training_type IN ('word_order', 'box_drill', 'reading_interpret', 'slot_drill'));

COMMENT ON COLUMN public.grammar_lab_session_completions.training_type IS 'word_order | box_drill | reading_interpret | slot_drill';
