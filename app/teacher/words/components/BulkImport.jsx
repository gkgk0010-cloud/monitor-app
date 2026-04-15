'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { DEFAULT_ACADEMY_ID, DEFAULT_TEACHER_ID } from '@/utils/defaults'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import { parseWordText, normalizeWordDifficulty } from '../utils/parsers'
import WordTable from './WordTable'
import AutoFillPanel from './AutoFillPanel'

const TABS = [
  { id: 'ai', label: 'AI 지문 추출' },
  { id: 'text', label: '단어장 텍스트' },
  { id: 'csv', label: 'CSV / 엑셀' },
]

/**
 * @param {{
 *   open: boolean
 *   onClose: () => void
 *   onSaved: () => void
 *   existingSetNames: string[]
 *   localOnly?: boolean
 *   onLocalImported?: (rows: Array<Record<string, unknown>>) => void
 *   initialSetName?: string
 * }} props
 */
export default function BulkImport({
  open,
  onClose,
  onSaved,
  existingSetNames,
  localOnly = false,
  onLocalImported,
  initialSetName,
}) {
  const [tab, setTab] = useState('ai')
  const [aiPassage, setAiPassage] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [csvText, setCsvText] = useState('')
  const [previewRows, setPreviewRows] = useState([])
  const [setName, setSetName] = useState('')
  const [day, setDay] = useState(1)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [saving, setSaving] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (initialSetName !== undefined) {
      setSetName(String(initialSetName))
    } else {
      setSetName('')
    }
  }, [open, initialSetName])

  const handlePreviewRowDelete = (row) => {
    if (!confirm('이 행을 미리보기에서 제거할까요?')) return
    const id = String(row.id)
    setPreviewRows((prev) => prev.filter((r) => String(r.id) !== id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  if (!open) return null

  const resetPreview = () => {
    setPreviewRows([])
    setSelectedIds(new Set())
  }

  const applyParsed = (parsed) => {
    const rows = parsed.map((p, i) => ({
      id: `import-${Date.now()}-${i}`,
      word: p.word,
      meaning: p.meaning || '',
      example_sentence: p.example_sentence || '',
      set_name: setName,
      day,
      image_url: null,
      image_source: 'none',
    }))
    setPreviewRows(rows)
    setSelectedIds(new Set(rows.map((r) => String(r.id))))
  }

  const handleParseWordText = (raw) => {
    const parsed = parseWordText(raw)
    applyParsed(parsed)
  }

  const handleAiExtract = async () => {
    if (!aiPassage.trim()) return
    setAiBusy(true)
    try {
      const prompt = `다음 영어 지문에서 토익 학습에 유용한 단어를 추출해줘.
응답: JSON 배열만.
형식: [{"word":"...","meaning":"(한글뜻)","example_sentence":"(원문에서 발췌 또는 생성)"}]
지문: ${aiPassage}`

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, system: 'JSON 배열만. 마크다운·코드블록 없음.' }),
      })
      const data = await res.json()
      let text = data.text || '[]'
      text = text.replace(/```json|```/g, '').trim()
      const arr = JSON.parse(text)
      if (!Array.isArray(arr)) throw new Error('형식 오류')
      const parsed = arr.map((item, i) => ({
        id: String(i),
        word: item.word || '',
        meaning: item.meaning || '',
        example_sentence: item.example_sentence || '',
      }))
      applyParsed(parsed.filter((p) => p.word))
    } catch (e) {
      console.warn(e)
      alert('AI 추출에 실패했습니다. 지문을 짧게 나누어 다시 시도해 주세요.')
    } finally {
      setAiBusy(false)
    }
  }

  const handleSave = async () => {
    const valid = previewRows.filter((r) => {
      const w = String(r.word || '').trim()
      const m = String(r.meaning || '').trim()
      return w && m
    })
    if (valid.length === 0) {
      alert('저장할 단어가 없습니다. 영단어·뜻을 모두 입력했는지 확인하세요.')
      return
    }
    const trimmedSet = String(setName).trim()
    if (!trimmedSet && !localOnly) {
      alert('세트 이름을 입력하세요.')
      return
    }
    setSaving(true)
    try {
      const payload = valid.map((r) => ({
        word: String(r.word).trim(),
        meaning: String(r.meaning).trim(),
        example_sentence: String(r.example_sentence || '').trim() || null,
        set_name: String(r.set_name || setName).trim() || trimmedSet,
        day: Math.max(1, parseInt(String(r.day ?? day), 10) || 1),
        difficulty: normalizeWordDifficulty(r.difficulty),
        image_url: r.image_url ? String(r.image_url) : null,
        image_source: r.image_url ? (r.image_source || 'upload') : 'none',
        academy_id: DEFAULT_ACADEMY_ID,
        teacher_id: DEFAULT_TEACHER_ID,
      }))

      if (localOnly && onLocalImported) {
        const stamp = Date.now()
        const mapped = payload.map((p, i) => ({
          id: `import-${stamp}-${i}`,
          word: p.word,
          meaning: p.meaning,
          example_sentence: p.example_sentence,
          set_name: p.set_name,
          day: p.day,
          difficulty: p.difficulty,
          image_url: p.image_url,
          image_source: p.image_source,
        }))
        onLocalImported(mapped)
        onClose()
        resetPreview()
        setAiPassage('')
        setPasteText('')
        setCsvText('')
        return
      }

      const { error } = await supabase.from('words').upsert(payload, {
        onConflict: 'set_name,word',
        defaultToNull: false,
      })
      if (error) throw error
      onSaved()
      onClose()
      resetPreview()
      setAiPassage('')
      setPasteText('')
      setCsvText('')
    } catch (e) {
      console.warn(e)
      alert(`저장 실패: ${e.message || e}`)
    } finally {
      setSaving(false)
    }
  }

  const onAutoFilled = (updated) => {
    setPreviewRows(updated)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflow: 'auto',
      }}
    >
      <div
        style={{
          width: 'min(960px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          background: COLORS.surface,
          borderRadius: RADIUS.xl,
          boxShadow: SHADOW.modal,
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, color: COLORS.accentText }}>단어 가져오기</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.bg,
              cursor: 'pointer',
            }}
          >
            닫기
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 14px',
                borderRadius: RADIUS.md,
                border: tab === t.id ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
                background: tab === t.id ? COLORS.primarySoft : COLORS.surface,
                cursor: 'pointer',
                fontWeight: tab === t.id ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'ai' ? (
          <div>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 }}>
              영어 지문을 붙여넣고 AI로 단어를 추출합니다.
            </p>
            <textarea
              value={aiPassage}
              onChange={(e) => setAiPassage(e.target.value)}
              rows={10}
              style={{
                width: '100%',
                padding: 12,
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                fontSize: 14,
                marginBottom: 12,
              }}
            />
            <button
              type="button"
              disabled={aiBusy || !aiPassage.trim()}
              onClick={() => void handleAiExtract()}
              style={{
                padding: '10px 18px',
                borderRadius: RADIUS.md,
                border: 'none',
                background: COLORS.primary,
                color: COLORS.textOnGreen,
                fontWeight: 600,
                cursor: aiBusy ? 'wait' : 'pointer',
              }}
            >
              {aiBusy ? '추출 중…' : 'AI로 단어 추출'}
            </button>
          </div>
        ) : null}

        {tab === 'text' ? (
          <div>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 }}>
              1. apple 사과 / apple 사과 / apple&emsp;사과&emsp;예문 / 탭·CSV 형식 지원
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={10}
              style={{
                width: '100%',
                padding: 12,
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                fontSize: 14,
                marginBottom: 12,
              }}
            />
            <button
              type="button"
              onClick={() => handleParseWordText(pasteText)}
              style={{
                padding: '10px 18px',
                borderRadius: RADIUS.md,
                border: 'none',
                background: COLORS.primary,
                color: COLORS.textOnGreen,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              파싱하기
            </button>
          </div>
        ) : null}

        {tab === 'csv' ? (
          <div>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 }}>
              엑셀에서 Ctrl+C 후 붙여넣기. 컬럼 순서: 단어, 뜻, 예문
            </p>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={10}
              style={{
                width: '100%',
                padding: 12,
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                fontFamily: 'ui-monospace, monospace',
                fontSize: 13,
                marginBottom: 12,
              }}
            />
            <button
              type="button"
              onClick={() => handleParseWordText(csvText)}
              style={{
                padding: '10px 18px',
                borderRadius: RADIUS.md,
                border: 'none',
                background: COLORS.primary,
                color: COLORS.textOnGreen,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              파싱하기
            </button>
          </div>
        ) : null}

        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: `1px solid ${COLORS.border}`,
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: COLORS.textSecondary }}>set_name</span>
              <input
                list="bulk-set-names"
                value={setName}
                onChange={(e) => setSetName(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: RADIUS.sm,
                  border: `1px solid ${COLORS.border}`,
                  minWidth: 180,
                }}
              />
              <datalist id="bulk-set-names">
                {existingSetNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: COLORS.textSecondary }}>day</span>
              <input
                type="number"
                min={1}
                value={day}
                onChange={(e) => setDay(parseInt(e.target.value, 10) || 1)}
                style={{
                  width: 72,
                  padding: '8px 10px',
                  borderRadius: RADIUS.sm,
                  border: `1px solid ${COLORS.border}`,
                }}
              />
            </label>
          </div>

          {previewRows.length > 0 ? (
            <>
              <h3 style={{ fontSize: 16, color: COLORS.accentText }}>미리보기</h3>
              <WordTable
                rows={previewRows}
                onRowsChange={setPreviewRows}
                selectedIds={selectedIds}
                onSelectedIdsChange={setSelectedIds}
                showDeleteColumn
                onRowDelete={handlePreviewRowDelete}
              />
              <AutoFillPanel
                rows={selectedIds.size > 0 ? previewRows.filter((r) => selectedIds.has(String(r.id))) : previewRows}
                onFilled={(updated) => {
                  const map = new Map(updated.map((r) => [String(r.id), r]))
                  setPreviewRows((prev) => prev.map((r) => map.get(String(r.id)) || r))
                }}
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                style={{
                  padding: '12px 20px',
                  borderRadius: RADIUS.md,
                  border: 'none',
                  background: COLORS.primaryDark,
                  color: COLORS.textOnGreen,
                  fontWeight: 700,
                  cursor: saving ? 'wait' : 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                {saving
                  ? '저장 중…'
                  : localOnly
                    ? `${previewRows.filter((r) => String(r.word).trim() && String(r.meaning).trim()).length}개 테이블에 추가`
                    : `${previewRows.filter((r) => String(r.word).trim() && String(r.meaning).trim()).length}개 저장`}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
