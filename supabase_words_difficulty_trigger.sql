-- words.difficulty 가 NOT NULL 인데 클라이언트가 null 을 보낼 때 대비 (캐시된 옛 번들 등)
-- Supabase → SQL Editor 에서 한 번 실행

CREATE OR REPLACE FUNCTION public.words_coerce_difficulty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.difficulty IS NULL THEN
    NEW.difficulty := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_words_coerce_difficulty ON public.words;

CREATE TRIGGER trg_words_coerce_difficulty
  BEFORE INSERT OR UPDATE ON public.words
  FOR EACH ROW
  EXECUTE PROCEDURE public.words_coerce_difficulty();

-- (선택) 컬럼 생략 시에도 0 이 들어가게 하려면:
-- ALTER TABLE public.words ALTER COLUMN difficulty SET DEFAULT 0;
