-- 2번 사진(DB) 정리용: Supabase SQL Editor에서 실행
-- 1) info_text placeholder 제거  2) 컬럼 기본값 제거

-- 1. info_text 기본값 제거 (예시 문구가 새 행에 안 들어가게)
ALTER TABLE public.student_status
  ALTER COLUMN info_text DROP DEFAULT;

-- 2. 이미 "상태 설명" 같은 placeholder가 들어간 행만 비우기 (모니터 앱에서 색상별 멘트로 표시됨)
UPDATE public.student_status
SET info_text = ''
WHERE info_text IS NOT NULL
  AND (
    info_text LIKE '%상태%설명%'
    OR info_text LIKE '%예:%'
  );
