-- 독해해석: attempts는 있는데 grammar_lab_session_completions 없는 케이스 점검·백필
-- Supabase SQL Editor에서 실행

-- ---------------------------------------------------------------------------
-- 1) 전체 점검: 하루 10문항 이상 풀었는데 같은 날 reading_interpret completion 없음
-- ---------------------------------------------------------------------------
SELECT
  a.user_id,
  a.set_id,
  ris.set_name AS base_set_name,
  DATE(a.studied_at AT TIME ZONE 'Asia/Seoul') AS study_date_kst,
  MIN(a.studied_at) AS first_attempt,
  MAX(a.studied_at) AS last_attempt,
  COUNT(*) AS attempt_cnt,
  COUNT(DISTINCT a.session_id) AS session_cnt
FROM reading_interpret_attempts a
LEFT JOIN reading_interpret_sets ris ON ris.id = a.set_id
WHERE a.studied_at >= '2026-06-01'
GROUP BY a.user_id, a.set_id, ris.set_name, DATE(a.studied_at AT TIME ZONE 'Asia/Seoul')
HAVING COUNT(*) >= 10
  AND NOT EXISTS (
    SELECT 1
    FROM grammar_lab_session_completions glsc
    WHERE glsc.user_id = a.user_id
      AND glsc.training_type = 'reading_interpret'
      AND DATE(glsc.created_at AT TIME ZONE 'Asia/Seoul') =
          DATE(MAX(a.studied_at) AT TIME ZONE 'Asia/Seoul')
  )
ORDER BY last_attempt DESC;

-- ---------------------------------------------------------------------------
-- 2) 세션 단위 상세 (백필 후보)
-- ---------------------------------------------------------------------------
WITH session_agg AS (
  SELECT
    a.user_id,
    a.set_id,
    a.session_id,
    ris.set_name AS base_set_name,
    DATE(a.studied_at AT TIME ZONE 'Asia/Seoul') AS study_date_kst,
    MIN(a.studied_at) AS first_attempt,
    MAX(a.studied_at) AS last_attempt,
    COUNT(*)::int AS question_count,
    COUNT(*) FILTER (WHERE a.is_natural)::int AS correct_count,
    MODE() WITHIN GROUP (ORDER BY ri.day) AS dominant_day
  FROM reading_interpret_attempts a
  JOIN reading_interpret_items ri ON ri.id = a.item_id
  LEFT JOIN reading_interpret_sets ris ON ris.id = a.set_id
  WHERE a.studied_at >= '2026-06-01'
  GROUP BY a.user_id, a.set_id, a.session_id, ris.set_name,
           DATE(a.studied_at AT TIME ZONE 'Asia/Seoul')
  HAVING COUNT(*) >= 1
)
SELECT
  s.*,
  CASE
    WHEN s.dominant_day IS NULL THEN s.base_set_name || ' · 기타'
    WHEN s.dominant_day >= 1 THEN s.base_set_name || ' · Day ' || s.dominant_day::text
    ELSE s.base_set_name
  END AS completion_set_name
FROM session_agg s
WHERE NOT EXISTS (
  SELECT 1
  FROM grammar_lab_session_completions glsc
  WHERE glsc.user_id = s.user_id
    AND glsc.training_type = 'reading_interpret'
    AND glsc.session_id = s.session_id
)
ORDER BY s.last_attempt DESC;

-- ---------------------------------------------------------------------------
-- 3) 이자윤8226 · 2026-06-22 Day 3 수동 백필 (누락 1건 보정)
--    실행 전 2) 쿼리로 session_id·집계값 확인 권장
-- ---------------------------------------------------------------------------
INSERT INTO grammar_lab_session_completions (
  user_id,
  set_name,
  training_type,
  session_id,
  question_count,
  correct_count,
  is_full_complete,
  created_at,
  created_at_kst
)
SELECT
  agg.user_id,
  CASE
    WHEN agg.dominant_day IS NULL THEN agg.base_set_name || ' · 기타'
    WHEN agg.dominant_day >= 1 THEN agg.base_set_name || ' · Day ' || agg.dominant_day::text
    ELSE agg.base_set_name
  END AS set_name,
  'reading_interpret',
  agg.session_id,
  agg.question_count,
  agg.correct_count,
  (agg.question_count >= 20) AS is_full_complete,
  agg.last_attempt AS created_at,
  to_char(agg.last_attempt AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS"+09:00"') AS created_at_kst
FROM (
  SELECT
    a.user_id,
    a.set_id,
    a.session_id,
    ris.set_name AS base_set_name,
    MAX(a.studied_at) AS last_attempt,
    COUNT(*)::int AS question_count,
    COUNT(*) FILTER (WHERE a.is_natural)::int AS correct_count,
    MODE() WITHIN GROUP (ORDER BY ri.day) AS dominant_day
  FROM reading_interpret_attempts a
  JOIN reading_interpret_items ri ON ri.id = a.item_id
  LEFT JOIN reading_interpret_sets ris ON ris.id = a.set_id
  WHERE a.user_id ILIKE '%이자윤8226%'
    AND DATE(a.studied_at AT TIME ZONE 'Asia/Seoul') = DATE '2026-06-22'
    AND ri.day = 3
  GROUP BY a.user_id, a.set_id, a.session_id, ris.set_name
  HAVING COUNT(*) >= 10
) agg
WHERE NOT EXISTS (
  SELECT 1
  FROM grammar_lab_session_completions glsc
  WHERE glsc.user_id = agg.user_id
    AND glsc.training_type = 'reading_interpret'
    AND glsc.session_id = agg.session_id
);

-- ---------------------------------------------------------------------------
-- 4) 일괄 백필 (누락 세션 전체 — 운영자 확인 후 실행)
-- ---------------------------------------------------------------------------
-- INSERT INTO grammar_lab_session_completions (...)
-- 위 2) 쿼리 결과를 INSERT ... SELECT 로 변환해 실행
