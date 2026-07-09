-- 이자윤8226 계정 복구 (2026-07 월 행 teacher/academy 오염)
-- 원인: User_Profile_2026-07 행만 바베 선생님(688d97d9) 학원으로 덮어씌워짐
--       → 문제풀이앱 visible_menus(바베: quiz/jokbo/grammar_lab off), 단어앱 academy_id 불일치로 세트 잠금

-- 진단 (실행 전 확인)
-- SELECT id, "User ID", teacher_id, academy_id, __sheet_name FROM students WHERE "User ID" = '이자윤8226' ORDER BY __sheet_name;

BEGIN;

UPDATE students
SET
  teacher_id = '9fce1aae-b9d5-4e23-919a-958cde204236',
  academy_id = '152a56af-90ea-4e0f-9078-5c3ded9c0beb'
WHERE "User ID" = '이자윤8226'
  AND __sheet_name = 'User_Profile_2026-07';

-- 검증
-- SELECT id, "User ID", teacher_id, academy_id, __sheet_name FROM students WHERE "User ID" = '이자윤8226' ORDER BY __sheet_name;
-- SELECT ssa.*, ws.name FROM student_set_access ssa JOIN word_sets ws ON ws.id = ssa.set_id WHERE ssa.student_id = '이자윤8226';

COMMIT;
