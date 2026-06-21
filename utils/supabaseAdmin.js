import { createClient } from '@supabase/supabase-js';

/** 서버 전용 — SUPABASE_SERVICE_ROLE_KEY (Vercel·.env.local). 클라이언트 번들에 넣지 말 것. */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
