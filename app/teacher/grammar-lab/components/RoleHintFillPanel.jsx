'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import { ROLE_HINT_SUGGESTIONS } from '../utils/slotDrillMode'

/**
 * @param {{ setName: string, teacherId: string, trainingKind: string, itemIds: string[] }} props
 */
export default function RoleHintFillPanel({
  setName,
  teacherId,
  trainingKind,
  itemIds = [],
}) {
  const safeItemIds = Array.isArray(itemIds) ? itemIds : []
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState('')
  const [missingCount, setMissingCount] = useState(null)

  const canUse = trainingKind === 'box_drill' && safeItemIds.length > 0

  const loadMissing = async () => {
    if (!canUse) return 0
    const { data, error } = await supabase
      .from('box_drill_answers')
      .select('id, role_hint')
      .in('item_id', safeItemIds)
    if (error) return null
    const n = (data || []).filter((r) => !String(r.role_hint ?? '').trim()).length
    setMissingCount(n)
    return n
  }

  useEffect(() => {
    void loadMissing()
  }, [setName, safeItemIds.join('|'), canUse])

  const runFill = async () => {
    if (!canUse || busy) return
    setBusy(true)
    setLog('불러오는 중…')
    try {
      const { data: items, error: itemErr } = await supabase
        .from('sentence_training_items')
        .select('id, sentence_text')
        .eq('teacher_id', teacherId)
        .eq('set_name', setName)
        .eq('training_kind', 'box_drill')
        .in('id', safeItemIds)
      if (itemErr) throw itemErr

      const { data: boxes, error: boxErr } = await supabase
        .from('box_drill_answers')
        .select('id, item_id, box_index, start_char, end_char, role_hint')
        .in('item_id', safeItemIds)
        .order('box_index')
      if (boxErr) throw boxErr

      const byItem = new Map()
      for (const it of items || []) {
        byItem.set(it.id, { item_id: it.id, sentence_text: it.sentence_text, boxes: [] })
      }
      for (const b of boxes || []) {
        const row = byItem.get(b.item_id)
        if (!row) continue
        const text = String(row.sentence_text || '').slice(b.start_char, b.end_char)
        row.boxes.push({
          box_index: b.box_index,
          english: text,
          role_hint: b.role_hint,
          answer_id: b.id,
        })
      }
      const payload = [...byItem.values()].filter((x) => x.boxes.length)
      if (!payload.length) {
        alert('박스가 등록된 문항이 없습니다.')
        return
      }

      setLog('AI 역할 라벨 생성 중…')
      const res = await fetch('/api/grammar-lab/fill-role-hints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'AI 채우기 실패')

      let updated = 0
      for (const f of json.filled || []) {
        const parent = byItem.get(f.item_id)
        const box = parent?.boxes?.find((x) => Number(x.box_index) === Number(f.box_index))
        if (!box?.answer_id || !f.role_hint) continue
        const { error: upErr } = await supabase
          .from('box_drill_answers')
          .update({ role_hint: f.role_hint })
          .eq('id', box.answer_id)
        if (!upErr) updated += 1
      }
      setLog(`완료 · ${updated}개 박스 role_hint 저장`)
      await loadMissing()
    } catch (e) {
      setLog(String(e?.message || e))
      alert('박스 역할 자동 채우기 실패: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  if (!canUse) return null

  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: RADIUS.lg,
        border: `1px solid ${missingCount > 0 ? '#fecaca' : COLORS.border}`,
        background: missingCount > 0 ? 'rgba(254,226,226,0.25)' : COLORS.warningBg,
        boxShadow: SHADOW.card,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 700 }}>박스 역할 (role_hint)</span>
        {missingCount != null && missingCount > 0 ? (
          <span
            style={{
              padding: '4px 10px',
              borderRadius: RADIUS.sm,
              background: '#ef4444',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            미입력 {missingCount}개
          </span>
        ) : missingCount === 0 ? (
          <span style={{ fontSize: 13, color: COLORS.textSecondary }}>모두 입력됨</span>
        ) : null}
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: COLORS.textSecondary }}>
        허용 라벨 예: {ROLE_HINT_SUGGESTIONS.slice(0, 8).join(', ')}… · 박스 편집 모달에서 수정 가능
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void runFill()}
        style={{
          padding: '10px 18px',
          borderRadius: RADIUS.md,
          border: 'none',
          background: COLORS.primary,
          color: COLORS.textOnGreen,
          fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? '처리 중…' : '✨ 박스 역할 자동 채우기'}
      </button>
      {log ? <p style={{ marginTop: 10, fontSize: 13, color: COLORS.textSecondary }}>{log}</p> : null}
    </div>
  )
}
