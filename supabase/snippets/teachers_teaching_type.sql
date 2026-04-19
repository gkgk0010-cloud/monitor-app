-- teachers.teaching_type: 토익 강사 vs 일반 어학원 (회원가입 시 저장)
-- Supabase SQL Editor에서 실행

ALTER TABLE public.teachers
ADD COLUMN IF NOT EXISTS teaching_type TEXT DEFAULT 'general'
CHECK (teaching_type IN ('toeic', 'general'));

COMMENT ON COLUMN public.teachers.teaching_type IS 'toeic: 토익 전용 메뉴 기본 ON, general: 단어 학습 중심';
