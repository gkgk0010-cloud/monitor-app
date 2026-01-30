'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/utils/supabaseClient';

const COLOR_ORDER = { gold: 0, red: 1, orange: 2, blue: 3, green: 4, purple: 5, white: 6 };
const MAIN_ZONE_MAX = 30;
const LOG_LIMIT = 20;

const STATUS_STYLE = {
  gold: { border: '#d4af37', bg: 'linear-gradient(135deg, #fffef0 0%, #fff9e6 50%, #fff4d6 100%)', badge: '#d4af37', label: '🏆 MVP', defaultMent: '🏆 일일 할당량(50문제) 클리어!' },
  red: { border: '#ea4335', bg: 'linear-gradient(135deg, #fce8e6 0%, #f9d5d2 100%)', badge: '#ea4335', label: '위험', defaultMent: '🔴 3연속 오답' },
  orange: { border: '#ea580c', bg: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', badge: '#ea580c', label: '경고', defaultMent: '경고 상태' },
  blue: { border: '#2575fc', bg: 'linear-gradient(135deg, #e6f4ea 0%, #c8e6d3 100%)', badge: '#34a853', label: '우수', defaultMent: '🔥 열공 모드 (20문제+)' },
  green: { border: '#22c55e', bg: 'linear-gradient(135deg, #e6f4ea 0%, #c8e6d3 100%)', badge: '#22c55e', label: '복습완료', defaultMent: '✅ 복습 완료' },
  purple: { border: '#8b5cf6', bg: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)', badge: '#8b5cf6', label: '새벽반', defaultMent: '🟣 새벽반' },
  white: { border: 'rgba(255,255,255,0.6)', bg: 'rgba(255, 255, 255, 0.92)', badge: '#64748b', label: '정상', defaultMent: '접속 중' },
};

function getDisplayMent(row, style) {
  const raw = (row.info_text || '').trim();
  const isPlaceholder = /상태\s*설명|예:\s*["']/.test(raw) || raw === '';
  if (isPlaceholder) return (style && style.defaultMent) || '접속 중';
  return raw;
}

function sortStudents(rows) {
  return [...(rows || [])].sort((a, b) => (COLOR_ORDER[a.student_color] ?? 99) - (COLOR_ORDER[b.student_color] ?? 99));
}

function splitZones(sorted) {
  return { main: sorted.slice(0, MAIN_ZONE_MAX), safe: sorted.slice(MAIN_ZONE_MAX) };
}

function toUTCThenKorea(ts) {
  if (ts == null) return null;
  let s = typeof ts === 'string' ? ts.trim() : String(ts);
  if (!s) return null;
  if (s.endsWith('Z') || s.includes('+') || /-\d{2}:\d{2}$/.test(s)) return new Date(s);
  s = s.replace(/\s+/, 'T');
  if (!s.includes('T')) s += 'T00:00:00';
  return new Date(s + 'Z');
}

function formatActive(ts) {
  if (!ts) return '';
  try {
    const d = toUTCThenKorea(ts);
    if (!d || isNaN(d.getTime())) return String(ts);
    return d.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

function formatLogTime(ts) {
  if (!ts) return '--:--';
  try {
    const d = toUTCThenKorea(ts);
    if (!d || isNaN(d.getTime())) return String(ts);
    return d.toLocaleTimeString('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return String(ts);
  }
}

function isTodayKorea(ts) {
  if (!ts) return false;
  try {
    const d = toUTCThenKorea(ts);
    if (!d || isNaN(d.getTime())) return false;
    const opt = { timeZone: 'Asia/Seoul' };
    const dStr = d.toLocaleDateString('ko-KR', opt);
    const nowStr = new Date().toLocaleDateString('ko-KR', opt);
    return dStr === nowStr;
  } catch {
    return false;
  }
}

function isAbsent2Days(ts) {
  if (!ts) return true;
  try {
    const d = toUTCThenKorea(ts);
    if (!d || isNaN(d.getTime())) return true;
    const opt = { timeZone: 'Asia/Seoul' };
    const lastStr = d.toLocaleDateString('en-CA', opt);
    const todayStr = new Date().toLocaleDateString('en-CA', opt);
    const [y, m, day] = todayStr.split('-').map(Number);
    const cutoffDate = new Date(Date.UTC(y, m - 1, day - 2));
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);
    return lastStr <= cutoffStr;
  } catch {
    return false;
  }
}

function getKakaoMent(row, style) {
  const name = (row.student_name || '').trim() || '이름없음';
  const color = row.student_color || 'white';
  const info = (row.info_text || '').trim();
  const isShotgun = /샷건|직후\s*5초|강제\s*종료/.test(info);
  const displayName = name + '님';
  switch (color) {
    case 'gold':
      return `${displayName}! 오늘 50문제 클리어 축하해용! 진짜 고생했어 :D 👍`;
    case 'blue':
      return `${displayName}!, 20문제 연속으로 달리는 거 봤어요. 오늘 기세 미쳤는데??? 🔥`;
    case 'red':
      return `${displayName}!, 방금 푼 문제들 좀 어려웠죠ㅠㅠ? 복습할 때 오답 체크 꼭 하고 넘어갑시당! 💪`;
    case 'purple': {
      let hourStr = '';
      try {
        if (row.last_active) {
          const d = toUTCThenKorea(row.last_active);
          if (d && !isNaN(d.getTime())) {
            const hourKorea = parseInt(d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false }), 10);
            if (hourKorea >= 1 && hourKorea < 5) hourStr = String(hourKorea);
          }
        }
      } catch (_) {}
      return hourStr
        ? `${displayName}... 지금 새벽 ${hourStr}시에 도 공부하넹!! 진짜 대단하구.. 응원해요 무리는 하지말기! 🌙`
        : `${displayName}... 새벽에 공부하넹!! 진짜 대단하구.. 응원해요 무리는 하지말기! 🌙`;
    }
    case 'green':
      return `${displayName}, 복습까지 깔끔하게 끝냈네요?? 완벽하다! :D 💯`;
    case 'white':
      return isShotgun
        ? `${displayName},, 오답 보고 바로 껐던데 혹시 열받은거 아니죠? ㅠㅠㅠ 조금만 더해보자~ 으쌰으쌰 💪`
        : `${displayName}, 오늘도 응원해!!`;
    case 'orange':
      return `${displayName}, 오늘도 응원해!!`;
    default:
      return `${displayName}, 오늘도 응원해!!`;
  }
}

export default function TeacherMonitorPage() {
  const [students, setStudents] = useState([]);
  const studentsRef = useRef([]);
  const [statusLogs, setStatusLogs] = useState([]);
  const [safeOpen, setSafeOpen] = useState(false);
  const [absent2Open, setAbsent2Open] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [copyToast, setCopyToast] = useState(null);

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  const copyToClipboard = async (text) => {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyToast('복사됨');
      setTimeout(() => setCopyToast(null), 2000);
    } catch {
      setCopyToast('복사 실패');
      setTimeout(() => setCopyToast(null), 2000);
    }
  };

  useEffect(() => {
    let channel;
    const fetchInitial = async () => {
      setFetchError(null);
      const { data, error } = await supabase.from('student_status').select('*');
      if (error) {
        setFetchError(error.message || 'Supabase 연결 실패');
        return;
      }
      setStudents(sortStudents(data ?? []));
    };
    fetchInitial();
    channel = supabase
      .channel('student_status_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_status' }, () => {
        supabase.from('student_status').select('*').then(({ data }) => setStudents(sortStudents(data ?? [])));
      })
      .subscribe();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from('status_logs')
        .select('id, student_name, event_type, message, created_at')
        .order('created_at', { ascending: false })
        .limit(LOG_LIMIT);
      if (!error) setStatusLogs(data ?? []);
    };
    fetchLogs();
    const ch = supabase
      .channel('status_logs_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'status_logs' }, fetchLogs)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const { main, safe } = splitZones(students);
  const absent2Days = students.filter((r) => isAbsent2Days(r.last_active));
  const style = STATUS_STYLE;
  const todaySurvivors = students.filter((r) => isTodayKorea(r.last_active));
  const todayAbsent = students.filter((r) => !isTodayKorea(r.last_active));

  const toInitialStyle = (name) => {
    const s = (name || '').trim();
    if (!s) return '○○○';
    return s.charAt(0) + '○○';
  };

  const handleCopyTodayStatus = async () => {
    const { data: list, error } = await supabase.from('student_status').select('student_name, last_active');
    if (error) {
      setCopyToast('조회 실패. 다시 눌러주세요.');
      setTimeout(() => setCopyToast(null), 3000);
      return;
    }
    const rows = Array.isArray(list) ? list : [];
    const survivors = rows.filter((r) => isTodayKorea(r.last_active));
    const absent = rows.filter((r) => !isTodayKorea(r.last_active));
    const survivorNames = survivors.map((r) => (r.student_name || '').trim() || '-').filter(Boolean);
    const absentInitials = absent.map((r) => toInitialStyle(r.student_name));
    const survN = survivorNames.length;
    const absentN = absentInitials.length;

    const parts = [
      '📜 [똑패스] 오늘의 현황판',
      '',
      `🤴 오늘의 공주,왕자님 (${survN}명)`,
      ...(survN > 0 ? survivorNames.map((name) => `· ${name}`) : []),
      '💬 "숙제 끝내고 꿀잠 예약 🛌 진짜 고생했어!"',
      '',
      `🍂 빈자리가 느껴져요 머쓱; (${absentN}명)`,
      ...(absentN > 0 ? [`· ${absentInitials.join(', ')}`] : []),
      '💬 "나 다 싶으면... 조용히 앱 켜기 (아직 안 늦음 😉)"',
    ];
    copyToClipboard(parts.join('\n'));
  };

  if (fetchError) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <h1 style={styles.title}>실시간 학생 모니터링</h1>
          <div style={styles.errorBox}>{fetchError}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="monitor-page" style={styles.page}>
      <div className="monitor-container" style={styles.container}>
        <header className="monitor-header" style={styles.header}>
          <h1 className="monitor-title" style={styles.title}>실시간 학생 모니터링</h1>
          <div style={styles.headerRight}>
            <button type="button" onClick={handleCopyTodayStatus} className="monitor-copy-btn" style={styles.copyBtn} title="오늘 출석·미접속 현황 한 번에 카톡용 복사">
              📢 오늘 출석·미접속 복사
            </button>
            <button type="button" onClick={() => setLegendOpen((o) => !o)} style={styles.legendBtn} aria-expanded={legendOpen}>
              ❓ 상태 설명
            </button>
            <span style={styles.liveBadge}><span style={styles.liveDot} /> 실시간</span>
          </div>
        </header>
        {copyToast && <div style={styles.toast}>{copyToast}</div>}

        {legendOpen && (
          <div style={styles.legendPanel}>
            {['gold', 'blue', 'green', 'purple', 'red', 'white'].map((key) => (
              <div key={key} style={{ ...styles.legendItem, borderLeftColor: style[key]?.border || '#ccc' }}>
                <span>{style[key]?.label || key}</span>
              </div>
            ))}
          </div>
        )}

        <section style={styles.section}>
          <h2 className="monitor-section-title" style={styles.sectionTitle}>집중 관리 존 <span style={styles.count}>(상위 {MAIN_ZONE_MAX}명)</span></h2>
          <div className="monitor-card-grid" style={styles.cardGrid}>
            {main.map((row) => {
              const s = style[row.student_color] || style.white;
              const isGold = row.student_color === 'gold';
              return (
                <div
                  key={row.id}
                  className={`monitor-card ${isGold ? 'card-gold-shimmer' : ''}`}
                  style={{
                    ...styles.card,
                    borderLeftColor: s.border,
                    borderLeftWidth: isGold ? 5 : 4,
                    background: s.bg,
                  }}
                >
                  <div style={styles.cardHeader}>
                    <span className="monitor-card-name" style={styles.cardName}>{row.student_name ?? '-'}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {isAbsent2Days(row.last_active) && <span style={styles.badgeAbsent2}>이틀 미접속</span>}
                      <span className="monitor-badge" style={{ ...styles.badge, background: s.badge }}>{s.label}</span>
                    </div>
                  </div>
                  {row.last_active != null && <div className="monitor-card-time" style={styles.cardTime} title="마지막 상태 반영 시각 (한국시간)">{formatActive(row.last_active)}</div>}
                  <div className="monitor-card-info" style={styles.cardInfo}>{getDisplayMent(row, s)}</div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(getKakaoMent(row, s))}
                    className="monitor-card-copy"
                    style={styles.cardCopyBtn}
                    title="카톡 멘트 복사"
                    aria-label="카톡 멘트 복사"
                  >
                    💬 복사
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>이틀 연속 미접속</h2>
          <div style={styles.absent2Bar} onClick={() => setAbsent2Open((o) => !o)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setAbsent2Open((o) => !o)}>
            <span>📅</span>
            <span>{absent2Days.length}명</span>
            <span style={{ marginLeft: 'auto' }}>{absent2Open ? '▲' : '▼'}</span>
          </div>
          {absent2Open && absent2Days.length > 0 && (
            <div style={styles.safeList}>
              {absent2Days.map((row) => {
                const s = style[row.student_color] || style.white;
                return (
                  <div key={row.id} style={styles.safeItem}>
                    <span style={styles.safeItemName}>{row.student_name ?? '-'}</span>
                    <span style={{ ...styles.badgeSmall, background: s.badge }}>{s.label}</span>
                    {row.last_active != null && <span style={styles.safeItemTime}>{formatActive(row.last_active)}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>안전 보관함</h2>
          <div style={styles.safeBar} onClick={() => setSafeOpen((o) => !o)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSafeOpen((o) => !o)}>
            <span>🟢</span>
            <span>외 {safe.length}명</span>
            <span style={{ marginLeft: 'auto' }}>{safeOpen ? '▲' : '▼'}</span>
          </div>
          {safeOpen && safe.length > 0 && (
            <div style={styles.safeList}>
              {safe.map((row) => {
                const s = style[row.student_color] || style.white;
                return (
                  <div key={row.id} style={styles.safeItem}>
                    <span style={styles.safeItemName}>{row.student_name ?? '-'}</span>
                    {isAbsent2Days(row.last_active) && <span style={styles.badgeAbsent2Small}>이틀 미접속</span>}
                    <span style={{ ...styles.badgeSmall, background: s.badge }}>{s.label}</span>
                    {row.last_active != null && <span style={styles.safeItemTime}>{formatActive(row.last_active)}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>📢 실시간 사건 기록 <span style={styles.count}>(최신 {LOG_LIMIT}건)</span></h2>
          <div style={styles.logList}>
            {statusLogs.length === 0 ? (
              <div style={styles.logEmpty}>아직 기록된 사건이 없어요.</div>
            ) : (
              statusLogs.map((row) => (
                <div key={row.id} style={styles.logItem}>
                  <span style={styles.logTime}>[{formatLogTime(row.created_at)}]</span>
                  <span style={styles.logName}>{row.student_name ?? '-'}</span>
                  <span style={styles.logSep}>-</span>
                  <span style={styles.logMessage}>{row.message ?? row.event_type ?? ''}</span>
                </div>
              ))
            )}
          </div>
        </section>
        {/* end sections */}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f3e7ff 0%, #eef2ff 100%)',
    padding: '24px 20px 48px',
    fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  },
  container: { maxWidth: 720, margin: '0 auto', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(12px)', borderRadius: 24, padding: '20px 24px 32px', boxShadow: '0 8px 32px rgba(31,38,135,0.05)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.5)' },
  title: { margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#374151' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  legendBtn: { padding: '6px 12px', border: '1px solid rgba(107,114,128,0.3)', borderRadius: 12, background: 'rgba(255,255,255,0.9)', fontSize: 12, cursor: 'pointer' },
  legendPanel: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20, padding: 12, background: 'rgba(255,255,255,0.9)', borderRadius: 16 },
  legendItem: { padding: '6px 12px', borderLeft: '4px solid', borderRadius: 8, fontSize: 12 },
  copyBtn: { padding: '6px 12px', border: '1px solid rgba(107,114,128,0.3)', borderRadius: 12, background: 'rgba(255,255,255,0.9)', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 },
  liveBadge: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#E8F5E9', borderRadius: 20, fontSize: 13, fontWeight: 600, color: '#2E7D32' },
  liveDot: { width: 8, height: 8, borderRadius: '50%', background: '#34a853' },
  toast: { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '10px 20px', background: '#374151', color: '#fff', borderRadius: 12, fontSize: 14, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' },
  section: { marginBottom: 28 },
  sectionTitle: { margin: '0 0 14px', paddingLeft: 14, borderLeft: '4px solid #6a11cb', fontSize: '1rem', fontWeight: 700, color: '#374151' },
  count: { fontWeight: 500, color: '#6b7280', fontSize: '0.9rem' },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 14 },
  card: { padding: 20, borderRadius: 24, borderLeft: '4px solid', boxShadow: '0 8px 32px rgba(100,100,255,0.1)' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  cardName: { fontWeight: 700, fontSize: '1rem', color: '#374151' },
  badge: { padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#fff' },
  badgeSmall: { padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 600, color: '#fff' },
  cardTime: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  cardInfo: { fontSize: 12, color: '#4b5563', lineHeight: 1.4, marginBottom: 8 },
  cardCopyBtn: { width: '100%', padding: '6px 10px', border: '1px solid rgba(107,114,128,0.25)', borderRadius: 10, background: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  badgeAbsent2: { padding: '3px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, color: '#fff', background: '#b91c1c' },
  badgeAbsent2Small: { padding: '2px 6px', borderRadius: 6, fontSize: 9, fontWeight: 600, color: '#fff', background: '#b91c1c' },
  absent2Bar: { display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', borderRadius: 18, cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#991b1b', border: '1px solid rgba(185,28,28,0.2)' },
  safeBar: { display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', background: 'linear-gradient(135deg, #e6f4ea 0%, #c8e6d3 100%)', borderRadius: 18, cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#2E7D32' },
  safeList: { marginTop: 12, background: 'rgba(255,255,255,0.92)', borderRadius: 24, overflow: 'hidden' },
  safeItem: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '14px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: 14 },
  safeItemName: { fontWeight: 600, minWidth: 60 },
  safeItemTime: { fontSize: 12, color: '#6b7280' },
  logList: { background: 'rgba(255,255,255,0.92)', borderRadius: 18, border: '1px solid rgba(255,255,255,0.6)', overflow: 'hidden' },
  logItem: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '14px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: 16, lineHeight: 1.5 },
  logTime: { fontFamily: 'monospace', fontSize: 15, color: '#374151', fontWeight: 500 },
  logName: { fontWeight: 700, fontSize: 16, color: '#1f2937' },
  logSep: { color: '#94a3b8', fontSize: 16 },
  logMessage: { color: '#1f2937', flex: 1, fontSize: 16, fontWeight: 500 },
  logEmpty: { padding: 28, textAlign: 'center', color: '#6b7280', fontSize: 16 },
  errorBox: { padding: 22, background: 'linear-gradient(135deg, #fce8e6 0%, #f9d5d2 100%)', borderRadius: 24, color: '#991b1b' },
};
