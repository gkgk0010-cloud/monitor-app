-- 기존에 'grammar'로 들어간 값을 'output'으로 통일
-- quiz_type을 output/input으로 쓰기로 한 뒤 한 번만 실행
-- Supabase SQL Editor에서 실행

UPDATE public.answer_logs
SET quiz_type = 'output'
WHERE quiz_type = 'grammar' OR quiz_type IS NULL;

-- status_logs에 quiz_type 컬럼이 있다면 동일하게
-- ALTER TABLE public.status_logs ADD COLUMN IF NOT EXISTS quiz_type text;
-- UPDATE public.status_logs SET quiz_type = 'output' WHERE quiz_type = 'grammar' OR quiz_type IS NULL;
