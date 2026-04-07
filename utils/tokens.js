/**
 * 똑패스 톤: globals.css 의 --primary / --primary-gradient 와 통일 (보라·인디고 계열)
 */
export const COLORS = {
  primary: '#5b7cfa',
  primaryDark: '#4a6ae8',
  primaryLight: '#e0e7ff',
  primarySoft: '#f5f3ff',
  /** 헤더·강조 배경 (똑패스 메인 그라데이션) */
  headerGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  accentText: '#3730a3',
  bg: '#f8f7fc',
  surface: '#ffffff',
  border: '#e5e7eb',
  textPrimary: '#3d405b',
  textSecondary: '#64748b',
  textHint: '#a8a4b8',
  /** 보라 배경 위 텍스트·테두리용 (흰색) */
  textOnGreen: '#ffffff',
  danger: '#ea4335',
  dangerBg: '#fef2f2',
  warning: '#f59e0b',
  warningBg: '#fffbeb',
  /** 선택 행·연한 강조 (연보라) */
  successBg: '#f5f3ff',
}

export const RADIUS = { sm: '6px', md: '10px', lg: '14px', xl: '20px' }
export const SHADOW = {
  card: '0 1px 3px rgba(91, 124, 250, 0.12)',
  modal: '0 4px 24px rgba(67, 56, 202, 0.14)',
}
