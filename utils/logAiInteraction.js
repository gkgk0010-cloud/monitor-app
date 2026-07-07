import { getSupabaseAdmin } from './supabaseAdmin'

/**
 * AI 호출 로그 저장 (fire-and-forget — 실패해도 본 기능에 영향 없음)
 * @param {{
 *   user_id?: string | null,
 *   feature: string,
 *   model?: string | null,
 *   input?: unknown,
 *   output?: unknown,
 *   latency?: number,
 *   token_input?: number | null,
 *   token_output?: number | null,
 *   success?: boolean,
 *   error?: string | null,
 * }} opts
 */
export function logAiInteraction(opts) {
  const feature = String(opts?.feature || '').trim()
  if (!feature) return

  const admin = getSupabaseAdmin()
  if (!admin) return

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

  void admin
    .from('ai_interaction_logs')
    .insert(row)
    .then(({ error }) => {
      if (error) console.warn('[logAiInteraction]', error.message)
    })
}
