-- words: 모니터에서 단어 추가·수정 시 RLS 오류 해결 (INSERT / UPDATE)
-- Supabase → SQL Editor에서 실행
--
-- anon 키는 공개되므로, 가능하면 URL 제한·나중에 Service Role 전환 권장.

DROP POLICY IF EXISTS "words_anon_insert" ON public.words;
DROP POLICY IF EXISTS "words_anon_update" ON public.words;

CREATE POLICY "words_anon_insert"
  ON public.words
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "words_anon_update"
  ON public.words
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
