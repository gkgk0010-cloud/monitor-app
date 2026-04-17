-- words.youtube_url: DAY별 관련 강의 영상 (단어 관리 사이드바에서 일괄 저장)
-- Supabase SQL Editor에서 실행.

ALTER TABLE public.words ADD COLUMN IF NOT EXISTS youtube_url text;

COMMENT ON COLUMN public.words.youtube_url IS '같은 set_name·day 그룹에 동일 URL을 넣어 DAY별 유튜브 링크로 사용';
