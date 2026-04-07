-- status_logs에 student_id 컬럼 추가 (기존 테이블에 컬럼 없을 때 한 번만 실행)
-- Supabase 대시보드 → SQL Editor에서 실행

ALTER TABLE public.status_logs
  ADD COLUMN IF NOT EXISTS student_id text;

COMMENT ON COLUMN public.status_logs.student_id IS '학생 식별자(uid). 비어 있으면 예전에 앱이 안 넣었던 로그.';

-- 기존 인덱스가 있으면 student_id로 로그 찾기 가능 (선택)
-- CREATE INDEX IF NOT EXISTS idx_status_logs_student_id ON public.status_logs (student_id) WHERE student_id IS NOT NULL;
