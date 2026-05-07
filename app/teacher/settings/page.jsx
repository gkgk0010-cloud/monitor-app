'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/utils/supabaseClient';
import { useTeacher } from '@/utils/useTeacher';
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens';
import AcademyLogoDropzone from '@/app/teacher/components/AcademyLogoDropzone';
import { uploadAndAssignAcademyLogo, clearTeacherAcademyLogo } from '@/utils/academyStorage';
import { insertAcademyRowForName, normalizeTeachingType } from '@/utils/teacherSignup';
import { showToast } from '@/utils/toastBus';

const ACADEMY_QT_KEYS = [
  { key: 'word_to_meaning', label: '단어 → 뜻' },
  { key: 'meaning_to_word', label: '뜻 → 단어' },
  { key: 'image_to_word', label: '이미지 → 단어' },
];

function normalizeTeacherQt(raw) {
  const allow = new Set(ACADEMY_QT_KEYS.map((x) => x.key));
  if (raw == null) return ['word_to_meaning'];
  const arr = Array.isArray(raw) ? raw : [];
  const next = arr.map((x) => String(x).trim()).filter((k) => allow.has(k));
  return next.length > 0 ? next : ['word_to_meaning'];
}

export default function TeacherSettingsPage() {
  const { teacher, loading, refresh } = useTeacher();
  const [academyName, setAcademyName] = useState('');
  const [defaultTestSecondsInput, setDefaultTestSecondsInput] = useState('');
  const [defaultTestQCountInput, setDefaultTestQCountInput] = useState('');
  const [defaultTestPassInput, setDefaultTestPassInput] = useState('');
  const [defaultTestAttemptsInput, setDefaultTestAttemptsInput] = useState('');
  const [defaultTestQt, setDefaultTestQt] = useState(() => ['word_to_meaning']);
  const [pendingLogoFile, setPendingLogoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!teacher) return;
    setAcademyName(teacher.academy_name != null ? String(teacher.academy_name) : '');
    const v = teacher.default_test_time_per_word;
    if (v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0) {
      setDefaultTestSecondsInput(String(Math.floor(Number(v))));
    } else {
      setDefaultTestSecondsInput('');
    }
    const qc = teacher.default_test_question_count;
    if (qc != null && qc !== '' && Number.isFinite(Number(qc))) {
      setDefaultTestQCountInput(String(Math.max(0, Math.min(100, Math.floor(Number(qc))))));
    } else {
      setDefaultTestQCountInput('');
    }
    const ps = teacher.default_test_pass_score;
    if (ps != null && ps !== '' && Number.isFinite(Number(ps))) {
      setDefaultTestPassInput(String(Math.max(0, Math.min(100, Math.floor(Number(ps))))));
    } else {
      setDefaultTestPassInput('');
    }
    const ma = teacher.default_test_max_attempts;
    if (ma != null && ma !== '' && Number.isFinite(Number(ma))) {
      setDefaultTestAttemptsInput(String(Math.max(1, Math.floor(Number(ma)))));
    } else {
      setDefaultTestAttemptsInput('');
    }
    setDefaultTestQt(normalizeTeacherQt(teacher.default_test_question_types));
  }, [teacher]);

  const handleSave = async () => {
    if (!teacher?.id) {
      setError('선생님 정보를 불러오지 못했습니다.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const nameTrim = academyName.trim();

      const rawTestSec = defaultTestSecondsInput.trim();
      let defaultTestPerWord = null;
      if (rawTestSec !== '') {
        const tn = parseInt(rawTestSec, 10);
        if (!Number.isFinite(tn) || tn < 1 || tn > 600) {
          setError('테스트 단어당 기본 시간은 1~600초이거나 비워 두세요.');
          setSaving(false);
          return;
        }
        defaultTestPerWord = tn;
      }

      const rawQc = defaultTestQCountInput.trim();
      let defaultTestQuestionCount = null;
      if (rawQc !== '') {
        const qn = parseInt(rawQc, 10);
        if (!Number.isFinite(qn) || qn < 0 || qn > 100) {
          setError('기본 출제 문항 수는 0~100 또는 비워 두세요(비우면 학생 앱 기본 0 = Day 전체).');
          setSaving(false);
          return;
        }
        defaultTestQuestionCount = qn;
      }

      const rawPs = defaultTestPassInput.trim();
      let defaultTestPassScore = null;
      if (rawPs !== '') {
        const pn = parseInt(rawPs, 10);
        if (!Number.isFinite(pn) || pn < 0 || pn > 100) {
          setError('기본 통과 점수는 0~100 또는 비워 두세요(비우면 70%).');
          setSaving(false);
          return;
        }
        defaultTestPassScore = pn;
      }

      const rawMa = defaultTestAttemptsInput.trim();
      let defaultTestMaxAttempts = null;
      if (rawMa !== '') {
        const mn = parseInt(rawMa, 10);
        if (!Number.isFinite(mn) || mn < 1 || mn > 99) {
          setError('기본 최대 시도는 1~99 또는 비워 두세요(비우면 3회).');
          setSaving(false);
          return;
        }
        defaultTestMaxAttempts = mn;
      }

      const defaultTestQuestionTypes = defaultTestQt.length > 0 ? defaultTestQt : ['word_to_meaning'];

      if (pendingLogoFile) {
        try {
          await uploadAndAssignAcademyLogo(teacher.id, pendingLogoFile, teacher.academy_logo_url || null);
        } catch (logoErr) {
          console.warn('[settings] 로고 업로드 실패:', logoErr);
          showToast('로고 업로드에 실패했습니다. 학원명만 저장합니다.', 'error', 3800);
        }
        setPendingLogoFile(null);
      }

      const teacherPayload = {
        academy_name: nameTrim || null,
        default_test_time_per_word: defaultTestPerWord,
        default_test_question_count: defaultTestQuestionCount,
        default_test_pass_score: defaultTestPassScore,
        default_test_max_attempts: defaultTestMaxAttempts,
        default_test_question_types: defaultTestQuestionTypes,
      };

      if (nameTrim) {
        if (teacher.academy_id) {
          const { error: acUp } = await supabase
            .from('academies')
            .update({ name: nameTrim })
            .eq('id', teacher.academy_id);
          if (acUp) {
            setError(acUp.message || '학원 이름 저장에 실패했습니다.');
            setSaving(false);
            return;
          }
        } else {
          const ac = await insertAcademyRowForName(nameTrim, normalizeTeachingType(teacher.teaching_type));
          if (!ac.ok) {
            setError(ac.error?.message || '학원 등록에 실패했습니다.');
            setSaving(false);
            return;
          }
          teacherPayload.academy_id = ac.academyId;
        }
      }

      const { error: upErr } = await supabase.from('teachers').update(teacherPayload).eq('id', teacher.id);

      if (upErr) {
        setError(upErr.message || '저장에 실패했습니다.');
        setSaving(false);
        return;
      }

      showToast('저장되었습니다.', 'success', 3000);
      await refresh();
    } catch (e) {
      setError(e?.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!teacher?.id) return;
    setError('');
    setSaving(true);
    try {
      await clearTeacherAcademyLogo(teacher.id, teacher.academy_logo_url || null);
      setPendingLogoFile(null);
      showToast('로고를 삭제했습니다.', 'success', 3000);
      await refresh();
    } catch (e) {
      setError(e?.message || '로고 삭제에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 24, maxWidth: 560, margin: '0 auto' }}>
        <p style={{ color: COLORS.textSecondary }}>불러오는 중…</p>
      </div>
    );
  }

  if (!teacher) {
    return (
      <div style={{ padding: 24, maxWidth: 560, margin: '0 auto' }}>
        <p style={{ color: COLORS.danger }}>선생님 정보를 찾을 수 없습니다.</p>
        <Link href="/teacher/monitor" style={{ color: COLORS.primary, fontWeight: 600 }}>
          모니터로
        </Link>
      </div>
    );
  }

  const hasSavedLogo = Boolean(teacher.academy_logo_url) && !pendingLogoFile;

  return (
    <div style={{ padding: '24px 20px 48px', maxWidth: 560, margin: '0 auto' }}>
      <div
        style={{
          padding: '28px 24px',
          borderRadius: RADIUS.xl,
          background: COLORS.surface,
          boxShadow: SHADOW.modal,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: COLORS.textPrimary }}>
          학원 설정
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.5 }}>
          학원명과 로고는 리포트·상단 메뉴에 표시됩니다. 로고는 저장 버튼을 눌러야 서버에 반영됩니다.
        </p>

        <div
          style={{
            marginBottom: 20,
            padding: '14px 16px',
            borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.bg,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 6 }}>
            강의 유형
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, lineHeight: 1.45 }}>
            {teacher.teaching_type === 'toeic'
              ? '토익 강의 위주 (토익 전용 메뉴)'
              : teacher.teaching_type === 'general'
                ? '일반 어학원 (단어 학습 중심)'
                : '— (미설정 · 회원가입 이전 계정일 수 있음)'}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5 }}>
            회원가입 시 선택한 유형입니다. 학생 앱 메뉴 노출은「단어 관리」→ 메뉴 설정에서 변경할 수 있습니다.
          </p>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label
            htmlFor="academy-name"
            style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 6 }}
          >
            학원명
          </label>
          <input
            id="academy-name"
            type="text"
            value={academyName}
            onChange={(e) => setAcademyName(e.target.value)}
            placeholder="예: 똑패스 영어학원"
            disabled={saving}
            style={{
              width: '100%',
              padding: '12px 14px',
              fontSize: 15,
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label
            htmlFor="default-test-sec"
            style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 6 }}
          >
            테스트 단어당 기본 시간 (초)
          </label>
          <input
            id="default-test-sec"
            type="number"
            min={1}
            max={600}
            value={defaultTestSecondsInput}
            onChange={(e) => setDefaultTestSecondsInput(e.target.value)}
            placeholder="비워 두면 학생 앱 기본 15초"
            disabled={saving}
            style={{
              width: '100%',
              maxWidth: 200,
              padding: '12px 14px',
              fontSize: 15,
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5 }}>
            객관식 테스트 모드의 문항당 제한 시간입니다. 세트에서 별도 지정이 없을 때 적용됩니다.
          </p>
        </div>

        <div style={{ marginBottom: 18 }}>
          <span
            style={{ display: 'block', fontSize: 13, fontWeight: 700, color: COLORS.accentText, marginBottom: 10 }}
          >
            객관식 테스트 학원 기본
          </span>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5 }}>
            세트에 별도 값이 없을 때 학생 앱에 적용됩니다. 세트별 상세는 단어 목록 상단의 테스트 설정에서 합니다.
          </p>

          <label
            htmlFor="default-test-qcount"
            style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 6 }}
          >
            기본 출제 문항 수 (0 = 해당 Day 전체)
          </label>
          <input
            id="default-test-qcount"
            type="number"
            min={0}
            max={100}
            value={defaultTestQCountInput}
            onChange={(e) => setDefaultTestQCountInput(e.target.value)}
            placeholder="비우면 0"
            disabled={saving}
            style={{
              width: '100%',
              maxWidth: 200,
              padding: '12px 14px',
              fontSize: 15,
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 14,
            }}
          />

          <label
            htmlFor="default-test-pass"
            style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 6 }}
          >
            기본 통과 점수 (%)
          </label>
          <input
            id="default-test-pass"
            type="number"
            min={0}
            max={100}
            value={defaultTestPassInput}
            onChange={(e) => setDefaultTestPassInput(e.target.value)}
            placeholder="비우면 70"
            disabled={saving}
            style={{
              width: '100%',
              maxWidth: 200,
              padding: '12px 14px',
              fontSize: 15,
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 14,
            }}
          />

          <label
            htmlFor="default-test-att"
            style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 6 }}
          >
            기본 최대 시도 횟수
          </label>
          <input
            id="default-test-att"
            type="number"
            min={1}
            max={99}
            value={defaultTestAttemptsInput}
            onChange={(e) => setDefaultTestAttemptsInput(e.target.value)}
            placeholder="비우면 3"
            disabled={saving}
            style={{
              width: '100%',
              maxWidth: 200,
              padding: '12px 14px',
              fontSize: 15,
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 14,
            }}
          />

          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 8 }}>
            기본 출제 방식 (복수)
          </span>
          <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0, display: 'grid', gap: 8 }}>
            {ACADEMY_QT_KEYS.map(({ key, label }) => {
              const checked = defaultTestQt.includes(key);
              return (
                <li key={key}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={saving}
                      onChange={() => {
                        setDefaultTestQt((prev) => {
                          if (prev.includes(key)) {
                            if (prev.length <= 1) return prev;
                            return prev.filter((x) => x !== key);
                          }
                          return [...prev, key];
                        });
                      }}
                    />
                    {label}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div style={{ marginBottom: 16 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 8 }}>
            학원 로고
          </span>
          <AcademyLogoDropzone
            existingUrl={pendingLogoFile ? null : teacher.academy_logo_url}
            pendingFile={pendingLogoFile}
            onFileChange={setPendingLogoFile}
            disabled={saving}
            inputId="settings-academy-logo"
          />
        </div>

        {hasSavedLogo ? (
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleDeleteLogo()}
              style={{
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: 600,
                color: COLORS.danger,
                background: COLORS.dangerBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.md,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              로고 삭제
            </button>
          </div>
        ) : null}

        {error ? (
          <p style={{ fontSize: 13, color: COLORS.danger, margin: '0 0 12px' }} role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          style={{
            padding: '14px 18px',
            fontSize: 15,
            fontWeight: 700,
            color: COLORS.textOnGreen,
            border: 'none',
            borderRadius: RADIUS.md,
            background: COLORS.headerGradient,
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.85 : 1,
            width: '100%',
          }}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  );
}
