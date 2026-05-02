'use client'

import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import { parseWordText, normalizeWordDifficulty } from '../utils/parsers'
import {
  meaningIsMissing,
  wordLabelForMeaningAlert,
  formatEmptyMeaningAlert,
  formatSupabaseWordsSaveError,
} from '../utils/wordMeaningGuard'
import WordTable from './WordTable'
import AutoFillPanel from './AutoFillPanel'

const TABS = [
  { id: 'ai', label: 'AI 지문 추출' },
  { id: 'text', label: '단어장 텍스트' },
  { id: 'csv', label: 'CSV / 엑셀' },
]

const EXCEL_FILE_NAMES = {
  word: 'tokpass_단어양식.xlsx',
  sentence: 'tokpass_문장양식.xlsx',
}

/**
 * @param {'word' | 'sentence'} t
 * @param {{ excelDayColumn?: boolean } | undefined} opts
 */
function isPreviewRowValidForSetType(r, t, opts) {
  const w = String(r.word || '').trim()
  const ex = String(r.example_sentence || '').trim()
  if (t === 'sentence') {
    if (!ex || meaningIsMissing(r.meaning)) return false
    if (opts?.excelDayColumn) {
      const dn = Math.max(0, parseInt(String(r.day ?? 0), 10) || 0)
      if (dn < 1) return false
    }
    return true
  }
  if (!w || meaningIsMissing(r.meaning)) return false
  return true
}

