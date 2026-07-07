import { getSupabaseAdmin } from './supabaseAdmin'

/**
 * AI 호출 로그 저장 — await insert (Vercel/Edge 종료 전 완료 보장)
 */
export async function logAiInteraction(opts) {
  const feature = String(opts?.feature || '').trim()
  if (!feature) return

  const admin = getSupabaseAdmin()
  if (!admin) {
    console.warn('[logAiInteraction] SUPABASE_SERVICE_ROLE_KEY missing — skip log for', feature)
    return
  }

  const row = {
    user_id: opts.user_id != null && String(opts.user_id).trim() ? String(opts.user_id).trim() : null,
    feature,
    model: opts.model != null ? String(opts.model) : null,
    input_data: opts.input ?? null,
    output_data: opts.output ?? null,
    latency_ms:
      opts.latency != null && Number.isFinite(Number(opts.latency))
        ? Math.round(Number(opts.latency))
        : null,
    token_input:
      opts.token_input != null && Number.isFinite(Number(opts.token_input))
        ? Math.round(Number(opts.token_input))
        : null,
    token_output:
      opts.token_output != null && Number.isFinite(Number(opts.token_output))
        ? Math.round(Number(opts.token_output))
        : null,
    success: !!opts.success,
    error_message: opts.error ? String(opts.error).slice(0, 2000) : null,
  }

  try {
    const { error } = await admin.from('ai_interaction_logs').insert(row)
    if (error) {
      console.warn('[logAiInteraction] insert failed:', error.message, error.details || '', error.hint || '')
    }
  } catch (e) {
    console.warn('[logAiInteraction] insert exception:', e instanceof Error ? e.message : e)
  }
}
