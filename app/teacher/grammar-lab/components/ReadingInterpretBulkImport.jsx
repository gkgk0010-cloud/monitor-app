'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import { parseInterpretExcelRows, rowPreviewSentence, rowPreviewTranslation } from '../utils/readingInterpretRows'

function downloadTemplate() {
  const aoa = [
    ['영어 문장', '정답 의역', 'Day (1~30)'],
    [
      'The selection of new vendors will take about two weeks.',
      '새 공급업체를 선정하는 데 약 2주가 걸린다',
      '1',
    ],
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 48 }, { wch: 36 }, { wch: 10 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '독해해석')
  XLSX.writeFile(wb, 'tokpass_독해해석양식.xlsx')
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onImported: (rows: object[]) => Promise<void> | void,
 *   saving?: boolean,
 * }} props
 */
export default function ReadingInterpretBulkImport({ open, onClose, onImported, saving = false }) {
  const fileRef = useRef(null)
  const [preview, setPreview] = useState([])
  const [fileName, setFileName] = useState('')

  if (!open) return null

  const handleFile = async (file) => {
    if (!file) return
    setFileName(file.name)
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    setPreview(parseInterpretExcelRows(aoa.slice(1)))
  }

  const handleImport = async () => {
    if (!preview.length) {
      alert('가져올 유효 문항이 없습니다.')
      return
    }
    await onImported(preview)
    setPreview([])
    setFileName('')
  }

  const resetAndClose = () => {
    if (saving) return
    setPreview([])
    setFileName('')
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={resetAndClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 920,
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '20px 22px',
          borderRadius: RADIUS.lg,
          background: COLORS.surface,
          boxShadow: SHADOW.modal,
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>가져오기 추가</h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: COLORS.textSecondary }}>
          A 영어 문장 · B 정답 의역 · C Day (1~30, 비우면 NULL). 핵심단어·힌트·어색패턴은 AI 도우미로 채웁니다.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button type="button" onClick={downloadTemplate} style={secondaryBtn}>
            양식 다운로드
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} style={primaryBtn} disabled={saving}>
            파일 선택
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          {fileName ? <span style={{ fontSize: 13, color: COLORS.textSecondary, alignSelf: 'center' }}>{fileName}</span> : null}
        </div>

        {preview.length > 0 ? (
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: COLORS.primarySoft }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Day</th>
                  <th style={thStyle}>영어 문장</th>
                  <th style={thStyle}>정답 의역</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{i + 1}</td>
                    <td style={tdStyle}>{row.day != null ? row.day : '-'}</td>
                    <td style={tdStyle}>{rowPreviewSentence(row.sentence_en)}</td>
                    <td style={tdStyle}>{rowPreviewTranslation(row.correct_translation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: COLORS.textSecondary }}>
              유효 문항 {preview.length}건 (100건씩 저장)
            </p>
          </div>
        ) : (
          <p style={{ color: COLORS.textSecondary, fontSize: 14 }}>엑셀 파일을 선택하면 미리보기가 표시됩니다.</p>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={resetAndClose} disabled={saving} style={secondaryBtn}>
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={saving || !preview.length}
            style={{ ...primaryBtn, opacity: saving || !preview.length ? 0.5 : 1 }}
          >
            {saving ? '저장 중…' : `${preview.length || 0}건 저장`}
          </button>
        </div>
      </div>
    </div>
  )
}

const thStyle = { padding: '8px 10px', textAlign: 'left', borderBottom: `1px solid ${COLORS.border}`, fontWeight: 700 }
const tdStyle = { padding: '8px 10px', borderBottom: `1px solid ${COLORS.border}`, verticalAlign: 'top' }
const primaryBtn = {
  padding: '10px 16px',
  borderRadius: RADIUS.md,
  border: 'none',
  background: COLORS.primary,
  color: COLORS.textOnGreen,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 14,
}
const secondaryBtn = {
  padding: '10px 16px',
  borderRadius: RADIUS.md,
  border: `1px solid ${COLORS.border}`,
  background: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 14,
}
