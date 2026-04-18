'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { COLORS, RADIUS } from '@/utils/tokens';

/**
 * 드래그·클릭 업로드 + 미리보기 (pending File 기준)
 * @param {{ existingUrl?: string | null, pendingFile: File | null, onFileChange: (f: File | null) => void, disabled?: boolean, inputId?: string }} props
 */
export default function AcademyLogoDropzone({
  existingUrl,
  pendingFile,
  onFileChange,
  disabled = false,
  inputId = 'academy-logo-input',
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const [objectUrl, setObjectUrl] = useState(null);

  useEffect(() => {
    if (!pendingFile) {
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return undefined;
    }
    const u = URL.createObjectURL(pendingFile);
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return u;
    });
    return () => URL.revokeObjectURL(u);
  }, [pendingFile]);

  const previewSrc = objectUrl || (existingUrl && !pendingFile ? existingUrl : null);

  const pickFile = useCallback(
    (fileList) => {
      const f = fileList?.[0];
      if (!f || !f.type.startsWith('image/')) return;
      onFileChange(f);
    },
    [onFileChange],
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (disabled) return;
      pickFile(e.dataTransfer?.files);
    },
    [disabled, pickFile],
  );

  return (
    <div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        disabled={disabled}
        onChange={(e) => {
          pickFile(e.target.files);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={onDrop}
        style={{
          width: '100%',
          minHeight: 120,
          borderRadius: RADIUS.md,
          border: `2px dashed ${dragOver ? COLORS.primary : COLORS.border}`,
          background: dragOver ? COLORS.primarySoft : COLORS.surface,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 16,
          boxSizing: 'border-box',
        }}
      >
        {previewSrc ? (
          <img
            src={previewSrc}
            alt="학원 로고 미리보기"
            style={{
              maxWidth: '100%',
              maxHeight: 100,
              objectFit: 'contain',
              borderRadius: RADIUS.sm,
            }}
          />
        ) : (
          <span style={{ fontSize: 13, color: COLORS.textSecondary }}>
            이미지를 드래그하거나 클릭하여 선택
          </span>
        )}
        <span style={{ fontSize: 12, color: COLORS.textHint }}>PNG, JPG, WEBP 등 (저장 시 업로드)</span>
      </button>
    </div>
  );
}
