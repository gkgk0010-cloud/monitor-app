-- slot_drill_attempts — monitor-app snippets (tokpass-app/migrations/slot_drill_attempts.sql 동일)
-- Supabase SQL Editor에서 실행 (멱등)

CREATE TABLE IF NOT EXISTS public.slot_drill_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  item_id uuid REFERENCES public.sentence_training_items(id) ON DELETE SET NULL,
  box_index int NOT NULL,
  student_answer text NOT NULL,
  ai_role text,
  score float NOT NULL,
  feedback text,
  is_pass boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sda_user_item_created
  ON public.slot_drill_attempts (user_id, item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sda_user_created
  ON public.slot_drill_attempts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sda_item_box
  ON public.slot_drill_attempts (item_id, box_index, created_at DESC);

ALTER TABLE public.slot_drill_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sda_insert_anon ON public.slot_drill_attempts;
CREATE POLICY sda_insert_anon ON public.slot_drill_attempts
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS sda_select_own ON public.slot_drill_attempts;
CREATE POLICY sda_select_own ON public.slot_drill_attempts
  FOR SELECT TO anon, authenticated USING (true);
