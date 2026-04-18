-- 루틴 복습 방식 (예: ["test","reading","shadowing","writing"])
ALTER TABLE public.routines
  ADD COLUMN IF NOT EXISTS review_modes jsonb NOT NULL DEFAULT '["test"]'::jsonb;

COMMENT ON COLUMN public.routines.review_modes IS '복습에 사용할 학습 모드 키 배열 (test, reading, shadowing, writing 등)';
