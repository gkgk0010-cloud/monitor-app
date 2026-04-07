-- words.difficulty: NOT NULL + words_difficulty_check(보통 1~5) — 0 은 CHECK 위반
-- 이미 실행한 경우: 함수만 다시 CREATE OR REPLACE 하면 됨
-- Supabase → SQL Editor 에서 실행

CREATE OR REPLACE FUNCTION public.words_coerce_difficulty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.difficulty IS NULL OR NEW.difficulty = 0 THEN
    NEW.difficulty := 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_words_coerce_difficulty ON public.words;

CREATE TRIGGER trg_words_coerce_difficulty
  BEFORE INSERT OR UPDATE ON public.words
  FOR EACH ROW
  EXECUTE PROCEDURE public.words_coerce_difficulty();

-- (선택) 컬럼 생략 시 기본값
-- ALTER TABLE public.words ALTER COLUMN difficulty SET DEFAULT 1;
