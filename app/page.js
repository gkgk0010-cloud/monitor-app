import Link from 'next/link';
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens';

export default function Home() {
  const cardStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
    minHeight: 120,
    padding: '24px 32px',
    borderRadius: RADIUS.lg,
    background: COLORS.surface,
    border: `2px solid ${COLORS.primaryLight}`,
    boxShadow: SHADOW.card,
    textDecoration: 'none',
    color: COLORS.accentText,
    fontSize: 18,
    fontWeight: 700,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 12,
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 800, color: COLORS.accentText, marginBottom: 4 }}>
        똑패스 관리
      </h1>
      <p style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 28 }}>
        이동할 화면을 선택하세요
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          justifyContent: 'center',
          maxWidth: 520,
        }}
      >
        <Link
          href="/teacher/monitor"
          style={cardStyle}
          className="home-menu-card"
        >
          <span style={{ fontSize: 36, marginBottom: 8 }}>📊</span>
          실시간 모니터
        </Link>
        <Link
          href="/teacher/words"
          style={{
            ...cardStyle,
            border: 'none',
            background: COLORS.headerGradient,
            color: COLORS.textOnGreen,
            boxShadow: '0 4px 20px rgba(102, 126, 234, 0.35)',
          }}
          className="home-menu-card"
        >
          <span style={{ fontSize: 36, marginBottom: 8 }}>📚</span>
          단어 관리
        </Link>
        <Link
          href="/teacher/words/create"
          style={cardStyle}
          className="home-menu-card"
        >
          <span style={{ fontSize: 36, marginBottom: 8 }}>➕</span>
          새 세트 만들기
        </Link>
      </div>
    </div>
  );
}
