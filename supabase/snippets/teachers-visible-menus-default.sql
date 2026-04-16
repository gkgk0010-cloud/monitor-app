-- 새 선생님 행 INSERT 시 visible_menus 기본값 (단어 학습만 켜짐, 토익 전용 메뉴는 끔)
-- Supabase SQL Editor에서 실행

ALTER TABLE public.teachers
  ALTER COLUMN visible_menus
  SET DEFAULT '{"quiz": false, "result": false, "homework": false, "absence": false, "vocab": true, "jokbo": false}'::jsonb;
