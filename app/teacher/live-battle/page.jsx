'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/utils/supabaseClient';
import { useTeacher } from '@/utils/useTeacher';
import { BATTLE_DURATION_SEC } from '@/constants/battleDuration';
import { ATTACK_ITEM_KINDS } from '@/constants/battleItems';
/** 완료 카드 그리드 노출 시간(ms) */
const RESULT_CARD_TTL_MS = 18000;
/** 최근 아이템 줄 교체·강조(ms) — lbStripeBump 애니 */
const GRID_ITEM_PULSE_MS = 520;

const ATTACK_KIND_SET = new Set(ATTACK_ITEM_KINDS);

const ITEM_LABEL = {
  freeze: '얼리기',
  shuffle: '섞기',
  double: '점수 2배',
  weaken: '약화',
  shield: '공격 막기',
};

const ITEM_EMOJI = {
  freeze: '❄️',
  shuffle: '🌀',
  double: '✨',
  weaken: '🐢',
  shield: '🛡️',
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

/** 종료 시각: DB ended_at 우선, 없으면 클라이언트 fallback */
function endedAtMs(row, fallbackMap) {
  const e = parseIsoMs(row.ended_at);
  if (e != null) return e;
  if (row.status === 'completed' && fallbackMap[row.id]) return fallbackMap[row.id];
  return null;
}

/** 남은 초: ends_at 우선, 없으면 started_at + limit */
function remainingSeconds(row, nowMs = Date.now()) {
  const endFromEnds = parseIsoMs(row.ends_at);
  const start = parseIsoMs(row.started_at);
  let end = endFromEnds;
  if (end == null && start != null) {
    end = start + BATTLE_DURATION_SEC * 1000;
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

/** host/guest 각 컬럼의 최근 이벤트 중 더 최신 1건(시각 `at` 기준 — seq는 채널 간 비교 불가). */
function pickLatestCombinedItemEvt(row) {
  const hp = itemPayload(row, 'item_evt_host');
  const gp = itemPayload(row, 'item_evt_guest');
  if (!hp && !gp) return null;
  if (!hp) return { side: 'guest', payload: gp };
  if (!gp) return { side: 'host', payload: hp };
  const ah = parseIsoMs(hp.at);
  const ag = parseIsoMs(gp.at);
  if (ah != null && ag != null) {
    if (ag !== ah) return ag > ah ? { side: 'guest', payload: gp } : { side: 'host', payload: hp };
  }
  return hp.seq >= gp.seq ? { side: 'host', payload: hp } : { side: 'guest', payload: gp };
}

function shortenName(s, max = 5) {
  const t = String(s ?? '').trim() || '?';
  return t.length > max ? `${t.slice(0, Math.max(0, max - 1))}…` : t;
}

function isAttackKind(kind) {
  return typeof kind === 'string' && ATTACK_KIND_SET.has(kind);
}

const HOST_TAILWIND_LIKE = '#67e8f9';
const GUEST_TAILWIND_LIKE = '#fda4af';

/** 그리드 카드 안: 마지막 아이템 1건 + 교체 순간 펄스 */
function GridRecentItemStripe({ row, pulseTick }) {
  const chosen = pickLatestCombinedItemEvt(row);
  const hostFull = shortenName(row.host_name || '호스트', 8);
  const guestFull = shortenName(row.guest_name || '게스트', 8);

  if (!chosen) {
    return <div aria-hidden style={{ minHeight: 22, marginBottom: 8 }} />;
  }

  const { side, payload } = chosen;
  const kind = payload.kind || '';
  const atk = isAttackKind(kind);
  const label = ITEM_LABEL[kind] || kind;
  const emoji = ITEM_EMOJI[kind] || '🎯';

  const casterShort = side === 'host' ? hostFull : guestFull;
  const victimSide = side === 'host' ? 'guest' : 'host';
  const victimShort = victimSide === 'host' ? hostFull : guestFull;

  const casterCol = side === 'host' ? HOST_TAILWIND_LIKE : GUEST_TAILWIND_LIKE;

  const inner = atk ? (
    <>
      <span style={{ fontWeight: 900, color: casterCol }}>{casterShort}</span>
      <span style={{ opacity: 0.85 }} aria-hidden="true">
        {' ▶ '}
      </span>
      <span style={{ fontWeight: 900, color: victimSide === 'host' ? HOST_TAILWIND_LIKE : GUEST_TAILWIND_LIKE }}>{victimShort}</span>
    </>
  ) : (
    <>
      <span style={{ fontWeight: 900, color: casterCol }}>{casterShort}</span>
      <span style={{ opacity: 0.85 }} title="본인에게" aria-hidden="true">
        {' ↻ '}
      </span>
      <span style={{ fontWeight: 900, color: casterCol }}>{casterShort}</span>
    </>
  );

  return (
    <div
      aria-label={
        atk
          ? `${side === 'host' ? '호스트' : '게스트'}가 ${kind} 로 상대 공격`
          : `${side === 'host' ? '호스트' : '게스트'}가 자기 버프`
      }
      style={{
        marginBottom: 10,
        minHeight: 28,
      }}
    >
      <div
        key={`p-${pulseTick ?? 0}`}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          lineHeight: 1.3,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: '#cbd5e1',
          borderRadius: 8,
          padding: '5px 7px',
          background: 'rgba(15,23,42,0.65)',
          border: '1px solid rgba(100,116,139,0.35)',
          boxShadow: pulseTick ? `0 0 0 1px rgba(250,204,21,0.35)` : undefined,
          animation: pulseTick ? `lbStripeBump ${GRID_ITEM_PULSE_MS}ms ease-out` : undefined,
        }}
      >
        <span aria-hidden style={{ flexShrink: 0, fontSize: 13, lineHeight: 1 }}>
          {emoji}
        </span>
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, minWidth: 0 }}>
          {inner}
        </span>
        <span style={{ flexShrink: 0, opacity: 0.92 }}>·</span>
        <span style={{ flexShrink: 0, opacity: 0.95 }}>{label}</span>
      </div>
    </div>
  );
}