function normalizeExcelHeaderKey(k) {
  return String(k ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function getExcelCell(row, ...aliases) {
  const map = new Map()
  for (const [k, v] of Object.entries(row)) {
    map.set(normalizeExcelHeaderKey(k), v)
  }
  for (const a of aliases) {
    const key = normalizeExcelHeaderKey(a)
    if (map.has(key)) {
      const v = map.get(key)
      if (v != null && String(v).trim() !== '') return String(v).trim()
    }
  }
  return ''
}

/** DB 예문 칸 하나에 넣기: 영문 + 한글 예문 줄바꿈 */
function mergeExampleFields(exampleEn, exampleKo) {
  const e = String(exampleEn ?? '').trim()
  const k = String(exampleKo ?? '').trim()
  if (e && k) return `${e}\n${k}`
  return e || k || ''
}

function isPlaceholderImageCell(s) {
  const t = String(s ?? '').trim()
  if (!t) return true
  if (t === '(선택사항)') return true
  if (/^\(?선택/.test(t)) return true
  return false
}

/** importSetType: word | sentence* → 엑셀 양식 분기 */
function downloadTokpassExcelTemplate(importSetType = 'word') {
  let aoa
  let cols
  const t =
    importSetType === 'sentence' ||
    importSetType === 'sentence_writing' ||
    importSetType === 'sentence_speaking'
      ? 'sentence'
      : 'word'
  const fileName = EXCEL_FILE_NAMES[t] || EXCEL_FILE_NAMES.word
  if (t === 'sentence') {
    aoa = [
      ['example_sentence', 'meaning', 'day', 'image_url', 'youtube_url'],
      ['I ate an apple.', '나는 사과를 먹었다.', '1', '(선택)', '(선택)'],
      ['She lent me a book.', '그녀는 나에게 책을 빌려줬다.', '1', '(선택)', '(선택)'],
    ]
    cols = [{ wch: 36 }, { wch: 22 }, { wch: 6 }, { wch: 24 }, { wch: 28 }]
  } else {
    aoa = [
      ['word', 'meaning', 'example_sentence', 'day', 'image_url', 'youtube_url'],
      ['apple', '사과', 'I ate an apple.', '1', '(선택)', '(선택)'],
      ['lend', '빌려주다', 'She lent me a book.', '1', '(선택)', '(선택)'],
    ]
    cols = [{ wch: 14 }, { wch: 14 }, { wch: 32 }, { wch: 6 }, { wch: 24 }, { wch: 28 }]
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = cols
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'words')
  XLSX.writeFile(wb, fileName)
}

/**
 * @param {{
 *   open: boolean
 *   onClose: () => void
 *   onSaved: () => void
 *   existingSetNames: string[]
 *   localOnly?: boolean
 *   onLocalImported?: (rows: Array<Record<string, unknown>>, meta?: { canUseCsvDay: boolean }) => void
 *   initialSetName?: string
 *   teacherId?: string
 *   academyId?: string
 *   importSetType?: 'word' | 'sentence' | 'sentence_writing' | 'sentence_speaking'
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
  teacherId,
  academyId,
  importSetType = 'word',
}) {
  const setType =
    importSetType === 'sentence' ||
    importSetType === 'sentence_writing' ||
    importSetType === 'sentence_speaking'
      ? 'sentence'
      : 'word'
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
  const [excelParseBusy, setExcelParseBusy] = useState(false)
  /** 마지막 엑셀 첫 시트에 `day` 헤더가 있었는지 (문장/스피킹 day 누락 검증·CSV day 옵션) */
  const [excelDayColumnInSheet, setExcelDayColumnInSheet] = useState(false)
  const xlsxInputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    if (initialSetName !== undefined) {
      setSetName(String(initialSetName))
    } else {
      setSetName('')
    }
    setExcelDayColumnInSheet(false)
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
      dayExplicit: false,
      image_url: null,
      image_source: 'none',
      youtube_url: null,
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

  const validOpts = { excelDayColumn: excelDayColumnInSheet }

  const handleSave = async () => {
    if (setType === 'sentence' && excelDayColumnInSheet) {
      const bad = previewRows.filter((r) => {
        const ex = String(r.example_sentence || '').trim()
        if (!ex || meaningIsMissing(r.meaning)) return false
        const dn = Math.max(0, parseInt(String(r.day ?? 0), 10) || 0)
        return dn < 1
      })
      if (bad.length > 0) {
        alert(
          `${bad.length}개 행에 day가 비어있어요. 문장/스피킹 세트는 day를 필수로 입력해야 합니다.`,
        )
        return
      }
    }
    const valid = previewRows.filter((r) => isPreviewRowValidForSetType(r, setType, validOpts))
    if (valid.length === 0) {
      alert(
        setType === 'sentence'
          ? '저장할 행이 없습니다. 예문·뜻을 모두 입력했는지 확인하세요.'
          : '저장할 단어가 없습니다. 필수 칸을 모두 입력했는지 확인하세요.',
      )
      return
    }
    const trimmedSet = String(setName).trim()
    if (!trimmedSet && !localOnly) {
      alert('세트 이름을 입력하세요.')
      return
    }
    if (!localOnly && (!teacherId || !academyId)) {
      alert('선생님 정보를 불러올 수 없습니다. 다시 로그인하거나 페이지를 새로고침해 주세요.')
      return
    }
    setSaving(true)
    try {
      const payload = valid.map((r) => {
        const ex = String(r.example_sentence || '').trim()
        let word = String(r.word || '').trim()
        if (setType === 'sentence' && !word) {
          word = ex.length > 300 ? ex.slice(0, 300) : ex
        }
        const yt =
          r.youtube_url != null && String(r.youtube_url).trim()
            ? String(r.youtube_url).trim()
            : null
        return {
          word,
          meaning: String(r.meaning ?? '').trim(),
          example_sentence: ex || null,
          set_name: String(r.set_name || setName).trim() || trimmedSet,
          day: Math.max(1, parseInt(String(r.day ?? day), 10) || 1),
          difficulty: normalizeWordDifficulty(r.difficulty),
          image_url: r.image_url ? String(r.image_url) : null,
          image_source: r.image_url ? (r.image_source || 'upload') : 'none',
          youtube_url: yt,
          academy_id: academyId,
          teacher_id: teacherId,
        }
      })

      const badMeaning = []
      payload.forEach((p, i) => {
        if (!meaningIsMissing(p.meaning)) return
        const r = valid[i]
        const idx = previewRows.findIndex((x) => String(x.id) === String(r.id))
        badMeaning.push({
          row: idx >= 0 ? idx + 1 : i + 1,
          label: wordLabelForMeaningAlert(r, { sentenceStyle: setType === 'sentence' }),
        })
      })
      if (badMeaning.length > 0) {
        alert(formatEmptyMeaningAlert(badMeaning))
        return
      }

      if (localOnly && onLocalImported) {
        const stamp = Date.now()
        const mapped = valid.map((r, i) => ({
          id: `import-${stamp}-${i}`,
          word: String(payload[i].word),
          meaning: String(payload[i].meaning),
          example_sentence: payload[i].example_sentence,
          set_name: String(payload[i].set_name),
          day: payload[i].day,
          difficulty: payload[i].difficulty,
          image_url: payload[i].image_url,
          image_source: payload[i].image_source,
          youtube_url: payload[i].youtube_url,
          dayExplicit: r.dayExplicit === true,
        }))
        const canUseCsvDay =
          excelDayColumnInSheet && valid.length > 0 && valid.every((r) => r.dayExplicit === true)
        onLocalImported(mapped, { canUseCsvDay })
        onClose()
        resetPreview()
        setAiPassage('')
        setPasteText('')
        setCsvText('')
        return
      }

      const dedupedPayload = Array.from(
        new Map(payload.map((p) => [`${p.set_name}|${p.day}|${p.word}`, p])).values(),
      )
      const { error } = await supabase.from('words').upsert(dedupedPayload, {
        onConflict: 'set_name,day,word',
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
      alert(formatSupabaseWordsSaveError(e))
    } finally {
      setSaving(false)
    }
  }

  const onAutoFilled = (updated) => {
    setPreviewRows(updated)
  }

  const buildPreviewFromExcelJson = (jsonRows, headerHasDayColumn) => {
    const stamp = Date.now()
    const sn = String(setName || '').trim()
    const d = Math.max(1, parseInt(String(day), 10) || 1)
    const rows = []
    let idx = 0
    /** day 컬럼이 있는데 셀 비어 있으면 0(미리보기에서 수정·또는 저장 차단) */
    const rowDayForSentence = (raw) => {
      const cell = getExcelCell(raw, 'day')
      if (cell === '') {
        if (headerHasDayColumn) return 0
        return d
      }
      const n = parseInt(cell, 10)
      if (isNaN(n) || n < 1) return headerHasDayColumn ? 0 : d
      return n
    }
    const rowDayForWord = (raw) => {
      const cell = getExcelCell(raw, 'day')
      if (cell === '') return d
      const n = parseInt(cell, 10)
      return !isNaN(n) && n >= 1 ? n : d
    }
    if (setType === 'sentence') {
      for (const raw of jsonRows) {
        const ex = getExcelCell(raw, 'example_sentence')
        if (!ex) continue
        const meaning = getExcelCell(raw, 'meaning')
        if (!meaning) continue
        let word = getExcelCell(raw, 'word')
        if (!word) word = ex.length > 300 ? ex.slice(0, 300) : ex
        const ko = getExcelCell(raw, 'example_ko')
        const imgRaw = getExcelCell(raw, 'image_url')
        const image_url = isPlaceholderImageCell(imgRaw) ? null : imgRaw
        const ytRaw = getExcelCell(raw, 'youtube_url')
        const youtube_url =
          ytRaw && String(ytRaw).trim() && !isPlaceholderImageCell(ytRaw)
            ? String(ytRaw).trim()
            : null
        const dayCell = getExcelCell(raw, 'day')
        const dayExplicit = headerHasDayColumn && String(dayCell).trim() !== ''
        const rowDay = rowDayForSentence(raw)
        rows.push({
          id: `import-${stamp}-${idx}`,
          word,
          meaning,
          example_sentence: mergeExampleFields(ex, ko),
          set_name: sn,
          day: rowDay,
          dayExplicit,
          image_url,
          image_source: image_url ? 'upload' : 'none',
          youtube_url,
        })
        idx += 1
      }
      return rows
    }
    for (const raw of jsonRows) {
      const word = getExcelCell(raw, 'word')
      if (!word) continue
      const meaning = getExcelCell(raw, 'meaning')
      const ex = getExcelCell(raw, 'example_sentence')
      const ko = getExcelCell(raw, 'example_ko')
      const imgRaw = getExcelCell(raw, 'image_url')
      const image_url = isPlaceholderImageCell(imgRaw) ? null : imgRaw
      const ytRaw = getExcelCell(raw, 'youtube_url')
      const youtube_url =
        ytRaw && String(ytRaw).trim() && !isPlaceholderImageCell(ytRaw)
          ? String(ytRaw).trim()
          : null
      const dayCell = getExcelCell(raw, 'day')
      const dayExplicit = headerHasDayColumn && String(dayCell).trim() !== ''
      const rowDay = rowDayForWord(raw)
      rows.push({
        id: `import-${stamp}-${idx}`,
        word,
        meaning,
        example_sentence: mergeExampleFields(ex, ko),
        set_name: sn,
        day: rowDay,
        dayExplicit,
        image_url,
        image_source: image_url ? 'upload' : 'none',
        youtube_url,
      })
      idx += 1
    }
    return rows
  }

  const handleXlsxFile = async (e) => {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    setExcelParseBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const name = wb.SheetNames[0]
      if (!name) {
        alert('시트가 비어 있습니다.')
        return
      }
      const ws = wb.Sheets[name]
      const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
      if (!Array.isArray(jsonRows) || jsonRows.length === 0) {
        alert('데이터 행이 없습니다. 양식 2행부터 채워 주세요.')
        return
      }
      const headerHasDay =
        !!jsonRows[0] && Object.keys(jsonRows[0]).some((k) => normalizeExcelHeaderKey(k) === 'day')
      setExcelDayColumnInSheet(headerHasDay)
      const rows = buildPreviewFromExcelJson(jsonRows, headerHasDay)
      if (rows.length === 0) {
        alert(
          setType === 'sentence'
            ? '읽을 수 있는 문장(example_sentence·meaning) 행이 없습니다. 헤더와 열 이름을 확인해 주세요.'
            : '읽을 수 있는 단어(word) 행이 없습니다. 헤더와 열 이름을 확인해 주세요.',
        )
        return
      }
      setPreviewRows(rows)
      setSelectedIds(new Set(rows.map((r) => String(r.id))))
      setTab('csv')
    } catch (err) {
      console.warn(err)
      alert(`엑셀을 읽지 못했습니다: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExcelParseBusy(false)
    }
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

        <section
          aria-label="엑셀 양식"
          style={{
            marginBottom: 20,
            padding: '14px 16px',
            borderRadius: RADIUS.lg,
            border: `1px solid ${COLORS.border}`,
            borderLeft: `4px solid ${COLORS.primary}`,
            background: COLORS.primarySoft,
            boxShadow: SHADOW.card,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.accentText, marginBottom: 6 }}>📥 엑셀 양식 다운로드</div>
          <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 12px', lineHeight: 1.5 }}>
            양식을 다운받아 채운 후 파일 업로드로 가져오세요
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => downloadTokpassExcelTemplate(setType)}
              style={{
                padding: '10px 18px',
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.primary}`,
                background: COLORS.surface,
                color: COLORS.primaryDark,
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              양식 받기 (.xlsx)
            </button>
            <input ref={xlsxInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(ev) => void handleXlsxFile(ev)} />
            <button
              type="button"
              disabled={excelParseBusy}
              onClick={() => xlsxInputRef.current?.click()}
              style={{
                padding: '10px 18px',
                borderRadius: RADIUS.md,
                border: 'none',
                background: COLORS.headerGradient,
                color: COLORS.textOnGreen,
                fontWeight: 700,
                cursor: excelParseBusy ? 'wait' : 'pointer',
                fontSize: 14,
                opacity: excelParseBusy ? 0.85 : 1,
              }}
            >
              {excelParseBusy ? '읽는 중…' : '파일 업로드 (.xlsx)'}
            </button>
          </div>
          <p style={{ fontSize: 12, color: COLORS.textHint, margin: '10px 0 0' }}>
            {setType === 'sentence'
              ? '컬럼: example_sentence · meaning · image_url(선택) · youtube_url(선택)'
              : '컬럼: word · meaning · example_sentence · image_url(선택) · youtube_url(선택)'}
            — 업로드 후 아래에서 미리보기·저장할 수 있어요.
          </p>
        </section>

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
                columnPreset={setType}
                showImageColumn
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
                    ? `${previewRows.filter((r) => isPreviewRowValidForSetType(r, setType, validOpts)).length}개 테이블에 추가`
                    : `${previewRows.filter((r) => isPreviewRowValidForSetType(r, setType, validOpts)).length}개 저장`}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
