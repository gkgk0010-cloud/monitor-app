-- 문제풀이 유형 구분: output(기존) / input(노션 테스트)
-- output = 오늘의 연구, 복습 등 기존 문제풀이
-- input  = 노션 내용 테스트 (단어·시제부사 등)
-- Supabase 대시보드 → SQL Editor에서 실행

ALTER TABLE public.answer_logs
  ADD COLUMN IF NOT EXISTS quiz_type text DEFAULT 'output';

COMMENT ON COLUMN public.answer_logs.quiz_type IS 'output=오늘의연구/복습 등 기존 문제풀이, input=노션 내용 테스트(단어 등)';

CREATE INDEX IF NOT EXISTS idx_answer_logs_quiz_type_created
  ON public.answer_logs (quiz_type, created_at DESC);
