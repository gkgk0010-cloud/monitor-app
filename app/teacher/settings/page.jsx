'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/utils/supabaseClient';
import { useTeacher } from '@/utils/useTeacher';
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens';
import AcademyLogoDropzone from '@/app/teacher/components/AcademyLogoDropzone';
import { uploadAndAssignAcademyLogo, clearTeacherAcademyLogo } from '@/utils/academyStorage';

export default function TeacherSettingsPage() {
  const { teacher, loading, refresh } = useTeacher();
  const [academyName, setAcademyName] = useState('');
  const [pendingLogoFile, setPendingLogoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!teacher) return;
    setAcademyName(teacher.academy_name != null ? String(teacher.academy_name) : '');
  }, [teacher]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3200);
  }, []);

  const handleSave = async () => {
    if (!teacher?.id) {
      setError('선생님 정보를 불러오지 못했습니다.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const nameTrim = academyName.trim();

      if (pendingLogoFile) {
        try {
          await uploadAndAssignAcademyLogo(teacher.id, pendingLogoFile, teacher.academy_logo_url || null);
        } catch (logoErr) {
          console.warn('[settings] 로고 업로드 실패:', logoErr);
          showToast('로고 업로드에 실패했습니다. 학원명만 저장합니다.');
        }
        setPendingLogoFile(null);
      }

      const { error: upErr } = await supabase
        .from('teachers')
        .update({ academy_name: nameTrim || null })
        .eq('id', teacher.id);

      if (upErr) {
        setError(upErr.message || '저장에 실패했습니다.');
        setSaving(false);
        return;
      }

      showToast('저장되었습니다.');
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
      showToast('로고를 삭제했습니다.');
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

      {toast ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 20px',
            borderRadius: RADIUS.lg,
            background: 'rgba(55, 48, 163, 0.92)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            boxShadow: SHADOW.modal,
            zIndex: 20000,
          }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
