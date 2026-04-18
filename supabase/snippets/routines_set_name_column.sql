-- 세트별 루틴 구분 (monitor 루틴 생성 시 set_name 저장)
ALTER TABLE public.routines
  ADD COLUMN IF NOT EXISTS set_name text;

COMMENT ON COLUMN public.routines.set_name IS 'words.set_name 과 동일 — 세트별 루틴 구분';
