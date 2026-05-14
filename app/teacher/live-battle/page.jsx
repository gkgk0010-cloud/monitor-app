'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/utils/supabaseClient';
import { useTeacher } from '@/utils/useTeacher';

/** vocab-app BattleGameView와 동일한 매칭 제한(초) — ends_at 없을 때 */
const DEFAULT_MATCH_SEC = 90;

const ITEM_LABEL = {
  freeze: '얼리기',
  shuffle: '섞기',
  double: '점수 2배',
  weaken: '약화',
  shield: '공격 막기',
};

function mergeRow(prev, incoming) {
  const next = { ...prev };
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== undefined) next[k] = v;
  }
  return next;
}

function parseIsoMs(s) {
  if (s == null || String(s).trim() === '') return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

/** 남은 초: ends_at 우선, 없으면 started_at + limit */
function remainingSeconds(row, nowMs = Date.now()) {
  const endFromEnds = parseIsoMs(row.ends_at);
  const start = parseIsoMs(row.started_at);
  let end = endFromEnds;
  if (end == null && start != null) {
    end = start + DEFAULT_MATCH_SEC * 1000;
  }
  if (end == null) return null;
  return Math.max(0, Math.ceil((end - nowMs) / 1000));
}

function itemPayload(row, col) {
  const raw = row[col];
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null && typeof raw.seq === 'number' && typeof raw.kind === 'string') {
    return raw;
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (p && typeof p.seq === 'number' && typeof p.kind === 'string') return p;
    } catch {
      return null;
    }
  }
  return null;
}

function blockPayload(row, col) {
  const raw = row[col];
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null && typeof raw.blocked_seq === 'number') return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (p && typeof p.blocked_seq === 'number') return p;
    } catch {
      return null;
    }
  }
  return null;
}

