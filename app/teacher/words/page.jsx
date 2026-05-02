'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabaseClient'
import { useTeacher } from '@/utils/useTeacher'
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens'
import { fetchTeacherRoutinesWithStats } from '@/utils/routineAdmin'
import { generateInviteCode } from '@/utils/teacherSignup'
import SetSettingsModal from './components/SetSettingsModal'
import { formatAvailableModesSummary, normalizeSetType } from './utils/learningModes'
import { showToast } from '@/utils/toastBus'

export default function WordsManagePage() {
  const router = useRouter()
  const [sets, setSets] = useState([])
  const [routines, setRoutines] = useState([])
  const [countsByName, setCountsByName] = useState({})
  const [loading, setLoading] = useState(true)
  const [settingsSetName, setSettingsSetName] = useState(null)
  const [settingsMeta, setSettingsMeta] = useState({ name: '', inferred: 'word', hasImage: false })
  const [regeneratingSetId, setRegeneratingSetId] = useState(null)

  const { teacher, loading: teacherLoading } = useTeacher()
  const teacherId = teacher?.id

  const loadSets = useCallback(async () => {
    if (!teacherId) {
      setSets([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('word_sets')
        .select('id, name, set_type, available_modes, invite_code')
        .eq('teacher_id', teacherId)
        .order('name', { ascending: true })
      if (error) {
        console.warn('[word_sets]', error.message)
        setSets([])
        return
      }
      setSets(data || [])
    } finally {
      setLoading(false)
    }
  }, [teacherId])

  const loadCounts = useCallback(async () => {
    if (!teacherId) {
      setCountsByName({})
      return
    }
    const { data, error } = await supabase.from('words').select('set_name').eq('teacher_id', teacherId)
    if (error) {
      console.warn('[words] counts', error.message)
      return
    }
    const m = {}
    for (const r of data || []) {
      const n = String(r.set_name || '').trim()
      if (!n) continue
      m[n] = (m[n] || 0) + 1
    }
    setCountsByName(m)
  }, [teacherId])

  const loadRoutines = useCallback(async () => {
    if (!teacherId) {
      setRoutines([])
      return
    }
    const { routines: rows } = await fetchTeacherRoutinesWithStats(teacherId)
    setRoutines(rows || [])
  }, [teacherId])

  useEffect(() => {
    void loadSets()
  }, [loadSets])

  useEffect(() => {
    void loadCounts()
  }, [loadCounts])

  useEffect(() => {
    void loadRoutines()
  }, [loadRoutines])

  const copyInvite = async (code) => {
    const c = String(code ?? '').trim()
    if (!c) return
    try {
      await navigator.clipboard.writeText(c)
      showToast('초대코드가 복사되었어요', 'success', 2500)
    } catch {
      showToast('복사에 실패했어요. 코드를 직접 선택해 주세요', 'error', 3000)
    }
  }

  const handleRegenerateInvite = async (setRow, e) => {
    e?.preventDefault()
    e?.stopPropagation()
    const wid = String(setRow.id)
    if (!teacherId || !wid) return
    if (
      !window.confirm(
        '초대코드를 재발급할까요? 옛 코드로 가입한 학생은 앱에서 비활성화되며, 새 코드로 다시 입력해야 합니다.',
      )
    )
      return
    setRegeneratingSetId(wid)
    try {
      let code = generateInviteCode()
      let lastErr = null
      for (let attempt = 0; attempt < 15; attempt++) {
        const { error: upErr } = await supabase
          .from('word_sets')
          .update({ invite_code: code })
          .eq('id', wid)
          .eq('teacher_id', teacherId)
        if (!upErr) {
          lastErr = null
          break
        }
        lastErr = upErr
        const msg = String(upErr.message || '').toLowerCase()
        if (msg.includes('unique') || msg.includes('duplicate')) {
          code = generateInviteCode()
          continue
        }
        throw new Error(upErr.message)
      }
      if (lastErr) throw new Error(lastErr.message)
      const { error: delErr } = await supabase.from('student_set_access').delete().eq('set_id', wid)
      if (delErr) throw new Error(delErr.message)
      setSets((prev) => prev.map((row) => (String(row.id) === wid ? { ...row, invite_code: code } : row)))
      showToast(
        '초대코드를 다시 발급했어요. 옛 코드로 가입한 학생은 새 코드를 입력해야 해요.',
        'success',
        4200,
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : '재발급에 실패했어요', 'error', 4000)
    } finally {
      setRegeneratingSetId(null)
    }
  }

  const handleDeleteSet = async (setName, e) => {
    e?.preventDefault()
    e?.stopPropagation()
    const sn = String(setName || '').trim()
    if (!teacherId || !sn) return
    const msg =
      `'${sn}' 전체를 삭제하시겠습니까?\n\n` +
      `이 세트의 모든 단어가 함께 삭제됩니다.\n` +
      `이 작업은 되돌릴 수 없습니다.`
    if (!window.confirm(msg)) return

    const { error: errWords } = await supabase
      .from('words')
      .delete()
      .eq('teacher_id', teacherId)
      .eq('set_name', sn)
    if (errWords) {
      alert(`단어 삭제 실패: ${errWords.message}`)
      return
    }

    const { error: errSets } = await supabase.from('word_sets').delete().eq('teacher_id', teacherId).eq('name', sn)
    if (errSets) {
      console.warn('[word_sets delete]', errSets.message)
    }

    setSettingsSetName((prev) => (prev === sn ? null : prev))
    void loadSets()
    void loadCounts()
    void loadRoutines()
    showToast(`✓ '${sn}' 세트가 삭제되었습니다`, 'success', 3000)
  }

  const setTypeByName = useMemo(() => {
    const m = {}
    for (const s of sets) {
      const n = String(s.name || '').trim()
      if (n) m[n] = normalizeSetType(s.set_type || 'word')
    }
    return m
  }, [sets])

  useEffect(() => {
    if (!settingsSetName || !teacherId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('words')
        .select('image_url')
        .eq('teacher_id', teacherId)
        .eq('set_name', settingsSetName)
        .not('image_url', 'is', null)
        .limit(1)
      if (cancelled) return
      const hasImage = Boolean(data?.some((r) => r.image_url && String(r.image_url).trim()))
      setSettingsMeta({
        name: settingsSetName,
        inferred: setTypeByName[settingsSetName] || 'word',
        hasImage,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [settingsSetName, teacherId, setTypeByName])

  const routinesBySetName = useMemo(() => {
    const m = new Map()
    for (const r of routines) {
      const sn = String(r.set_name || '').trim()
      if (!sn) continue
      if (!m.has(sn)) m.set(sn, [])
      m.get(sn).push(r)
    }
    return m
  }, [routines])

  if (teacherLoading) {
    return (
      <div style={{ minHeight: '40vh', padding: '8px 0 24px' }}>
        <p style={{ color: COLORS.textSecondary }}>선생님 정보를 확인하는 중…</p>
      </div>
    )
  }

  if (!teacherId) {
    return (
      <div style={{ minHeight: '40vh', padding: '8px 0 24px' }}>
        <p style={{ color: COLORS.textSecondary }}>
          로그인한 이메일에 해당하는 선생님(teachers 테이블) 정보가 없습니다. Supabase에서 이메일을 등록했는지 확인해 주세요.
        </p>
        <Link href="/teacher/monitor" style={{ color: COLORS.primary, fontSize: 14 }}>
          ← 모니터
        </Link>
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '100%',
        minHeight: '100%',
        fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      }}
    >
      <header
        className="teacher-page-header-bleed"
        style={{
          marginBottom: 24,
          padding: '14px 18px',
          borderRadius: RADIUS.lg,
          background: COLORS.headerGradient,
          color: COLORS.textOnGreen,
          boxShadow: SHADOW.card,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/teacher/monitor" style={{ color: COLORS.textOnGreen, fontSize: 14, opacity: 0.95 }}>
            ← 모니터
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>단어 세트</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link
            href="/teacher/words/create"
            style={{
              padding: '12px 18px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: COLORS.textOnGreen,
              color: COLORS.primaryDark,
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: 15,
              textDecoration: 'none',
            }}
          >
            + 새 세트 만들기
          </Link>
        </div>
      </header>

      {loading ? (
        <p style={{ color: COLORS.textSecondary }}>세트 목록을 불러오는 중…</p>
      ) : sets.length === 0 ? (
        <div
          style={{
            padding: 32,
            borderRadius: RADIUS.lg,
            border: `1px dashed ${COLORS.border}`,
            background: COLORS.surface,
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 16px', color: COLORS.textSecondary, fontSize: 16 }}>
            아직 등록된 세트가 없어요. 새 세트를 만들어 보세요.
          </p>
          <Link
            href="/teacher/words/create"
            style={{
              display: 'inline-block',
              padding: '12px 20px',
              borderRadius: RADIUS.md,
              background: COLORS.headerGradient,
              color: COLORS.textOnGreen,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            + 새 세트 만들기
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: 20,
          }}
        >
          <button
            type="button"
            onClick={() => router.push('/teacher/words/create')}
            style={{
              minHeight: 240,
              borderRadius: RADIUS.lg,
              border: `2px dashed ${COLORS.border}`,
              background: COLORS.bg,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 20,
              color: COLORS.accentText,
              fontSize: 17,
              fontWeight: 800,
            }}
          >
            <span style={{ fontSize: 36, lineHeight: 1 }}>＋</span>
            새 세트 만들기
          </button>
          {sets.map((s) => {
            const name = String(s.name || '').trim()
            const cnt = countsByName[name] ?? 0
            const invite = s.invite_code != null ? String(s.invite_code).trim() : ''
            const st = normalizeSetType(s.set_type || 'word')
            const setRoutines = routinesBySetName.get(name) || []
            const busyRe = regeneratingSetId === String(s.id)
            return (
              <div
                key={s.id}
                style={{
                  borderRadius: RADIUS.lg,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.surface,
                  boxShadow: SHADOW.card,
                  padding: 22,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  textAlign: 'left',
                  minHeight: 280,
                }}
              >
                <div style={{ fontSize: 19, fontWeight: 800, color: COLORS.accentText, lineHeight: 1.35 }}>
                  {name}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textSecondary }}>
                  단어 {cnt}개
                </div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.45 }}>
                  학습 모드: {formatAvailableModesSummary(s.available_modes, st)}
                </div>
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: RADIUS.md,
                    border: `1px solid ${COLORS.border}`,
                    background: COLORS.bg,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.accentText }}>
                    루틴 {setRoutines.length}개
                  </div>
                  {setRoutines.length === 0 ? (
                    <span style={{ fontSize: 13, color: COLORS.textHint }}>등록된 루틴이 없어요</span>
                  ) : (
                    <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {setRoutines.map((r) => (
                        <li key={r.id} style={{ fontSize: 13, color: COLORS.textPrimary }}>
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/teacher/words/${s.id}?editRoutine=${encodeURIComponent(String(r.id))}`)
                            }
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              color: COLORS.primary,
                              fontWeight: 700,
                              fontSize: 13,
                              textAlign: 'left',
                              textDecoration: 'underline',
                            }}
                          >
                            {String(r.title || '').trim() || '이름 없음'} ({Number(r.total_days) || 0}일)
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => router.push(`/teacher/words/${s.id}?newRoutine=1`)}
                    style={{
                      alignSelf: 'flex-start',
                      marginTop: 4,
                      padding: '8px 12px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${COLORS.primary}`,
                      background: COLORS.primarySoft,
                      fontWeight: 700,
                      fontSize: 13,
                      color: COLORS.accentText,
                      cursor: 'pointer',
                    }}
                  >
                    + 새 루틴
                  </button>
                </div>
                <div
                  style={{
                    padding: '12px 12px',
                    borderRadius: RADIUS.md,
                    border: `1px solid ${COLORS.border}`,
                    background: COLORS.bg,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 8 }}>
                    학생 초대코드
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'stretch' }}>
                    <code
                      style={{
                        flex: '1 1 120px',
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: 15,
                        fontWeight: 800,
                        wordBreak: 'break-all',
                        padding: '6px 0',
                      }}
                    >
                      {invite || '—'}
                    </code>
                    <button
                      type="button"
                      disabled={!invite}
                      onClick={() => void copyInvite(invite)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${COLORS.border}`,
                        background: COLORS.surface,
                        cursor: invite ? 'pointer' : 'not-allowed',
                        fontWeight: 700,
                        opacity: invite ? 1 : 0.45,
                      }}
                    >
                      복사
                    </button>
                    <button
                      type="button"
                      disabled={busyRe}
                      onClick={(e) => void handleRegenerateInvite(s, e)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: RADIUS.sm,
                        border: `1px solid ${COLORS.accentText}`,
                        background: COLORS.primarySoft,
                        cursor: busyRe ? 'wait' : 'pointer',
                        fontWeight: 700,
                        fontSize: 13,
                        color: COLORS.accentText,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {busyRe ? '…' : '재발급'}
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 'auto',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/teacher/words/${s.id}`)}
                    style={{
                      padding: '10px 8px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${COLORS.primary}`,
                      background: COLORS.primarySoft,
                      fontWeight: 800,
                      cursor: 'pointer',
                      color: COLORS.accentText,
                      fontSize: 13,
                    }}
                  >
                    상세 페이지
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsSetName(name)}
                    style={{
                      padding: '10px 8px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${COLORS.border}`,
                      background: COLORS.bg,
                      fontWeight: 700,
                      cursor: 'pointer',
                      color: COLORS.accentText,
                      fontSize: 13,
                    }}
                  >
                    설정 변경
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void handleDeleteSet(name, e)}
                    style={{
                      padding: '10px 8px',
                      borderRadius: RADIUS.sm,
                      border: `1px solid ${COLORS.danger}`,
                      background: COLORS.dangerBg,
                      fontWeight: 700,
                      cursor: 'pointer',
                      color: COLORS.danger,
                      fontSize: 13,
                    }}
                  >
                    세트 삭제
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <SetSettingsModal
        open={Boolean(settingsSetName)}
        onClose={() => setSettingsSetName(null)}
        setName={settingsSetName || ''}
        teacherId={teacherId}
        inferredSetType={settingsMeta.inferred || 'word'}
        hasImageWords={settingsMeta.hasImage}
        onSaved={() => {
          void loadSets()
          void loadCounts()
          void loadRoutines()
        }}
        onRenamed={(oldName, newName) => {
          const o = String(oldName || '').trim()
          const n = String(newName || '').trim()
          setSettingsSetName(n || null)
          setSets((prev) =>
            prev.map((row) => (String(row.name || '').trim() === o ? { ...row, name: n } : row)),
          )
          void loadCounts()
          void loadRoutines()
        }}
      />
    </div>
  )
}
