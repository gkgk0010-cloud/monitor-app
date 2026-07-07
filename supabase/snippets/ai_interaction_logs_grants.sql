-- ai_interaction_logs — service_role insert 권한 (PostgREST)
GRANT ALL ON TABLE public.ai_interaction_logs TO service_role;
GRANT ALL ON TABLE public.ai_interaction_logs TO postgres;

NOTIFY pgrst, 'reload schema';
