-- 기존 이미지 세트 → 단어 세트, 구 문장 세트 → 문장(라이팅)
-- monitor-app 세트 타입: word | sentence_writing | sentence_speaking

alter table public.word_sets drop constraint if exists word_sets_set_type_check;

update public.word_sets
set set_type = 'word'
where set_type = 'image';

update public.word_sets
set set_type = 'sentence_writing'
where set_type = 'sentence';

alter table public.word_sets
  add constraint word_sets_set_type_check
  check (set_type in ('word', 'sentence_writing', 'sentence_speaking'));
