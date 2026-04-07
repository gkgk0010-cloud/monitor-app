-- 집중관리존 CCTV: 문제 풀 때마다 정답=파란불, 오답=빨간불 실시간 반영용
-- Supabase SQL Editor에서 한 번 실행

ALTER TABLE public.student_status
  ADD COLUMN IF NOT EXISTS last_answer_result text;  -- 'correct' | 'incorrect' | null

ALTER TABLE public.student_status
  ADD COLUMN IF NOT EXISTS last_answer_at timestamptz;

ALTER TABLE public.student_status
  ADD COLUMN IF NOT EXISTS last_answer_tag text;  -- 방금 푼 문제 태그 (예: 가정법, 관계사)

-- 기존 RLS/upsert 정책은 그대로 사용 (student_id 기준 upsert 시 이 컬럼도 갱신 가능)
