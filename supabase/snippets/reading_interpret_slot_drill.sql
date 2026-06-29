-- 끊어읽기(slot_drill) — monitor-app snippets (tokpass-app/migrations/reading_interpret_slot_drill.sql 동일)

ALTER TABLE public.reading_interpret_sets
  ADD COLUMN IF NOT EXISTS box_source_set_name text;

COMMENT ON COLUMN public.reading_interpret_sets.box_source_set_name IS
  '끊어읽기(박스별) 모드 시 박스(box_drill_answers) 출처 세트명. sentence_en ↔ sentence_text 매칭';

COMMENT ON COLUMN public.reading_interpret_sets.awkward_guide IS
  'AI 어색 패턴 가이드 (세트 공통). [끊어읽기모드] 포함 시 끊어읽기 학습(한 줄·박스별)';

UPDATE public.reading_interpret_sets
SET awkward_guide = NULLIF(
  TRIM(
    CASE
      WHEN awkward_guide LIKE '%[끊어읽기모드]%' THEN REPLACE(awkward_guide, '[칸나누기모드]', '')
      ELSE REPLACE(awkward_guide, '[칸나누기모드]', '[끊어읽기모드]')
    END
  ),
  ''
)
WHERE awkward_guide LIKE '%[칸나누기모드]%';
