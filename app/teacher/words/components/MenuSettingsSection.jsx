'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'
import { COLORS, RADIUS } from '@/utils/tokens'

const VOCAB_MENU = { key: 'vocab', label: '단어 학습' }

const TOEIC_MENU_KEYS = [
  { key: 'quiz', label: '오늘의 연구 (퀴즈)' },
  { key: 'result', label: '나의 성과' },
  { key: 'homework', label: '숙제 인증' },
  { key: 'absence', label: '결석 영상' },
  { key: 'jokbo', label: '시험 만점 족보' },
]

const ALL_MENU_KEYS = [VOCAB_MENU, ...TOEIC_MENU_KEYS]

const DEFAULT_MENUS = () => ({
  quiz: false,
  result: false,
  homework: false,
  absence: false,
  vocab: true,
  jokbo: false,
})

function normalizeMenus(raw) {
  const base = DEFAULT_MENUS()
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const { key } of ALL_MENU_KEYS) {
      if (typeof raw[key] === 'boolean') base[key] = raw[key]
    }
  }
  return base
}

/**
 * 학생 앱(tokpass-app) 메뉴 표시 여부 — teachers.visible_menus JSON
 * @param {{ teacherId: string | undefined, visibleMenus: object | null | undefined, onSaved?: () => void }} props
 */
export default function MenuSettingsSection({ teacherId, visibleMenus, onSaved }) {
  const [menus, setMenus] = useState(DEFAULT_MENUS)
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState(null)

  useEffect(() => {
    setMenus(normalizeMenus(visibleMenus))
  }, [teacherId, visibleMenus])

  const toggle = useCallback((key) => {
    setMenus((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handleSave = async () => {
    if (!teacherId) return
    setSaving(true)
    setStatusMsg(null)
    const payload = { ...menus }
    const { error } = await supabase.from('teachers').update({ visible_menus: payload }).eq('id', teacherId)
    setSaving(false)
    if (error) {
      console.warn('[MenuSettings]', error.message)
      setStatusMsg('저장 실패')
      return
    }
    setStatusMsg('저장됐습니다 ✓')
    if (typeof onSaved === 'function') onSaved()
  }

  return (
    <section
      aria-label="학생 앱 메뉴 설정"
      style={{
        width: '100%',
        maxWidth: '100%',
        margin: '0 0 16px',
        padding: '22px 24px',
        borderRadius: RADIUS.xl,
        border: `1px solid ${COLORS.border}`,
        borderLeft: '4px solid #667eea',
        boxShadow: '0 8px 32px rgba(31, 38, 135, 0.06)',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          margin: '0 0 12px',
          paddingLeft: 2,
          fontSize: '1rem',
          fontWeight: 700,
          color: '#374151',
          letterSpacing: '-0.02em',
        }}
      >
        학생 앱 메뉴 설정
      </div>
      <div
        style={{
          height: 1,
          background: 'linear-gradient(90deg, rgba(102,126,234,0.35) 0%, rgba(229,231,235,0.9) 100%)',
          marginBottom: 16,
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 18 }}>
        <div
          style={{
            padding: '14px 16px',
            borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.bg,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: '#374151',
              letterSpacing: '-0.02em',
              marginBottom: 10,
            }}
          >
            [기본 메뉴]
          </div>
          <label
            style={{
              display: 'block',
              cursor: !teacherId || saving ? 'not-allowed' : 'pointer',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div style={{ fontSize: 15, color: COLORS.textPrimary, fontWeight: 600 }}>
                  {VOCAB_MENU.label}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: COLORS.textSecondary,
                    fontWeight: 500,
                  }}
                >
                  [ 단어암기, 영문법, 회화, 라이팅, 매칭게임, 테스트 ]
                </div>
              </div>
              <input
                type="checkbox"
                checked={!!menus[VOCAB_MENU.key]}
                onChange={() => toggle(VOCAB_MENU.key)}
                disabled={!teacherId || saving}
                style={{
                  width: 18,
                  height: 18,
                  flexShrink: 0,
                  marginTop: 2,
                  accentColor: '#4CAF50',
                  cursor: !teacherId || saving ? 'not-allowed' : 'pointer',
                }}
              />
            </div>
          </label>
        </div>

        <div
          style={{
            padding: '14px 16px',
            borderRadius: RADIUS.md,
            border: `1px solid rgba(102, 126, 234, 0.28)`,
            background: 'rgba(102, 126, 234, 0.04)',
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: '#374151',
              letterSpacing: '-0.02em',
              marginBottom: 6,
            }}
          >
            [토익 전용 메뉴]
          </div>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              lineHeight: 1.5,
              color: COLORS.textSecondary,
              fontWeight: 500,
            }}
          >
            토익 강의를 진행하시는 선생님은 추가 선택하세요
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {TOEIC_MENU_KEYS.map(({ key, label }) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  cursor: 'pointer',
                  fontSize: 15,
                  color: COLORS.textPrimary,
                  fontWeight: 500,
                }}
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={!!menus[key]}
                  onChange={() => toggle(key)}
                  disabled={!teacherId || saving}
                  style={{
                    width: 18,
                    height: 18,
                    flexShrink: 0,
                    accentColor: '#4CAF50',
                    cursor: !teacherId || saving ? 'not-allowed' : 'pointer',
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!teacherId || saving}
          style={{
            padding: '12px 28px',
            borderRadius: RADIUS.md,
            border: 'none',
            background: COLORS.headerGradient,
            color: COLORS.textOnGreen,
            fontWeight: 700,
            fontSize: 15,
            cursor: !teacherId || saving ? 'not-allowed' : 'pointer',
            opacity: !teacherId || saving ? 0.65 : 1,
            boxShadow: !teacherId || saving ? 'none' : '0 4px 16px rgba(102, 126, 234, 0.28)',
          }}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        {statusMsg ? (
          <span
            role="status"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: statusMsg.includes('실패') ? COLORS.danger : COLORS.accentText,
            }}
          >
            {statusMsg}
          </span>
        ) : null}
      </div>
    </section>
  )
}
