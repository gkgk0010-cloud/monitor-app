-- AI 상호작용 로그 (자체 모델 학습용 데이터 수집)
-- RLS OFF — service role / edge function / monitor API에서 직접 insert

CREATE TABLE IF NOT EXISTS public.ai_interaction_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  feature text NOT NULL,
  model text,
  input_data jsonb,
  output_data jsonb,
  latency_ms integer,
  token_input integer,
  token_output integer,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_interaction_logs_feature_created
  ON public.ai_interaction_logs (feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_interaction_logs_user_created
  ON public.ai_interaction_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_interaction_logs_created
  ON public.ai_interaction_logs (created_at DESC);

COMMENT ON TABLE public.ai_interaction_logs IS '외부 LLM(Anthropic 등) 호출 입출력 로그 — 자체 AI 학습 데이터용';