export default function LiveBattlePage() {
  const { teacher, loading: teacherLoading } = useTeacher();
  const academyId = teacher?.academy_id ? String(teacher.academy_id) : null;

  const [rowsById, setRowsById] = useState(() => ({}));
  const [loadError, setLoadError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [banner, setBanner] = useState(null);
  const [fallbackEndedAt, setFallbackEndedAt] = useState({});
  const [stickyBroadcast, setStickyBroadcast] = useState(null);
  /** 카드별 최근 아이템 칸 교체 순간 펄스(값이 바뀌면 애니 1회) */
  const [gridRecentPulseTick, setGridRecentPulseTick] = useState({});
  const [clock, setClock] = useState(() => Date.now());

  const lastHostEvtSeq = useRef({});
  const lastGuestEvtSeq = useRef({});
  const lastBlockGuestSeq = useRef({});
  const lastBlockHostSeq = useRef({});
  const prevStatusRef = useRef({});
  const selectionBaselineDone = useRef(null);

  const gridHostSeqRef = useRef({});
  const gridGuestSeqRef = useRef({});

  const showBanner = useCallback((text) => {
    const id = Date.now();
    setBanner({ id, text });
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

  const pulseGridRecentItemStripe = useCallback((roomId) => {
    setGridRecentPulseTick((m) => ({ ...m, [roomId]: (m[roomId] ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    const map = {};
    setRowsById(map);
    setLoadError(null);
    setSelectedId(null);
    setStickyBroadcast(null);
    setFallbackEndedAt({});
    setGridRecentPulseTick({});
    selectionBaselineDone.current = null;
    prevStatusRef.current = {};
    lastHostEvtSeq.current = {};
    lastGuestEvtSeq.current = {};
    lastBlockGuestSeq.current = {};
    lastBlockHostSeq.current = {};
    gridHostSeqRef.current = {};
    gridGuestSeqRef.current = {};

    if (!academyId) return undefined;

    let channel = null;
    let cancelled = false;

    (async () => {
      const sinceIso = new Date(Date.now() - RESULT_CARD_TTL_MS - 5000).toISOString();
      const { data, error } = await supabase
        .from('battle_rooms')
        .select('*')
        .eq('academy_id', academyId)
        .in('mode', ['pvp'])
        .in('status', ['starting', 'playing', 'completed'])
        .or(`ended_at.is.null,ended_at.gte.${sinceIso}`)
        .order('created_at', { ascending: false })
        .limit(120);

      if (cancelled) return;
      if (error) {
        console.warn('[live-battle]', error.message);
        setLoadError(error.message || '목록 불러오기 실패');
        return;
      }
      const next = {};
      const now = Date.now();
      for (const r of data || []) {
        if (r.status === 'completed') {
          const em = endedAtMs(r, {});
          if (em != null && now - em > RESULT_CARD_TTL_MS) continue;
        }
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

  /** completed 인데 ended_at 없을 때 클라이언트 기준 시각 */
  useEffect(() => {
    setFallbackEndedAt((prev) => {
      let next = prev;
      for (const row of Object.values(rowsById)) {
        if (row.status !== 'completed') continue;
        if (parseIsoMs(row.ended_at) != null) continue;
        if (prev[row.id]) continue;
        if (next === prev) next = { ...prev };
        next[row.id] = Date.now();
      }
      return next;
    });
  }, [rowsById]);

  /** 그리드에서 오래된 완료 방 제거 (중계 상세로 보는 방은 유지) */
  useEffect(() => {
    setRowsById((prev) => {
      const now = Date.now();
      let next = prev;
      for (const [id, r] of Object.entries(prev)) {
        if (r.status !== 'completed') continue;
        if (selectedId === id) continue;
        const em = endedAtMs(r, fallbackEndedAt);
        if (em == null) continue;
        if (now - em <= RESULT_CARD_TTL_MS) continue;
        if (next === prev) next = { ...prev };
        delete next[id];
      }
      return next;
    });
  }, [clock, selectedId, fallbackEndedAt]);

  useEffect(() => {
    const tid = window.setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(tid);
  }, []);

  /** 그리드: 어느 쪽이든 item seq 증가 → 줄 유지 + 펄스 1회 */
  useEffect(() => {
    for (const row of Object.values(rowsById)) {
      const id = row.id;
      const h = itemPayload(row, 'item_evt_host');
      if (h) {
        const ls = gridHostSeqRef.current[id] ?? 0;
        if (h.seq > ls) {
          gridHostSeqRef.current[id] = h.seq;
          pulseGridRecentItemStripe(id);
        }
      }
      const g = itemPayload(row, 'item_evt_guest');
      if (g) {
        const ls = gridGuestSeqRef.current[id] ?? 0;
        if (g.seq > ls) {
          gridGuestSeqRef.current[id] = g.seq;
          pulseGridRecentItemStripe(id);
        }
      }
    }
  }, [rowsById, pulseGridRecentItemStripe]);

  const liveRow = selectedId ? rowsById[selectedId] : null;

  useEffect(() => {
    if (!selectedId) {
      setStickyBroadcast(null);
      return;
    }
    const r = rowsById[selectedId];
    if (!r) return;
    if (r.status === 'completed') {
      setStickyBroadcast((s) => mergeRow(s ?? {}, r));
    } else {
      setStickyBroadcast(null);
    }
  }, [selectedId, rowsById]);

  const detailRow = useMemo(() => {
    if (!selectedId) return null;
    const live = rowsById[selectedId];
    if (stickyBroadcast && stickyBroadcast.id === selectedId) {
      if (!live) return stickyBroadcast;
      if (live.status === 'completed') return mergeRow(stickyBroadcast, live);
      return live;
    }
    return live ?? null;
  }, [selectedId, rowsById, stickyBroadcast]);

  useEffect(() => {
    if (!selectedId) {
      selectionBaselineDone.current = null;
      return;
    }
    const r = detailRow;
    if (!r || r.id !== selectedId) return;
    if (selectionBaselineDone.current === selectedId) return;
    selectionBaselineDone.current = selectedId;
    lastHostEvtSeq.current[selectedId] = itemPayload(r, 'item_evt_host')?.seq ?? 0;
    lastGuestEvtSeq.current[selectedId] = itemPayload(r, 'item_evt_guest')?.seq ?? 0;
    lastBlockGuestSeq.current[selectedId] = blockPayload(r, 'item_blocked_by_guest')?.blocked_seq ?? 0;
    lastBlockHostSeq.current[selectedId] = blockPayload(r, 'item_blocked_by_host')?.blocked_seq ?? 0;
    prevStatusRef.current[selectedId] = r.status || '';
  }, [selectedId, detailRow]);

  useEffect(() => {
    if (!detailRow?.id) return;
    const id = detailRow.id;

    const ih = itemPayload(detailRow, 'item_evt_host');
    if (ih && ih.seq > (lastHostEvtSeq.current[id] ?? 0)) {
      lastHostEvtSeq.current[id] = ih.seq;
      const name = detailRow.host_name || '호스트';
      const label = ITEM_LABEL[ih.kind] || ih.kind;
      const emoji =
        ih.kind === 'freeze'
          ? '❄️'
          : ih.kind === 'shuffle'
            ? '🌀'
            : ih.kind === 'weaken'
              ? '🐢'
              : ih.kind === 'double'
                ? '✨'
                : ih.kind === 'shield'
                  ? '🛡️'
                  : '🎯';
      showBanner(`${emoji} ${name} — ${label} 사용!`);
    }

    const ig = itemPayload(detailRow, 'item_evt_guest');
    if (ig && ig.seq > (lastGuestEvtSeq.current[id] ?? 0)) {
      lastGuestEvtSeq.current[id] = ig.seq;
      const name = detailRow.guest_name || '게스트';
      const label = ITEM_LABEL[ig.kind] || ig.kind;
      const emoji =
        ig.kind === 'freeze'
          ? '❄️'
          : ig.kind === 'shuffle'
            ? '🌀'
            : ig.kind === 'weaken'
              ? '🐢'
              : ig.kind === 'double'
                ? '✨'
                : ig.kind === 'shield'
                  ? '🛡️'
                  : '🎯';
      showBanner(`${emoji} ${name} — ${label} 사용!`);
    }

    const bg = blockPayload(detailRow, 'item_blocked_by_guest');
    if (bg && bg.blocked_seq > (lastBlockGuestSeq.current[id] ?? 0)) {
      lastBlockGuestSeq.current[id] = bg.blocked_seq;
      showBanner('🛡️ 막힘! (방어 성공)');
    }

    const bh = blockPayload(detailRow, 'item_blocked_by_host');
    if (bh && bh.blocked_seq > (lastBlockHostSeq.current[id] ?? 0)) {
      lastBlockHostSeq.current[id] = bh.blocked_seq;
      showBanner('🛡️ 막힘! (방어 성공)');
    }

    const prevSt = prevStatusRef.current[id];
    if (detailRow.status === 'completed' && prevSt && prevSt !== 'completed') {
      const w = detailRow.winner;
      const hn = detailRow.host_name || '호스트';
      const gn = detailRow.guest_name || '게스트';
      let msg = '🎉 대전 종료!';
      if (w === 'host') msg = `🎉 ${hn} 승리!`;
      else if (w === 'guest') msg = `🎉 ${gn} 승리!`;
      else if (w === 'draw') msg = '🤝 무승부!';
      showBanner(msg);
    }
    prevStatusRef.current[id] = detailRow.status || '';
  }, [detailRow, showBanner]);

  const gridRows = useMemo(() => {
    const now = clock;
    const live = [];
    const done = [];
    for (const r of Object.values(rowsById)) {
      if (r.status === 'playing' || r.status === 'starting') {
        live.push(r);
        continue;
      }
      if (r.status !== 'completed') continue;
      const em = endedAtMs(r, fallbackEndedAt);
      if (em == null || now - em > RESULT_CARD_TTL_MS) continue;
      done.push({ row: r, endedMs: em });
    }
    done.sort((a, b) => b.endedMs - a.endedMs);
    live.sort((a, b) => new Date(b.started_at || b.created_at) - new Date(a.started_at || a.created_at));
    return { live, done };
  }, [rowsById, clock, fallbackEndedAt]);

  const gridHasAny = gridRows.live.length > 0 || gridRows.done.length > 0;

  const remainSecDetail = detailRow ? remainingSeconds(detailRow, clock) : null;
  const hostScore = detailRow ? Number(detailRow.host_score) || 0 : 0;
  const guestScore = detailRow ? Number(detailRow.guest_score) || 0 : 0;
  const total = Math.max(1, hostScore + guestScore);
  const hostPct = (hostScore / total) * 100;
  const broadcastDone = detailRow?.status === 'completed';

  const clearBroadcastAndGoGrid = () => {
    setSelectedId(null);
    setStickyBroadcast(null);
  };

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

  if (selectedId && detailRow) {
    const hn = detailRow.host_name || '호스트';
    const gn = detailRow.guest_name || '게스트';

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
          @keyframes lbGridItemBlink {
            0% { opacity: 0.25; transform: scale(0.85); filter: brightness(1.6); }
            40% { opacity: 1; transform: scale(1.15); filter: brightness(1.25); }
            100% { opacity: 0; transform: scale(0.9); }
          }
        `}</style>

        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => clearBroadcastAndGoGrid()}
              style={{
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
              {broadcastDone ? '← 그리드로 (결과 종료)' : '← 그리드로 돌아가기'}
            </button>
            {broadcastDone ? (
              <button
                type="button"
                onClick={() => clearBroadcastAndGoGrid()}
                style={{
                  padding: '12px 20px',
                  fontSize: 15,
                  fontWeight: 800,
                  borderRadius: 12,
                  border: '1px solid rgba(251,191,36,0.55)',
                  background: 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(244,114,182,0.22))',
                  color: '#fef9c3',
                  cursor: 'pointer',
                }}
              >
                결과 닫기
              </button>
            ) : null}
          </div>

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
                opacity: broadcastDone && detailRow.winner === 'guest' ? 0.62 : 1,
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
              {remainSecDetail != null && !broadcastDone ? (
                <div
                  style={{
                    padding: '10px 16px',
                    borderRadius: 12,
                    background: 'rgba(15,23,42,0.9)',
                    border: '1px solid rgba(148,163,184,0.35)',
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>남은 시간</p>
                  <p style={{ fontSize: 28, fontWeight: 900, color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>{remainSecDetail}s</p>
                </div>
              ) : null}
              <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textAlign: 'center', maxWidth: 120 }}>
                {detailRow.set_name || '세트'}
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
                opacity: broadcastDone && detailRow.winner === 'host' ? 0.62 : 1,
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
              opacity: broadcastDone ? 0.72 : 1,
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
          <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 20 }}>
            점수 격차: <span style={{ color: '#e2e8f0' }}>{Math.abs(hostScore - guestScore)}</span>점
            {hostScore > guestScore ? (
              <span style={{ color: '#67e8f9' }}> · 호스트 우세</span>
            ) : guestScore > hostScore ? (
              <span style={{ color: '#fda4af' }}> · 게스트 우세</span>
            ) : (
              <span> · 동점</span>
            )}
          </p>

          {broadcastDone ? (
            <div
              style={{
                marginTop: 8,
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
                {detailRow.winner === 'host' ? `${hn} 승리` : detailRow.winner === 'guest' ? `${gn} 승리` : '무승부'}
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

  /** 선택했는데 행이 아직 없을 때 */
  if (selectedId && !detailRow) {
    return (
      <div style={{ ...darkShell, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ fontWeight: 800 }}>방 정보를 불러올 수 없어요.</p>
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          style={{ padding: '10px 18px', fontWeight: 800, borderRadius: 10, cursor: 'pointer' }}
        >
          그리드로
        </button>
      </div>
    );
  }

  return (
    <div style={darkShell}>
      <style>{`
        @keyframes lbStripeBump {
          0% {
            transform: scale(0.97);
            filter: brightness(1.38);
            box-shadow:
              inset 0 0 12px rgba(250, 204, 21, 0.22),
              0 0 14px rgba(34, 211, 238, 0.32);
          }
          55% {
            transform: scale(1.02);
            filter: brightness(1.14);
          }
          100% {
            transform: scale(1);
            filter: brightness(1);
          }
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

        {!gridHasAny ? (
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
            <p style={{ fontSize: 15, color: '#94a3b8' }}>
              학생들이 1대1을 시작하면 여기에 나타나고, 종료 직후 잠깐 결과 카드도 표시됩니다.
            </p>
          </div>
        ) : (
          <>
            {gridRows.live.length > 0 ? (
              <>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#94a3b8', marginBottom: 10 }}>진행 중</p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 16,
                    marginBottom: gridRows.done.length ? 28 : 0,
                  }}
                >
                  {gridRows.live.map((r) => {
                    const h = Number(r.host_score) || 0;
                    const g = Number(r.guest_score) || 0;
                    const rem = remainingSeconds(r, clock);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        style={{
                          position: 'relative',
                          textAlign: 'left',
                          padding: 20,
                          paddingTop: 24,
                          borderRadius: 18,
                          border: '1px solid rgba(148,163,184,0.25)',
                          background: 'linear-gradient(145deg, rgba(30,41,59,0.95), rgba(15,23,42,0.85))',
                          color: '#e2e8f0',
                          cursor: 'pointer',
                          transition: 'transform 0.15s ease, border-color 0.15s',
                        }}
                      >
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 10 }}>
                          {r.status === 'starting' ? '시작 준비' : '진행 중'}
                        </p>
                        <GridRecentItemStripe row={r} pulseTick={gridRecentPulseTick[r.id] ?? 0} />
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
              </>
            ) : null}
            {gridRows.done.length > 0 ? (
              <>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#a78bfa', marginBottom: 10 }}>
                  최근 종료 (~{Math.round(RESULT_CARD_TTL_MS / 1000)}초)
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 16,
                  }}
                >
                  {gridRows.done.map(({ row: r, endedMs }) => {
                    const h = Number(r.host_score) || 0;
                    const g = Number(r.guest_score) || 0;
                    const w = r.winner;
                    let winLabel = '무승부';
                    if (w === 'host') winLabel = `${r.host_name || '호스트'} 승`;
                    else if (w === 'guest') winLabel = `${r.guest_name || '게스트'} 승`;
                    const secsLeft = Math.max(0, Math.ceil((RESULT_CARD_TTL_MS - (clock - endedMs)) / 1000));
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        style={{
                          position: 'relative',
                          textAlign: 'left',
                          padding: 20,
                          paddingTop: 24,
                          borderRadius: 18,
                          border: '1px solid rgba(107,114,128,0.45)',
                          background: 'linear-gradient(145deg, rgba(51,65,85,0.55), rgba(15,23,42,0.75))',
                          color: '#cbd5e1',
                          cursor: 'pointer',
                          opacity: 0.88,
                          filter: 'brightness(0.97)',
                          transition: 'transform 0.15s ease, border-color 0.15s',
                        }}
                      >
                        <p style={{ fontSize: 11, fontWeight: 800, color: '#a78bfa', marginBottom: 10 }}>결과 · 약 {secsLeft}s 후 사라짐</p>
                        <GridRecentItemStripe row={r} pulseTick={gridRecentPulseTick[r.id] ?? 0} />
                        <p style={{ fontSize: 18, fontWeight: 900, color: '#fef08a', marginBottom: 12 }}>{winLabel}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#67e8f9', flex: 1 }}>{r.host_name || '호스트'}</span>
                          <span style={{ fontSize: 17, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{h}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#fda4af', flex: 1 }}>{r.guest_name || '게스트'}</span>
                          <span style={{ fontSize: 17, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{g}</span>
                        </div>
                        <p style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{r.set_name || '단어 세트'}</p>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </>
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
