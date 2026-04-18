-- routine_tasks: 학습 모드 태스크(flashcard 등)의 필수 여부 (vocab_new / vocab_review 는 NULL)
ALTER TABLE routine_tasks ADD COLUMN IF NOT EXISTS is_required boolean;

COMMENT ON COLUMN routine_tasks.is_required IS '세트에서 필수로 지정된 학습 모드 태스크면 true, 선택 추가면 false';
