-- word_sets.set_type 에 'kids' 추가
-- Supabase SQL Editor 에서 실행

alter table public.word_sets drop constraint if exists word_sets_set_type_check;

alter table public.word_sets
  add constraint word_sets_set_type_check
  check (set_type in ('word', 'sentence_writing', 'sentence_speaking', 'kids'));
