-- 독해해석 세트 자체 박스 정보 (B 방식) — [ ] 파싱 결과 저장
-- A 방식(box_source_set_name → box_drill)은 그대로 유지. B 우선, A 폴백.

ALTER TABLE public.reading_interpret_items
  ADD COLUMN IF NOT EXISTS boxed_sentence text;

COMMENT ON COLUMN public.reading_interpret_items.boxed_sentence IS
  '엑셀/편집 원문([ ] 포함). sentence_en은 [ ] 제거 평문.';

CREATE TABLE IF NOT EXISTS public.reading_interpret_boxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.reading_interpret_items (id) ON DELETE CASCADE,
  box_index integer NOT NULL,
  start_char integer NOT NULL,
  end_char integer NOT NULL,
  chunk_label text,
  role_hint text,
  UNIQUE (item_id, box_index)
);

CREATE INDEX IF NOT EXISTS reading_interpret_boxes_item_id_idx
  ON public.reading_interpret_boxes (item_id);

ALTER TABLE public.reading_interpret_boxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reading_interpret_boxes_select" ON public.reading_interpret_boxes;
DROP POLICY IF EXISTS "reading_interpret_boxes_insert" ON public.reading_interpret_boxes;
DROP POLICY IF EXISTS "reading_interpret_boxes_update" ON public.reading_interpret_boxes;
DROP POLICY IF EXISTS "reading_interpret_boxes_delete" ON public.reading_interpret_boxes;

CREATE POLICY "reading_interpret_boxes_select"
  ON public.reading_interpret_boxes FOR SELECT
  USING (true);

CREATE POLICY "reading_interpret_boxes_insert"
  ON public.reading_interpret_boxes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "reading_interpret_boxes_update"
  ON public.reading_interpret_boxes FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "reading_interpret_boxes_delete"
  ON public.reading_interpret_boxes FOR DELETE
  USING (true);
