/** Anthropic Messages API model (retired claude-sonnet-4-20250514 → claude-sonnet-4-6) */
export const ANTHROPIC_SONNET_MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6'

/** 빠른 채점용 (끊어읽기·독해해석 판정) */
export const ANTHROPIC_HAIKU_MODEL =
  process.env.ANTHROPIC_HAIKU_MODEL?.trim() || 'claude-haiku-4-5'
