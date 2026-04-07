-- STEP 0: Supabase SQL Editor에서 실행
-- image_url 컬럼 추가
ALTER TABLE words
  ADD COLUMN IF NOT EXISTS image_url    TEXT,
  ADD COLUMN IF NOT EXISTS image_source TEXT DEFAULT 'none';
-- image_source 값: 'unsplash' | 'upload' | 'none'

-- 이미지 없는 단어 빠른 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_words_no_image
  ON words(id) WHERE image_url IS NULL;

CREATE INDEX IF NOT EXISTS idx_words_no_example
  ON words(id) WHERE example_sentence IS NULL;

-- Supabase Storage 버킷은 대시보드에서 수동 생성
-- 버킷명: word-images / Public read: ON / 파일크기: 5MB
