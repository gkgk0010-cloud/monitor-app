-- 단어 세트 내 표시·학습 순서 (선생 앱 셔플 / 학생 앱 동일 순서)
-- Supabase SQL Editor에서 실행 후 클라이언트에서 SELECT/ORDER BY 반영.

ALTER TABLE public.words ADD COLUMN IF NOT EXISTS order_index integer;

CREATE INDEX IF NOT EXISTS words_teacher_set_order_idx
  ON public.words (teacher_id, set_name, order_index);

COMMENT ON COLUMN public.words.order_index IS '세트(set_name) 내 정렬 순서(1..n). NULL이면 day/created_at 보조 정렬.';
