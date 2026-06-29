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
import { parseBracketBoxMarkers } from '../../grammar-lab/utils/grammarLabRows'
import { parseBoxDrillExcelRow } from '../../grammar-lab/utils/boxDrillExcel'
import { fetchWordSetsLangMapByTeacher, buildTtsJobsFromRowsWithSetLangMap } from '@/utils/ttsJobs'
import { runTeacherTtsPrefetchWithOverlay } from '@/utils/ttsPrefetchRunner'
import { showToast } from '@/utils/toastBus'
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
  box_drill: 'tokpass_박스만들기양식.xlsx',
}

/**
 * @param {'word' | 'sentence'} t
 * @param {{ excelDayColumn?: boolean } | undefined} _opts
 */
function isPreviewRowSaveCandidate(r, t, _opts) {
  const w = String(r.word || '').trim()
  const ex = String(r.example_sentence || '').trim()
  if (t === 'sentence') {
    return Boolean(ex)
  }
  return Boolean(w)
}

function isPreviewRowValidForSetType(r, t, opts) {
  return isPreviewRowSaveCandidate(r, t, opts) && !meaningIsMissing(r.meaning)
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

function isGuideExcelSheet(name) {
  const t = String(name ?? '').trim()
  return t === '안내' || /^guide$/i.test(t)
}

function sheetJsonRows(wb, name) {
  const ws = wb.Sheets[name]
  if (!ws) return []
  const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
  return Array.isArray(jsonRows) ? jsonRows : []
}

/** 양식 B(괄호) 시트에 데이터가 있으면 B 우선, 없으면 A·기타 */
function resolveBoxDrillImportSheetNames(wb) {
  const all = (wb.SheetNames || []).filter((n) => !isGuideExcelSheet(n))
  if (!all.length) return wb.SheetNames?.length ? [wb.SheetNames[0]] : []

  const countValid = (jsonRows) => {
    let n = 0
    for (const raw of jsonRows) {
      const ex = getExcelCell(raw, 'example_sentence', '예문')
      const meaning = getExcelCell(raw, 'meaning', '의미')
      if (ex && meaning) n += 1
    }
    return n
  }

  const bName = all.find((n) => /양식B|괄호/i.test(String(n)))
  const aName = all.find((n) => /양식A|정답/i.test(String(n)))

  if (bName && countValid(sheetJsonRows(wb, bName)) > 0) return [bName]
  if (aName && countValid(sheetJsonRows(wb, aName)) > 0) return [aName]

  for (const name of all) {
    if (countValid(sheetJsonRows(wb, name)) > 0) return [name]
  }
  return [all[0]]
}

function resolveImportSheetNames(wb, isBoxDrillImport) {
  if (!wb.SheetNames?.length) return []
  if (isBoxDrillImport) return resolveBoxDrillImportSheetNames(wb)
  return [wb.SheetNames[0]]
}

function mergeSheetJsonRows(wb, sheetNames) {
  let combined = []
  let headerHasDay = false
  for (const name of sheetNames) {
    const jsonRows = sheetJsonRows(wb, name)
    if (!jsonRows.length) continue
    if (
      jsonRows[0] &&
      Object.keys(jsonRows[0]).some((k) => normalizeExcelHeaderKey(k) === 'day')
    ) {
      headerHasDay = true
    }
    combined = combined.concat(jsonRows)
  }
  return { jsonRows: combined, headerHasDay }
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

/** importSetType: word | sentence* | box_drill → 엑셀 양식 분기 */
function downloadTokpassExcelTemplate(importSetType = 'word', options = {}) {
  const omitDay = options.omitDay === true
  let aoa
  let cols
  const isBoxDrill = importSetType === 'box_drill'
  const t =
    isBoxDrill ||
    importSetType === 'sentence' ||
    importSetType === 'sentence_writing' ||
    importSetType === 'sentence_speaking'
      ? isBoxDrill
        ? 'box_drill'
        : 'sentence'
      : 'word'
  const fileName = EXCEL_FILE_NAMES[t] || EXCEL_FILE_NAMES.word
  if (t === 'box_drill') {
    const wsA = XLSX.utils.aoa_to_sheet([
      ['예문', '의미', '정답', 'day', 'image_url', 'youtube_url'],
      [
        'The new policy will take effect from next month.',
        '(결론) 그 새 정책은 시행된다 / (세부) 시점: 다음 달부터.',
        'The new policy / will take effect / from next month.',
        '1',
        '(선택)',
        '(선택)',
      ],
      ['She lent me a book.', '그녀는 나에게 책을 빌려줬다.', '', '1', '(선택)', '(선택)'],
    ])
    wsA['!cols'] = [{ wch: 42 }, { wch: 28 }, { wch: 48 }, { wch: 6 }, { wch: 24 }, { wch: 28 }]
    const wsB = XLSX.utils.aoa_to_sheet([
      ['example_sentence', 'meaning', 'day', 'image_url', 'youtube_url'],
      [
        '[The accounting director revised the budget proposal] [before it was sent] [for approval] [this past Monday].',
        '주어+동사+목적어 / 부사절(수동) / 전치사구 / 부사구 → 회계부서장이 … 수정하였다',
        '1',
        '(선택)',
        '(선택)',
      ],
      [
        'She [is a doctor] at the local hospital.',
        '그녀는 지역 병원의 의사다',
        '1',
        '(선택)',
        '(선택)',
      ],
    ])
    wsB['!cols'] = [{ wch: 72 }, { wch: 36 }, { wch: 6 }, { wch: 24 }, { wch: 28 }]
    const guide = XLSX.utils.aoa_to_sheet([
      ['박스 만들기 엑셀 — 양식 A · B'],
      [''],
      ['양식 A (시트: 양식A_정답열)'],
      ['컬럼: 예문 · 의미 · 정답 · day(선택)'],
      ['정답: 예문을 " / "(앞뒤 공백 1칸)로 구분 — 예: The new policy / will take effect / from next month.'],
      [''],
      ['양식 B (시트: 양식B_괄호)'],
      ['컬럼: example_sentence · meaning · day(선택)'],
      ['예문 안에 [박스1] [박스2] … 표시 — 괄호 제거한 평문이 저장되고 박스 좌표 자동 계산'],
      ['예: [The accounting director …] [before it was sent] [for approval] [this past Monday].'],
      [''],
      ['day: 같은 세트 안에서 Day 1, 2, … 구분 (비우면 1)'],
      ['정답·괄호 모두 없으면 예문·의미만 등록, 박스는 수동 등록'],
    ])
    guide['!cols'] = [{ wch: 88 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsA, '양식A_정답열')
    XLSX.utils.book_append_sheet(wb, wsB, '양식B_괄호')
    XLSX.utils.book_append_sheet(wb, guide, '안내')
    XLSX.writeFile(wb, fileName)
    return
  } else if (t === 'sentence') {
    if (omitDay) {
      aoa = [
        ['example_sentence', 'meaning', 'image_url', 'youtube_url'],
        ['I ate an apple.', '나는 사과를 먹었다.', '(선택)', '(선택)'],
        ['She lent me a book.', '그녀는 나에게 책을 빌려줬다.', '(선택)', '(선택)'],
      ]
      cols = [{ wch: 36 }, { wch: 22 }, { wch: 24 }, { wch: 28 }]
    } else {
      aoa = [
        ['example_sentence', 'meaning', 'day', 'image_url', 'youtube_url'],
        ['I ate an apple.', '나는 사과를 먹었다.', '1', '(선택)', '(선택)'],
        ['She lent me a book.', '그녀는 나에게 책을 빌려줬다.', '1', '(선택)', '(선택)'],
      ]
      cols = [{ wch: 36 }, { wch: 22 }, { wch: 6 }, { wch: 24 }, { wch: 28 }]
    }
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
 *   importSetType?: 'word' | 'sentence' | 'sentence_writing' | 'sentence_speaking' | 'box_drill'
 *   forceDayOne?: boolean
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
  forceDayOne = false,
}) {
  const isBoxDrillImport = importSetType === 'box_drill'
  const setType =
    importSetType === 'sentence' ||
    importSetType === 'sentence_writing' ||
    importSetType === 'sentence_speaking' ||
    isBoxDrillImport
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
    const fixedDay = forceDayOne ? 1 : day
    const rows = parsed.map((p, i) => ({
      id: `import-${Date.now()}-${i}`,
      word: p.word,
      meaning: p.meaning || '',
      example_sentence: p.example_sentence || '',
      set_name: setName,
      day: fixedDay,
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
    const dayForPayload = (r) => {
      if (forceDayOne) return 1
      const pd = parseInt(String(r.day ?? ''), 10)
      if (setType === 'sentence') {
        if (Number.isFinite(pd) && pd >= 1) return pd
        return localOnly ? 0 : Math.max(1, parseInt(String(day), 10) || 1)
      }
      return Math.max(1, parseInt(String(r.day ?? day), 10) || 1)
    }

    const candidates = previewRows.filter((r) => isPreviewRowSaveCandidate(r, setType, validOpts))
    if (candidates.length === 0) {
      alert(
        setType === 'sentence'
          ? '저장할 행이 없습니다. 예문·뜻을 확인하세요.'
          : '저장할 단어가 없습니다. 단어 칸을 확인하세요.',
      )
      return
    }
    const badMeaning = []
    for (const r of candidates) {
      if (!meaningIsMissing(r.meaning)) continue
      const idx = previewRows.findIndex((x) => String(x.id) === String(r.id))
      badMeaning.push({
        row: idx >= 0 ? idx + 1 : 1,
        label: wordLabelForMeaningAlert(r, { sentenceStyle: setType === 'sentence' }),
      })
    }
    if (badMeaning.length > 0) {
      alert(formatEmptyMeaningAlert(badMeaning))
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
      const payload = candidates.map((r) => {
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
          day: dayForPayload(r),
          difficulty: normalizeWordDifficulty(r.difficulty),
          image_url: r.image_url ? String(r.image_url) : null,
          image_source: r.image_url ? (r.image_source || 'upload') : 'none',
          youtube_url: yt,
          academy_id: academyId,
          teacher_id: teacherId,
        }
      })

      if (localOnly && onLocalImported) {
        const stamp = Date.now()
        const mapped = candidates.map((r, i) => ({
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
          _boxAnswer: r._boxAnswer || null,
          _bracketBoxes: Array.isArray(r._bracketBoxes) && r._bracketBoxes.length ? r._bracketBoxes : null,
          _boxImportFormat: r._boxImportFormat || null,
        }))
        const canUseCsvDay =
          excelDayColumnInSheet && candidates.length > 0 && candidates.every((r) => r.dayExplicit === true)
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

      try {
        const langBySet = await fetchWordSetsLangMapByTeacher(supabase, teacherId)
        const jobs = buildTtsJobsFromRowsWithSetLangMap(langBySet, dedupedPayload)
        if (jobs.length > 0) {
          void runTeacherTtsPrefetchWithOverlay({
            jobs,
            title: '가져오기 · 음성 캐시',
            subtitle: `음성 생성 중 0/${jobs.length}`,
            gapMs: 165,
            onToast: {
              success: (m) => showToast(m, 'success', 3400),
              warning: (m) => showToast(m, 'error', 3800),
            },
          })
        }
      } catch (e) {
        console.error('[BulkImport] tts warmup', e)
      }

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
    const d = forceDayOne ? 1 : Math.max(1, parseInt(String(day), 10) || 1)
    const ignoreExcelDay = forceDayOne
    const rows = []
    let idx = 0
    /** day 컬럼이 있는데 셀 비어 있으면 0(미리보기에서 수정·또는 저장 차단) */
    const rowDayForSentence = (raw) => {
      if (ignoreExcelDay) return 1
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
      if (ignoreExcelDay) return 1
      const cell = getExcelCell(raw, 'day')
      if (cell === '') return d
      const n = parseInt(cell, 10)
      return !isNaN(n) && n >= 1 ? n : d
    }
    if (setType === 'sentence') {
      for (const raw of jsonRows) {
        const ex = getExcelCell(raw, 'example_sentence', '예문')
        if (!ex) continue
        const meaning = getExcelCell(raw, 'meaning', '의미')
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
        const dayExplicit = !ignoreExcelDay && headerHasDayColumn && String(getExcelCell(raw, 'day')).trim() !== ''
        const rowDay = rowDayForSentence(raw)
        const boxAnswer = isBoxDrillImport
          ? getExcelCell(raw, 'box_answer', '정답', 'answer', 'boxes')
          : ''
        const parsed = isBoxDrillImport
          ? parseBoxDrillExcelRow(ex, boxAnswer)
          : parseBracketBoxMarkers(ex)
        const cleanEx = isBoxDrillImport ? parsed.cleanExample : parsed.sentence_text
        const bracketBoxes = isBoxDrillImport
          ? parsed.boxes || null
          : parsed.boxes?.length
            ? parsed.boxes
            : null
        rows.push({
          id: `import-${stamp}-${idx}`,
          word,
          meaning,
          example_sentence: mergeExampleFields(cleanEx, ko),
          set_name: sn,
          day: rowDay,
          dayExplicit,
          image_url,
          image_source: image_url ? 'upload' : 'none',
          youtube_url,
          _boxAnswer: isBoxDrillImport ? parsed.boxAnswer || null : boxAnswer || null,
          _bracketBoxes: bracketBoxes?.length ? bracketBoxes : null,
          _boxImportFormat: isBoxDrillImport ? parsed.format : null,
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
      const sheetNames = resolveImportSheetNames(wb, isBoxDrillImport)
      if (!sheetNames.length) {
        alert('시트가 비어 있습니다.')
        return
      }
      const { jsonRows, headerHasDay } = mergeSheetJsonRows(wb, sheetNames)
      if (!jsonRows.length) {
        alert('데이터 행이 없습니다. 양식 2행부터 채워 주세요.')
        return
      }
      const headerHasDayFinal = !forceDayOne && headerHasDay
      setExcelDayColumnInSheet(headerHasDayFinal)
      const rows = buildPreviewFromExcelJson(jsonRows, headerHasDayFinal)
      if (rows.length === 0) {
        alert(
          setType === 'sentence'
            ? isBoxDrillImport
              ? '읽을 수 있는 문장 행이 없습니다. 양식 B는 example_sentence·meaning, 양식 A는 예문·의미·정답 열을 확인해 주세요.'
              : '읽을 수 있는 문장(example_sentence·meaning) 행이 없습니다. 헤더와 열 이름을 확인해 주세요.'
            : '읽을 수 있는 단어(word) 행이 없습니다. 헤더와 열 이름을 확인해 주세요.',
        )
        return
      }
      if (isBoxDrillImport) {
        const bracketN = rows.filter((r) => r._boxImportFormat === 'bracket').length
        const slashN = rows.filter((r) => r._boxImportFormat === 'slash').length
        if (bracketN === 0 && slashN === 0) {
          console.warn('[box_drill import] 박스 자동 인식 0건 — 정답( / ) 또는 [ ] 괄호 확인')
        }
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
            {isBoxDrillImport ? (
              <>
                <br />
                <strong style={{ color: COLORS.primaryDark }}>
                  박스 만들기: {EXCEL_FILE_NAMES.box_drill} — 양식 A(정답 / ) · 양식 B([ ] 괄호) 2시트
                </strong>
              </>
            ) : null}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => downloadTokpassExcelTemplate(importSetType, { omitDay: forceDayOne })}
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
              {isBoxDrillImport ? '박스 만들기 양식 (.xlsx)' : '양식 받기 (.xlsx)'}
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
            {isBoxDrillImport
              ? '양식 A: 예문·의미·정답( / 구분) · 양식 B: example_sentence에 [박스] 표시 — 업로드 시 양식B 시트에 데이터가 있으면 B를 읽습니다'
              : forceDayOne && setType === 'sentence'
                ? '컬럼: example_sentence · meaning · image_url(선택) · youtube_url(선택) — Day 없음(자동 1)'
                : setType === 'sentence'
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
            {!forceDayOne ? (
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
            ) : null}
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
                showDayColumn={!forceDayOne}
                showImageColumn
                defaultLang="en-US"
              />
              <AutoFillPanel
                rows={selectedIds.size > 0 ? previewRows.filter((r) => selectedIds.has(String(r.id))) : previewRows}
                onFilled={(updated) => {
                  const map = new Map(updated.map((r) => [String(r.id), r]))
                  setPreviewRows((prev) => prev.map((r) => map.get(String(r.id)) || r))
                }}
                sentenceHintMode={setType === 'sentence'}
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
                    ? `${previewRows.filter((r) => isPreviewRowSaveCandidate(r, setType, validOpts)).length}개 테이블에 추가`
                    : `${previewRows.filter((r) => isPreviewRowSaveCandidate(r, setType, validOpts)).length}개 저장`}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
