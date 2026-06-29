'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS } from '@/utils/tokens'
import {
  READING_BREAK_MAGIC,
  disableReadingBreakGuide,
  enableReadingBreakGuide,
  hasReadingBreakMode,
} from '../utils/slotDrillMode'

/**
 * 독해해석 세트 — 끊어읽기 모드 (한 줄 해석 + 박스별 입력)
 * @param {{
 *   setId: string,
 *   teacherId: string,
 *   awkwardGuide?: string | null,
 *   boxSourceSetName?: string | null,
 *   onUpdated?: () => void,
 * }} props
 */
export default function SlotDrillSetPanel({
  setId,
  teacherId,
  awkwardGuide = '',
  boxSourceSetName = '',
  onUpdated,
}) {
  const [enabled, setEnabled] = useState(false)
  const [boxSource, setBoxSource] = useState('')
  const [boxSetOptions, setBoxSetOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setEnabled(hasReadingBreakMode(awkwardGuide))
    setBoxSource(String(boxSourceSetName ?? '').trim())
  }, [awkwardGuide, boxSourceSetName])

  const loadBoxSetNames = useCallback(async () => {
    if (!teacherId) {
      setBoxSetOptions([])
      return
    }
    const { data, error } = await supabase
      .from('sentence_training_items')
      .select('set_name')
      .eq('teacher_id', teacherId)
      .eq('training_kind', 'box_drill')
    if (error || !data?.length) {
      setBoxSetOptions([])
      return
    }
    const names = [...new Set(data.map((r) => String(r.set_name || '').trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, 'ko'),
    )
    setBoxSetOptions(names)
  }, [teacherId])

  useEffect(() => {
    void loadBoxSetNames()
  }, [loadBoxSetNames])

  useEffect(() => {
    setLoading(false)
  }, [setId])

  const persist = async (nextEnabled, nextBoxSource) => {
    if (!setId || !teacherId || busy) return
    setBusy(true)
    try {
      const nextGuide = nextEnabled
        ? enableReadingBreakGuide(awkwardGuide)
        : disableReadingBreakGuide(awkwardGuide)
      const { error } = await supabase
        .from('reading_interpret_sets')
        .update({
          awkward_guide: nextGuide,
          box_source_set_name: nextEnabled ? String(nextBoxSource || '').trim() || null : null,
        })
        .eq('id', setId)
        .eq('teacher_id', teacherId)
      if (error) throw error
      setEnabled(nextEnabled)
      setBoxSource(nextEnabled ? String(nextBoxSource || '').trim() : '')
      onUpdated?.()
    } catch (e) {
      alert('끊어읽기 설정 저장 실패: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const applyToggle = async (next) => {
    await persist(next, boxSource || boxSourceSetName)
  }

  const saveBoxSource = async () => {
    const name = String(boxSource).trim()
    if (!name) {
      alert('박스별 끊어읽기용 출처 세트를 선택하세요.')
      return
    }
    if (!enabled) {
      await persist(true, name)
      return
    }
    await persist(true, name)
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 220px' }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>끊어읽기 모드</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.45 }}>
            ON 시 학생이 독해해석에서 「한 줄 해석」 또는 「끊어읽기(박스별)」를 선택할 수 있습니다.{' '}
            <code style={{ fontSize: 12 }}>{READING_BREAK_MAGIC}</code> 가 세트{' '}
            <code style={{ fontSize: 12 }}>awkward_guide</code>에 저장됩니다.
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

      <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label style={{ fontWeight: 700, fontSize: 13, minWidth: 140 }}>박스별 끊어읽기 출처</label>
        <select
          value={boxSource}
          disabled={busy}
          onChange={(e) => setBoxSource(e.target.value)}
          style={{
            flex: '1 1 200px',
            minWidth: 0,
            padding: '8px 10px',
            borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.border}`,
            fontSize: 14,
          }}
        >
          <option value="">— 박스 만들기 세트 선택 (선택) —</option>
          {boxSetOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveBoxSource()}
          style={{
            padding: '8px 14px',
            borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
            fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          출처 저장
        </button>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.45 }}>
        한 줄 끊어읽기만 쓸 때는 출처 없이 ON 가능합니다. 박스별 입력은 해석{' '}
        <code>sentence_en</code> ↔ 박스 세트 <code>sentence_text</code> 매칭 + 출처 세트가 필요합니다.
      </p>
    </section>
  )
}