export default function LiveBattlePage() {
  const { teacher, loading: teacherLoading } = useTeacher();
  const academyId = teacher?.academy_id ? String(teacher.academy_id) : null;

  const [rowsById, setRowsById] = useState(() => ({}));
  const [loadError, setLoadError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [banner, setBanner] = useState(null);

  const lastHostEvtSeq = useRef({});
  const lastGuestEvtSeq = useRef({});
  const lastBlockGuestSeq = useRef({});
  const lastBlockHostSeq = useRef({});
  const prevStatusRef = useRef({});
  const selectionBaselineDone = useRef(null);

  const showBanner = useCallback((text, emoji) => {
    const id = Date.now();
    setBanner({ id, text, emoji });
    window.setTimeout(() => {
      setBanner((b) => (b && b.id === id ? null : b));
    }, 3800);
  }, []);

  const upsertRow = useCallback((incoming) => {
    if (!incoming?.id) return;
    setRowsById((prev) => {
      const id = incoming.id;
      const old = prev[id];
      const merged = old ? mergeRow(old, incoming) : { ...incoming };
      return { ...prev, [id]: merged };
    });
  }, []);

  useEffect(() => {
    const map = {};
    setRowsById(map);
    setLoadError(null);
    setSelectedId(null);
    selectionBaselineDone.current = null;
    prevStatusRef.current = {};
    lastHostEvtSeq.current = {};
    lastGuestEvtSeq.current = {};
    lastBlockGuestSeq.current = {};
    lastBlockHostSeq.current = {};

    if (!academyId) return undefined;

    let channel = null;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('battle_rooms')
        .select('*')
        .eq('academy_id', academyId)
        .in('mode', ['pvp'])
        .in('status', ['starting', 'playing'])
        .order('started_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(80);

      if (cancelled) return;
      if (error) {
        console.warn('[live-battle]', error.message);
        setLoadError(error.message || '목록 불러오기 실패');
        return;
      }
      const next = {};
      for (const r of data || []) {
        next[r.id] = r;
      }
      setRowsById(next);
    })();

    channel = supabase
      .channel(`live-battle:${academyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'battle_rooms',
          filter: `academy_id=eq.${academyId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldId = payload.old?.id;
            if (!oldId) return;
            setRowsById((prev) => {
              const cp = { ...prev };
              delete cp[oldId];
              return cp;
            });
            setSelectedId((sid) => (sid === oldId ? null : sid));
            return;
          }
          const row = payload.new;
          if (!row?.id || row.mode === 'bot') return;
          if (String(row.academy_id || '') !== String(academyId)) return;

          upsertRow(row);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [academyId, upsertRow]);

  useEffect(() => {
    if (!selectedId) {
      selectionBaselineDone.current = null;
      return;
    }
    const r = rowsById[selectedId];
    if (!r) return;
    if (selectionBaselineDone.current === selectedId) return;
    selectionBaselineDone.current = selectedId;
    lastHostEvtSeq.current[selectedId] = itemPayload(r, 'item_evt_host')?.seq ?? 0;
    lastGuestEvtSeq.current[selectedId] = itemPayload(r, 'item_evt_guest')?.seq ?? 0;
    lastBlockGuestSeq.current[selectedId] = blockPayload(r, 'item_blocked_by_guest')?.blocked_seq ?? 0;
    lastBlockHostSeq.current[selectedId] = blockPayload(r, 'item_blocked_by_host')?.blocked_seq ?? 0;
    prevStatusRef.current[selectedId] = r.status;
  }, [selectedId, rowsById]);

  /** 상세 선택 중 아이템·막힘 배너 */
  const selected = selectedId ? rowsById[selectedId] : null;

  useEffect(() => {
    if (!selected?.id) return;
    const id = selected.id;

    const ih = itemPayload(selected, 'item_evt_host');
    if (ih && ih.seq > (lastHostEvtSeq.current[id] ?? 0)) {
      lastHostEvtSeq.current[id] = ih.seq;
      const name = selected.host_name || '호스트';
      const label = ITEM_LABEL[ih.kind] || ih.kind;
      const emoji =
        ih.kind === 'freeze' ? '❄️' : ih.kind === 'shuffle' ? '🌀' : ih.kind === 'weaken' ? '🐢' : ih.kind === 'double' ? '✨' : ih.kind === 'shield' ? '🛡️' : '🎯';
      showBanner(`${emoji} ${name} — ${label} 사용!`);
    }

    const ig = itemPayload(selected, 'item_evt_guest');
    if (ig && ig.seq > (lastGuestEvtSeq.current[id] ?? 0)) {
      lastGuestEvtSeq.current[id] = ig.seq;
      const name = selected.guest_name || '게스트';
      const label = ITEM_LABEL[ig.kind] || ig.kind;
      const emoji =
        ig.kind === 'freeze' ? '❄️' : ig.kind === 'shuffle' ? '🌀' : ig.kind === 'weaken' ? '🐢' : ig.kind === 'double' ? '✨' : ig.kind === 'shield' ? '🛡️' : '🎯';
      showBanner(`${emoji} ${name} — ${label} 사용!`);
    }

    const bg = blockPayload(selected, 'item_blocked_by_guest');
    if (bg && bg.blocked_seq > (lastBlockGuestSeq.current[id] ?? 0)) {
      lastBlockGuestSeq.current[id] = bg.blocked_seq;
      showBanner('🛡️ 막힘! (방어 성공)', '🛡️');
    }

    const bh = blockPayload(selected, 'item_blocked_by_host');
    if (bh && bh.blocked_seq > (lastBlockHostSeq.current[id] ?? 0)) {
      lastBlockHostSeq.current[id] = bh.blocked_seq;
      showBanner('🛡️ 막힘! (방어 성공)', '🛡️');
    }

    const prevSt = prevStatusRef.current[id];
    if (selected.status === 'completed' && prevSt && prevSt !== 'completed') {
      const w = selected.winner;
      const hn = selected.host_name || '호스트';
      const gn = selected.guest_name || '게스트';
      let msg = '🎉 대전 종료!';
      if (w === 'host') msg = `🎉 ${hn} 승리!`;
      else if (w === 'guest') msg = `🎉 ${gn} 승리!`;
      else if (w === 'draw') msg = '🤝 무승부!';
      showBanner(msg, '🏆');
    }
    prevStatusRef.current[id] = selected.status || '';
  }, [selected, showBanner]);

  const activeList = useMemo(() => {
    return Object.values(rowsById).filter((r) => r.status === 'playing' || r.status === 'starting');
  }, [rowsById]);

  const hostScore = selected ? Number(selected.host_score) || 0 : 0;
  const guestScore = selected ? Number(selected.guest_score) || 0 : 0;
  const total = Math.max(1, hostScore + guestScore);
  const hostPct = (hostScore / total) * 100;

  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainSec = selected ? remainingSeconds(selected, clock) : null;

  const darkShell = {
    minHeight: 'calc(100vh - 64px)',
    background: 'radial-gradient(ellipse 120% 80% at 50% 0%, #1e293b 0%, #0f172a 55%, #020617 100%)',
    color: '#f1f5f9',
    padding: '20px 24px 32px',
    width: '100%',
    boxSizing: 'border-box',
  };

  if (teacherLoading) {
    return (
      <div style={{ ...darkShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700 }}>불러오는 중…</p>
      </div>
    );
  }

  if (!academyId) {
    return (
      <div style={{ ...darkShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#fbbf24' }}>학원(academy_id)이 연결된 선생님 계정에서만 라이브 중계를 사용할 수 있어요.</p>
      </div>
    );
  }

  if (selected) {
    const done = selected.status === 'completed';
    const hn = selected.host_name || '호스트';
    const gn = selected.guest_name || '게스트';

    return (
      <div style={darkShell}>
        <style>{`
          @keyframes lbScoreBump {
            0% { transform: scale(1); }
            40% { transform: scale(1.12); }
            100% { transform: scale(1); }
          }
          @keyframes lbCelebrate {
            0% { opacity: 0; transform: scale(0.9); }
            30% { opacity: 1; transform: scale(1.03); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes lbBannerSlide {
            0% { opacity: 0; transform: translate(-50%, 12px); }
            12% { opacity: 1; transform: translate(-50%, 0); }
            100% { opacity: 1; transform: translate(-50%, 0); }
          }
        `}</style>

        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            style={{
              marginBottom: 20,
              padding: '12px 20px',
              fontSize: 16,
              fontWeight: 800,
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.4)',
              background: 'rgba(30,41,59,0.9)',
              color: '#e2e8f0',
              cursor: 'pointer',
            }}
          >
            ← 그리드로 돌아가기
          </button>

          {banner ? (
            <div
              key={banner.id}
              style={{
                position: 'fixed',
                left: '50%',
                bottom: '12%',
                transform: 'translateX(-50%)',
                zIndex: 50,
                padding: '16px 28px',
                borderRadius: 16,
                background: 'linear-gradient(135deg, rgba(124,58,237,0.95), rgba(236,72,153,0.92))',
                color: '#fff',
                fontSize: 22,
                fontWeight: 900,
                boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
                animation: 'lbBannerSlide 0.45s ease-out both',
                maxWidth: 'min(92vw, 720px)',
                textAlign: 'center',
                border: '2px solid rgba(255,255,255,0.35)',
              }}
            >
              {banner.text}
            </div>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              gap: 16,
              alignItems: 'stretch',
              marginBottom: 28,
            }}
          >
            <div
              style={{
                textAlign: 'center',
                padding: '28px 20px',
                borderRadius: 20,
                background: 'linear-gradient(180deg, rgba(6,182,212,0.22) 0%, rgba(15,23,42,0.6) 100%)',
                border: '2px solid rgba(34,211,238,0.45)',
                boxShadow: '0 0 40px rgba(34,211,238,0.15)',
              }}
            >
              <p style={{ fontSize: 22, fontWeight: 800, color: '#67e8f9', marginBottom: 12 }}>{hn}</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>HOST</p>
              <p
                key={`h-${hostScore}`}
                style={{
                  fontSize: 'clamp(4rem, 14vw, 7.5rem)',
                  fontWeight: 900,
                  lineHeight: 1,
                  color: '#ecfeff',
                  textShadow: '0 4px 24px rgba(34,211,238,0.5)',
                  animation: 'lbScoreBump 0.5s ease-out',
                }}
              >
                {hostScore}
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 100,
                gap: 10,
              }}
            >
              <span style={{ fontSize: 44, fontWeight: 900, color: '#64748b' }}>VS</span>
              {remainSec != null && !done ? (
                <div
                  style={{
                    padding: '10px 16px',
                    borderRadius: 12,
                    background: 'rgba(15,23,42,0.9)',
                    border: '1px solid rgba(148,163,184,0.35)',
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>남은 시간</p>
                  <p style={{ fontSize: 28, fontWeight: 900, color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>{remainSec}s</p>
                </div>
              ) : null}
              <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textAlign: 'center', maxWidth: 120 }}>
                {selected.set_name || '세트'}
              </p>
            </div>

            <div
              style={{
                textAlign: 'center',
                padding: '28px 20px',
                borderRadius: 20,
                background: 'linear-gradient(180deg, rgba(244,63,94,0.22) 0%, rgba(15,23,42,0.6) 100%)',
                border: '2px solid rgba(251,113,133,0.45)',
                boxShadow: '0 0 40px rgba(244,63,94,0.12)',
              }}
            >
              <p style={{ fontSize: 22, fontWeight: 800, color: '#fda4af', marginBottom: 12 }}>{gn}</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>GUEST</p>
              <p
                key={`g-${guestScore}`}
                style={{
                  fontSize: 'clamp(4rem, 14vw, 7.5rem)',
                  fontWeight: 900,
                  lineHeight: 1,
                  color: '#fff1f2',
                  textShadow: '0 4px 24px rgba(251,113,133,0.45)',
                  animation: 'lbScoreBump 0.5s ease-out',
                }}
              >
                {guestScore}
              </p>
            </div>
          </div>

          <div
            style={{
              height: 26,
              borderRadius: 999,
              overflow: 'hidden',
              background: 'rgba(30,41,59,0.9)',
              border: '1px solid rgba(148,163,184,0.25)',
              display: 'flex',
              width: '100%',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: `${hostPct}%`,
                minWidth: hostScore > 0 ? 8 : 0,
                background: 'linear-gradient(90deg, #22d3ee, #0891b2)',
                transition: 'width 0.45s ease-out',
              }}
            />
            <div
              style={{
                width: `${100 - hostPct}%`,
                minWidth: guestScore > 0 ? 8 : 0,
                background: 'linear-gradient(90deg, #fb7185, #e11d48)',
                transition: 'width 0.45s ease-out',
              }}
            />
          </div>
          <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>
            점수 격차: <span style={{ color: '#e2e8f0' }}>{Math.abs(hostScore - guestScore)}</span>점
            {hostScore > guestScore ? (
              <span style={{ color: '#67e8f9' }}> · 호스트 우세</span>
            ) : guestScore > hostScore ? (
              <span style={{ color: '#fda4af' }}> · 게스트 우세</span>
            ) : (
              <span> · 동점</span>
            )}
          </p>

          {done ? (
            <div
              style={{
                marginTop: 36,
                textAlign: 'center',
                padding: '36px 24px',
                borderRadius: 24,
                background: 'linear-gradient(135deg, rgba(250,204,21,0.35), rgba(168,85,247,0.35))',
                border: '2px solid rgba(253,224,71,0.5)',
                animation: 'lbCelebrate 0.7s ease-out both',
              }}
            >
              <p style={{ fontSize: 42, fontWeight: 900, color: '#fef08a', marginBottom: 12 }}>종료!</p>
              <p style={{ fontSize: 26, fontWeight: 800, color: '#fafafa' }}>
                {selected.winner === 'host' ? `${hn} 승리` : selected.winner === 'guest' ? `${gn} 승리` : '무승부'}
              </p>
              <p style={{ fontSize: 18, marginTop: 12, opacity: 0.9 }}>
                {hostScore} : {guestScore}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={darkShell}>
      <style>{`
        @keyframes lbCardGlow {
          0% { box-shadow: 0 0 0 rgba(34,211,238,0); }
          50% { box-shadow: 0 0 24px rgba(34,211,238,0.25); }
          100% { box-shadow: 0 0 0 rgba(34,211,238,0); }
        }
      `}</style>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 30, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>라이브 대전</h1>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>실시간 · 학원별</span>
        </div>

        {loadError ? (
          <p style={{ color: '#f97316', fontWeight: 700, marginBottom: 16 }}>{loadError}</p>
        ) : null}

        {activeList.length === 0 ? (
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              borderRadius: 20,
              background: 'rgba(30,41,59,0.55)',
              border: '1px dashed rgba(148,163,184,0.35)',
            }}
          >
            <p style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>진행 중인 대전 없음</p>
            <p style={{ fontSize: 15, color: '#94a3b8' }}>학생들이 1대1을 시작하면 여기에 자동으로 나타나요.</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {activeList.map((r) => {
              const h = Number(r.host_score) || 0;
              const g = Number(r.guest_score) || 0;
              const rem = remainingSeconds(r, clock);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    textAlign: 'left',
                    padding: 20,
                    borderRadius: 18,
                    border: '1px solid rgba(148,163,184,0.25)',
                    background: 'linear-gradient(145deg, rgba(30,41,59,0.95), rgba(15,23,42,0.85))',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, border-color 0.15s',
                  }}
                  className="live-battle-card"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.borderColor = 'rgba(148,163,184,0.25)';
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 10 }}>
                    {r.status === 'starting' ? '시작 준비' : '진행 중'}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#67e8f9', flex: 1 }}>{r.host_name || '호스트'}</span>
                    <span style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{h}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#fda4af', flex: 1 }}>{r.guest_name || '게스트'}</span>
                    <span style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{g}</span>
                  </div>
                  <p style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>{r.set_name || '단어 세트'}</p>
                  {rem != null ? (
                    <p style={{ fontSize: 13, marginTop: 8, fontWeight: 800, color: '#fbbf24' }}>남은 {rem}s</p>
                  ) : (
                    <p style={{ fontSize: 12, marginTop: 8, color: '#64748b' }}>시간 정보 없음</p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <p style={{ marginTop: 28, fontSize: 13, color: '#64748b' }}>
          팁: 큰 화면·어두운 환경에서 보면 가독성이 좋아요 ·{' '}
          <Link href="/teacher/monitor" style={{ color: '#38bdf8', fontWeight: 700 }}>
            모니터로
          </Link>
        </p>
      </div>
    </div>
  );
}
