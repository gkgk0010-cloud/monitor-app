-- 실시간 사건 기록이 "연결 끊김"일 때: status_logs를 Realtime 구독 대상에 넣기
-- Supabase 대시보드 → SQL Editor → 아래 한 줄 실행

ALTER PUBLICATION supabase_realtime ADD TABLE public.status_logs;
