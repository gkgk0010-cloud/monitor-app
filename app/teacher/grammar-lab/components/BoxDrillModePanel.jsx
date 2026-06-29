'use client'

import { COLORS, RADIUS } from '@/utils/tokens'

const secondaryBtn = {
  padding: '10px 16px',
  borderRadius: RADIUS.md,
  border: `1px solid ${COLORS.border}`,
  background: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 14,
}

/**
 * @param {{
 *   boxMode: 'full' | 'target'
 *   taskDescription: string
 *   saving?: boolean
 *   onBoxModeChange: (mode: 'full' | 'target') => void
 *   onTaskDescriptionChange: (value: string) => void
 *   onSave: () => void | Promise<void>
 * }} props
 */
export default function BoxDrillModePanel({
  boxMode,
  taskDescription,
  saving = false,
  onBoxModeChange,
  onTaskDescriptionChange,
  onSave,
}) {
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
      <p style={{ margin: '0 0 12px', fontWeight: 800, fontSize: 15 }}>박스 모드</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          {
            id: 'full',
            label: '전체 박스',
            desc: '문장 전체를 의미 단위로 나누는 연습',
          },
          {
            id: 'target',
            label: '타겟 박스',
            desc: '특정 문법 요소만 박스로 표시 (be동사구, 분사구 등)',
          },
        ].map((opt) => (
          <label
            key={opt.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 12px',
              borderRadius: RADIUS.md,
              border:
                boxMode === opt.id ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
              background: boxMode === opt.id ? '#ecfdf5' : '#fff',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="box-mode"
              value={opt.id}
              checked={boxMode === opt.id}
              onChange={() => onBoxModeChange(opt.id === 'target' ? 'target' : 'full')}
              style={{ marginTop: 3 }}
            />
            <span>
              <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>{opt.label}</span>
              <span style={{ display: 'block', fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
                {opt.desc}
              </span>
            </span>
          </label>
        ))}
      </div>

      {boxMode === 'target' ? (
        <div style={{ marginTop: 14 }}>
          <label style={{ fontWeight: 700, fontSize: 14 }}>학생 안내 텍스트</label>
          <input
            value={taskDescription}
            onChange={(e) => onTaskDescriptionChange(e.target.value)}
            placeholder="be동사구만 박스로 표시하세요"
            style={{
              width: '100%',
              marginTop: 8,
              padding: '10px 12px',
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              fontSize: 15,
            }}
          />
          <p style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.textSecondary }}>
            학생앱 박스 만들기 화면 상단에 📌 배너로 표시됩니다.
          </p>
        </div>
      ) : null}

      <button
        type="button"
        disabled={saving}
        onClick={() => void onSave()}
        style={{ ...secondaryBtn, marginTop: 14, opacity: saving ? 0.6 : 1 }}
      >
        {saving ? '저장 중…' : '박스 모드 저장'}
      </button>
    </section>
  )
}
