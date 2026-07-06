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
import { copyBoxDrillSetToInterpretSet, formatCopyFromBoxResult } from '../utils/readingInterpretBoxImport'
import { countMissingBoxRoleHints, fillBoxDrillRoleHintsForSet } from '../utils/fillBoxDrillRoleHints'
import { progressPercent } from '../utils/grammarLabBatchSave'
import { ROLE_HINT_SUGGESTIONS } from '../utils/slotDrillMode'

/**
 * 독해해석 세트 — 끊어읽기 모드 (한 줄 해석 + 박스별 입력)
 * @param {{
 *   setId: string,
 *   teacherId: string,
 *   awkwardGuide?: string | null,
 *   boxSourceSetName?: string | null,
 *   selfBoxItemCount?: number,
 *   onUpdated?: () => void,
 *   onItemsCopied?: () => void,
 *   onCopyProgress?: (p: { stage: string, current: number, total: number } | null) => void,
 *   onRoleHintProgress?: (p: { stage: string, current: number, total: number } | null) => void,
 * }} props
 */
export default function SlotDrillSetPanel({
  setId,
  teacherId,
  awkwardGuide = '',
  boxSourceSetName = '',
  selfBoxItemCount = 0,
  onUpdated,
  onItemsCopied,
  onCopyProgress,
  onRoleHintProgress,
}) {
  const [enabled, setEnabled] = useState(false)
  const [boxSource, setBoxSource] = useState('')
  const [boxSetOptions, setBoxSetOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [roleHintMissing, setRoleHintMissing] = useState(null)
  const [roleHintLog, setRoleHintLog] = useState('')
  const [roleHintProgress, setRoleHintProgress] = useState(null)

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

  const refreshRoleHintMissing = useCallback(async () => {
    const name = String(boxSource).trim()
    if (!teacherId || !name) {
      setRoleHintMissing(null)
      return
    }
    try {
      const { data: items } = await supabase
        .from('sentence_training_items')
        .select('id')
        .eq('teacher_id', teacherId)
        .eq('set_name', name)
        .eq('training_kind', 'box_drill')
      const ids = (items || []).map((r) => r.id).filter(Boolean)
      if (!ids.length) {
        setRoleHintMissing({ total: 0, missing: 0 })
        return
      }
      const stats = await countMissingBoxRoleHints(supabase, ids)
      setRoleHintMissing(stats)
    } catch {
      setRoleHintMissing(null)
    }
  }, [teacherId, boxSource])

  useEffect(() => {
    void refreshRoleHintMissing()
  }, [refreshRoleHintMissing, boxSourceSetName])

  const fillRoleHintsFromSource = async () => {
    const name = String(boxSource).trim()
    if (!name) {
      alert('먼저 박스별 끊어읽기 출처 세트를 선택하세요.')
      return
    }
    if (
      !confirm(
        `출처 「${name}」 세트의 박스마다 AI가 역할(시점·목적·주절 등)을 채웁니다.\n` +
          '학생 끊어읽기(박스별) 화면에 [역할]로 표시됩니다. 계속할까요?',
      )
    ) {
      return
    }
    setBusy(true)
    setRoleHintLog('')
    setRoleHintProgress(null)
    try {
      if (!enabled || String(boxSourceSetName ?? '').trim() !== name) {
        await persistSettings(true, name)
      }
      const result = await fillBoxDrillRoleHintsForSet(supabase, {
        teacherId,
        boxSourceSetName: name,
        onProgress: (p) => {
          setRoleHintProgress(p)
          onRoleHintProgress?.(p)
          if (p?.total) {
            const pct = progressPercent(p.current, p.total)
            setRoleHintLog(`${p.stage} · ${p.current}/${p.total} (${pct}%)`)
          } else if (!p) {
            setRoleHintLog('')
          }
        },
      })
      if (!result.ok) {
        if (result.error === 'no-boxes') {
          alert('출처 세트에 박스 정답이 없습니다. 문장분석 세트에서 박스를 먼저 등록하세요.')
          return
        }
        if (result.error === 'no-items') {
          alert('출처 세트에 문항이 없습니다.')
          return
        }
        return
      }
      if (result.skipped) {
        setRoleHintLog('이미 모든 박스에 역할 라벨이 있습니다.')
        return
      }
      const extra =
        result.failedChunks > 0
          ? ` · ${result.failedChunks}묶음 실패(저장 ${result.updated}개 유지 · 다시 누르면 남은 칸만 채움)`
          : ''
      setRoleHintLog(`완료 · ${result.updated}개 박스 role_hint 저장${extra}`)
    } catch (e) {
      setRoleHintLog('')
      alert('박스 역할 자동 채우기 실패: ' + (e?.message || e))
    } finally {
      setRoleHintProgress(null)
      onRoleHintProgress?.(null)
      setBusy(false)
      void refreshRoleHintMissing()
    }
  }

  const persistSettings = async (nextEnabled, nextBoxSource) => {
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
  }

  const persist = async (nextEnabled, nextBoxSource) => {
    if (!setId || !teacherId || busy) return
    setBusy(true)
    try {
      await persistSettings(nextEnabled, nextBoxSource)
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

  const copyFromBoxSource = async () => {
    const name = String(boxSource).trim()
    if (!name) {
      alert('먼저 문장분석(박스 만들기) 세트를 선택하세요.')
      return
    }
    if (
      !confirm(
        `「${name}」 세트의 영문·의역(힌트)을 이 독해해석 세트로 복사합니다.\n` +
          '이미 같은 영문 문장은 건너뜁니다. 계속할까요?',
      )
    ) {
      return
    }
    setBusy(true)
    onCopyProgress?.({ stage: '문항 복사', current: 0, total: 1 })
    try {
      if (!enabled || String(boxSourceSetName ?? '').trim() !== name) {
        await persistSettings(true, name)
      }
      const result = await copyBoxDrillSetToInterpretSet(supabase, {
        teacherId,
        interpretSetId: setId,
        boxSourceSetName: name,
        onProgress: onCopyProgress,
      })
      alert(formatCopyFromBoxResult(result))
      if (result.inserted > 0) {
        onItemsCopied?.()
      }
    } catch (e) {
      alert('복사 실패: ' + (e?.message || e))
      onCopyProgress?.(null)
    } finally {
      setBusy(false)
      onCopyProgress?.(null)
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

      {selfBoxItemCount > 0 ? (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: RADIUS.md,
            border: '1px solid #86efac',
            background: '#f0fdf4',
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: '#166534' }}>✅ 박스 정보 자동 파싱됨</strong>
          <span style={{ color: COLORS.textSecondary }}>
            {' '}
            — {selfBoxItemCount}개 문항에 엑셀 <code>[ ]</code> 박스가 저장되어 있습니다. 별도 박스 만들기
            세트 없이 끊어읽기(박스별) 가능합니다.
          </span>
        </div>
      ) : null}

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
        <button
          type="button"
          disabled={busy || !boxSource.trim()}
          onClick={() => void copyFromBoxSource()}
          style={{
            padding: '8px 14px',
            borderRadius: RADIUS.md,
            border: 'none',
            background: COLORS.primary,
            color: COLORS.textOnGreen,
            fontWeight: 700,
            cursor: busy || !boxSource.trim() ? 'not-allowed' : 'pointer',
            opacity: busy || !boxSource.trim() ? 0.55 : 1,
          }}
        >
          출처 → 해석 문항 복사
        </button>
      </div>

      {boxSource.trim() ? (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: RADIUS.md,
            border: `1px solid ${roleHintMissing?.missing ? '#c4b5fd' : COLORS.border}`,
            background: roleHintMissing?.missing ? '#f5f3ff' : '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>끊어읽기(박스별) 역할 라벨</span>
            {roleHintMissing != null && roleHintMissing.total > 0 ? (
              roleHintMissing.missing > 0 ? (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 999,
                    background: '#7c3aed',
                    color: '#fff',
                  }}
                >
                  미입력 {roleHintMissing.missing} / {roleHintMissing.total}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: COLORS.textSecondary }}>역할 라벨 모두 입력됨</span>
              )
            ) : null}
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.45 }}>
            출처 세트 박스마다 AI가 <strong>시점·목적·주절</strong> 등을 붙입니다. 학생이 끊어읽기(박스별)를
            풀 때 <code>[시점]</code>처럼 표시됩니다. (허용 예: {ROLE_HINT_SUGGESTIONS.slice(0, 6).join(', ')}…)
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void fillRoleHintsFromSource()}
            style={{
              padding: '8px 14px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: '#7c3aed',
              color: '#fff',
              fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy
              ? roleHintProgress?.total
                ? `${progressPercent(roleHintProgress.current, roleHintProgress.total)}% 처리 중…`
                : '처리 중…'
              : '✨ 출처 박스 역할 AI 자동 채우기'}
          </button>
          {roleHintLog ? (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: COLORS.textSecondary }}>{roleHintLog}</p>
          ) : null}
        </div>
      ) : null}

      <p style={{ margin: '10px 0 0', fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.45 }}>
        <strong>엑셀 [ ] 박스 (B 방식)</strong>: A열 영문에 <code>[단어]</code> 형태로 넣으면 업로드 시 자동 파싱됩니다.
        자체 박스 위치를 쓰고, 출처 세트가 연결되어 있으면 같은 문장의 박스 역할(role_hint)은 출처에서 표시됩니다.
        <br />
        <strong>출처 → 해석 문항 복사 (A 방식)</strong>: 문장분석 세트의 영문·의역(힌트)을 아래 표에 한 번에
        등록합니다. 끊어읽기 출처도 함께 저장됩니다.
        <br />
        한 줄 끊어읽기만 쓸 때는 출처 없이 ON 가능합니다. 박스별 입력은 자체 [ ] 박스 또는 출처 세트가
        필요합니다.
      </p>
    </section>
  )
}
