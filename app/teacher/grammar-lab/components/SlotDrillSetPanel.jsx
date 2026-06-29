'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS } from '@/utils/tokens'
import {
  SLOT_DRILL_MAGIC,
  disableSlotDrillGuide,
  enableSlotDrillGuide,
  hasSlotDrillMode,
} from '../utils/slotDrillMode'

/**
 * @param {{ setName: string, teacherId: string, trainingKind: string }} props
 */
export default function SlotDrillSetPanel({ setName, teacherId, trainingKind }) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const loadFlag = useCallback(async () => {
    if (!teacherId || !setName || trainingKind !== 'box_drill') {
      setEnabled(false)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('sentence_training_items')
      .select('id, awkward_guide')
      .eq('teacher_id', teacherId)
      .eq('set_name', setName)
      .eq('training_kind', 'box_drill')
      .limit(20)
    if (error || !data?.length) {
      setEnabled(false)
      setLoading(false)
      return
    }
    setEnabled(data.every((r) => hasSlotDrillMode(r.awkward_guide)))
    setLoading(false)
  }, [teacherId, setName, trainingKind])

  useEffect(() => {
    void loadFlag()
  }, [loadFlag])

  if (trainingKind !== 'box_drill') return null

  const applyToggle = async (next) => {
    if (!teacherId || busy) return
    setBusy(true)
    try {
      const { data: items, error } = await supabase
        .from('sentence_training_items')
        .select('id, awkward_guide')
        .eq('teacher_id', teacherId)
        .eq('set_name', setName)
        .eq('training_kind', 'box_drill')
      if (error) throw error
      if (!items?.length) {
        alert('적용할 문항이 없습니다.')
        return
      }
      for (const row of items) {
        const awkward_guide = next
          ? enableSlotDrillGuide(row.awkward_guide)
          : disableSlotDrillGuide(row.awkward_guide)
        const { error: upErr } = await supabase
          .from('sentence_training_items')
          .update({ awkward_guide })
          .eq('id', row.id)
          .eq('teacher_id', teacherId)
        if (upErr) throw upErr
      }
      setEnabled(next)
    } catch (e) {
      alert('칸 나누기 모드 저장 실패: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      style={{
        marginBottom: 16,
        padding: 16,
        borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <div style={{ flex: '1 1 200px' }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>칸 나누기 모드</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.45 }}>
            ON 시 학생이 「칸 나누기」를 선택할 수 있습니다.{' '}
            <code style={{ fontSize: 12 }}>{SLOT_DRILL_MAGIC}</code> 매직스트링이 각 문항에
            저장됩니다.
          </p>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: loading || busy ? 'wait' : 'pointer',
            opacity: loading || busy ? 0.6 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            disabled={loading || busy}
            onChange={(e) => void applyToggle(e.target.checked)}
          />
          <span style={{ fontWeight: 700 }}>{enabled ? '활성화됨' : '비활성'}</span>
        </label>
      </div>
    </section>
  )
}
