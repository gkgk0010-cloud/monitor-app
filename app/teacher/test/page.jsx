'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useTeacher } from '@/utils/useTeacher';
import { COLORS, RADIUS, SHADOW } from '@/utils/tokens';

function mulberry32(seed) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded(arr, seed) {
  const rand = mulberry32(seed >>> 0);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function distributeCounts(total, bucketCount) {
  if (bucketCount <= 0) return [];
  const base = Math.floor(total / bucketCount);
  const rem = total % bucketCount;
  return Array.from({ length: bucketCount }, (_, i) => base + (i < rem ? 1 : 0));
}

function parseClaudeJson(text) {
  if (!text || typeof text !== 'string') return null;
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const VERSION_SEED = { A: 10001, B: 20002, C: 30003 };

const CIRCLED = ['①', '②', '③', '④'];

export default function TeacherTestPage() {
  const { teacher, loading: teacherLoading } = useTeacher();
  const teacherId = teacher?.id;
  const teacherName = teacher?.name?.trim() || teacher?.email || '선생님';

  const [setNames, setSetNames] = useState([]);
  const [setsLoading, setSetsLoading] = useState(true);
  const [selectedSet, setSelectedSet] = useState('');
  const [startDay, setStartDay] = useState(1);
  const [endDay, setEndDay] = useState(1);

  const [typeWordToMeaning, setTypeWordToMeaning] = useState(true);
  const [typeMeaningToWord, setTypeMeaningToWord] = useState(true);
  const [typeFillBlank, setTypeFillBlank] = useState(false);

  const [questionCount, setQuestionCount] = useState(10);
  const [version, setVersion] = useState('A');

  const [wordPool, setWordPool] = useState([]);
  const [previewQuestions, setPreviewQuestions] = useState(null);
  const [previewMeta, setPreviewMeta] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);

  useEffect(() => {
    if (teacherLoading || !teacherId) {
      setSetNames([]);
      setSetsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setSetsLoading(true);
      const { data, error } = await supabase
        .from('words')
        .select('set_name')
        .eq('teacher_id', teacherId);
      if (cancelled) return;
      if (error) {
        console.warn('[test] set_name 목록:', error.message);
        setSetNames([]);
      } else {
        const s = new Set();
        for (const row of data || []) {
          if (row?.set_name != null && String(row.set_name).trim()) s.add(String(row.set_name).trim());
        }
        setSetNames([...s].sort());
      }
      setSetsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [teacherLoading, teacherId]);

  const loadWordsForRange = useCallback(async () => {
    if (!teacherId || !selectedSet) return [];
    const lo = Math.min(Number(startDay) || 1, Number(endDay) || 1);
    const hi = Math.max(Number(startDay) || 1, Number(endDay) || 1);
    const { data, error } = await supabase
      .from('words')
      .select('id, word, meaning, example_sentence, set_name, day')
      .eq('teacher_id', teacherId)
      .eq('set_name', selectedSet)
      .gte('day', lo)
      .lte('day', hi)
      .order('day', { ascending: true })
      .order('word', { ascending: true });
    if (error) {
      console.warn('[test] words:', error.message);
      return [];
    }
    return data || [];
  }, [teacherId, selectedSet, startDay, endDay]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedSet || !teacherId) {
      setWordPool([]);
      return;
    }
    void (async () => {
      const rows = await loadWordsForRange();
      if (!cancelled) setWordPool(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [teacherId, selectedSet, startDay, endDay, loadWordsForRange]);

  const maxQuestions = useMemo(() => {
    const n = wordPool.length;
    return Math.min(40, Math.max(0, n));
  }, [wordPool]);

  const questionCountOptions = useMemo(() => {
    const opts = [];
    for (let q = 10; q <= maxQuestions; q += 10) opts.push(q);
    if (maxQuestions > 0 && maxQuestions < 10 && !opts.includes(maxQuestions)) opts.push(maxQuestions);
    if (maxQuestions >= 10 && !opts.includes(maxQuestions) && maxQuestions % 10 !== 0) {
      const last = Math.floor(maxQuestions / 10) * 10;
      if (last >= 10 && !opts.includes(last)) opts.push(last);
      if (!opts.includes(maxQuestions)) opts.push(maxQuestions);
    }
    return [...new Set(opts)].sort((a, b) => a - b);
  }, [maxQuestions]);

  useEffect(() => {
    if (questionCountOptions.length === 0) return;
    if (!questionCountOptions.includes(questionCount)) {
      setQuestionCount(questionCountOptions[questionCountOptions.length - 1]);
    }
  }, [questionCountOptions, questionCount]);

  const buildPrompt = (wordsSubset, counts, typesList) => {
    const wordsJson = JSON.stringify(
      wordsSubset.map((w) => ({
        word: String(w.word ?? '').trim(),
        meaning: String(w.meaning ?? '').trim(),
        example_sentence: w.example_sentence != null ? String(w.example_sentence).trim() : '',
        day: w.day,
      })),
      null,
      0,
    );

    const parts = [];
    let idx = 0;
    if (typesList.includes('word_meaning')) {
      parts.push(`- ${counts[idx++]}개: 4지선다 — 단어를 보고 뜻 고르기 ("다음 단어의 뜻으로 올바른 것은?" 형태). 보기 4개는 모두 뜻.`);
    }
    if (typesList.includes('meaning_word')) {
      parts.push(`- ${counts[idx++]}개: 4지선다 — 뜻을 보고 영단어 고르기 ("다음 뜻에 해당하는 단어는?" 형태). 보기 4개는 모두 영단어.`);
    }
    if (typesList.includes('fill_blank')) {
      parts.push(
        `- ${counts[idx++]}개: 빈칸 채우기 — 예문에서 해당 단어 자리를 _____ 로 바꾸고, 빈칸에 들어갈 말을 4지선다로 고르기 (보기는 단어 4개).`,
      );
    }

    const total = counts.reduce((a, b) => a + b, 0);

    return `아래 단어 목록으로 시험 문제를 총 ${total}개 만들어줘.
${parts.join('\n')}

규칙:
- 각 4지선다는 정답 1개 + 같은 세트(목록)에서 뽑은 오답 3개.
- 보기 순서는 랜덤으로 섞어줘.
- 정답 위치도 ①②③④ 중 랜덤( answer 필드는 1~4 ).

응답: JSON 배열만.
형식: [{
  "number": 1,
  "type": "word_meaning" | "meaning_word" | "fill_blank",
  "word": "tow",
  "question": "다음 단어의 뜻으로 올바른 것은?",
  "options": ["n. 차량", "v. 견인하다", "adj. 뒤의", "n. 기회"],
  "answer": 2,
  "sentence": "예문이 있으면 fill_blank일 때만, 단어는 _____ 처리"
}]

단어 목록: ${wordsJson}`;
  };

  const handleGenerate = async () => {
    setGenError(null);
    if (!teacherId) {
      setGenError('선생님 정보를 확인할 수 없습니다.');
      return;
    }
    if (!selectedSet) {
      setGenError('세트를 선택하세요.');
      return;
    }
    const typesList = [];
    if (typeWordToMeaning) typesList.push('word_meaning');
    if (typeMeaningToWord) typesList.push('meaning_word');
    if (typeFillBlank) typesList.push('fill_blank');
    if (typesList.length === 0) {
      setGenError('문제 유형을 하나 이상 선택하세요.');
      return;
    }

    const needFour = typeWordToMeaning || typeMeaningToWord;
    if (needFour && wordPool.length < 4) {
      setGenError('4지선다는 선택한 DAY 범위에 단어가 4개 이상 있어야 합니다.');
      return;
    }
    if (wordPool.length === 0) {
      setGenError('선택한 범위에 단어가 없습니다.');
      return;
    }

    const n = Math.min(questionCount, maxQuestions);
    if (n < 1) {
      setGenError('문항 수를 줄이거나 DAY 범위를 넓혀 주세요.');
      return;
    }

    const shuffledPool = shuffleSeeded(wordPool, VERSION_SEED[version] + selectedSet.length);
    const subset = shuffledPool.slice(0, Math.min(n, shuffledPool.length));
    const counts = distributeCounts(n, typesList.length);

    const prompt = buildPrompt(subset, counts, typesList);
    const system =
      '너는 교육용 영어 단어 시험 문제를 만든다. 반드시 JSON 배열만 출력한다. 마크다운·코드펜스·설명 금지.';

    setGenerating(true);
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, system, max_tokens: 14000 }),
      });
      const data = await res.json();
      const raw = data.text || '';
      const parsed = parseClaudeJson(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setGenError('문제를 생성하지 못했습니다. 다시 시도해 주세요.');
        return;
      }

      const seed = (VERSION_SEED[version] || 1) + n * 17;
      const shuffled = shuffleSeeded(parsed, seed);
      const renumbered = shuffled.map((q, i) => ({ ...q, number: i + 1 }));

      const lo = Math.min(Number(startDay) || 1, Number(endDay) || 1);
      const hi = Math.max(Number(startDay) || 1, Number(endDay) || 1);
      setPreviewMeta({
        setName: selectedSet,
        dayLabel: lo === hi ? `DAY ${lo}` : `DAY ${lo}–${hi}`,
        version,
        teacherName,
      });
      setPreviewQuestions(renumbered);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : '요청에 실패했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleReset = () => {
    setPreviewQuestions(null);
    setPreviewMeta(null);
    setGenError(null);
  };

  const half = previewQuestions ? Math.ceil(previewQuestions.length / 2) : 0;
  const leftCol = previewQuestions ? previewQuestions.slice(0, half) : [];
  const rightCol = previewQuestions ? previewQuestions.slice(half) : [];

  if (teacherLoading) {
    return (
      <div style={{ padding: 24, color: COLORS.textSecondary }}>
        선생님 정보 확인 중…
      </div>
    );
  }

  if (!teacherId) {
    return (
      <div style={{ padding: 24, color: COLORS.textSecondary }}>
        로그인한 선생님 정보가 없습니다.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 40px' }}>
      <div className="teacher-test-form-no-print">
      <h1
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: COLORS.accentText,
          marginBottom: 8,
        }}
      >
        테스트지 생성
      </h1>
      <p style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 20 }}>
        세트·DAY·유형을 고른 뒤 생성하면 Claude로 문제를 만들고, 미리보기 후 인쇄할 수 있습니다.
      </p>

      <div
        style={{
          padding: 20,
          borderRadius: RADIUS.lg,
          border: `1px solid ${COLORS.border}`,
          background: COLORS.surface,
          boxShadow: SHADOW.card,
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.textPrimary }}>세트 선택</span>
            <select
              value={selectedSet}
              onChange={(e) => setSelectedSet(e.target.value)}
              disabled={setsLoading}
              style={{
                padding: '10px 12px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                fontSize: 15,
              }}
            >
              <option value="">— 세트 선택 —</option>
              {setNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {setsLoading ? (
              <span style={{ fontSize: 12, color: COLORS.textHint }}>목록 불러오는 중…</span>
            ) : null}
          </label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>시작 DAY</span>
              <input
                type="number"
                min={1}
                value={startDay}
                onChange={(e) => setStartDay(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{
                  width: 100,
                  padding: '10px 12px',
                  borderRadius: RADIUS.sm,
                  border: `1px solid ${COLORS.border}`,
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>끝 DAY</span>
              <input
                type="number"
                min={1}
                value={endDay}
                onChange={(e) => setEndDay(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{
                  width: 100,
                  padding: '10px 12px',
                  borderRadius: RADIUS.sm,
                  border: `1px solid ${COLORS.border}`,
                }}
              />
            </label>
            <span style={{ fontSize: 13, color: COLORS.textSecondary }}>
              범위 단어 수: <strong>{wordPool.length}</strong>개
            </span>
          </div>

          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>문제 유형 (복수 선택)</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={typeWordToMeaning}
                onChange={(e) => setTypeWordToMeaning(e.target.checked)}
              />
              <span>4지선다 — 단어 보고 뜻 고르기</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={typeMeaningToWord}
                onChange={(e) => setTypeMeaningToWord(e.target.checked)}
              />
              <span>4지선다 — 뜻 보고 단어 고르기</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={typeFillBlank}
                onChange={(e) => setTypeFillBlank(e.target.checked)}
              />
              <span>빈칸 채우기 — 예문에서 단어 빠진 것</span>
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>문항 수</span>
            <select
              value={questionCount}
              onChange={(e) => setQuestionCount(parseInt(e.target.value, 10))}
              disabled={questionCountOptions.length === 0}
              style={{
                padding: '10px 12px',
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.border}`,
                maxWidth: 200,
              }}
            >
              {questionCountOptions.map((q) => (
                <option key={q} value={q}>
                  {q}문항
                </option>
              ))}
            </select>
            {questionCountOptions.length === 0 ? (
              <span style={{ fontSize: 12, color: COLORS.warning }}>선택한 범위에 단어가 없습니다.</span>
            ) : (
              <span style={{ fontSize: 12, color: COLORS.textHint }}>
                최대 {maxQuestions}문항까지 (10단위, 단어 수 이내)
              </span>
            )}
          </label>

          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>버전 (문항 순서 다름)</div>
            <div style={{ display: 'flex', gap: 12 }}>
              {['A', 'B', 'C'].map((v) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="radio"
                    name="test-version"
                    checked={version === v}
                    onChange={() => setVersion(v)}
                  />
                  <span>{v}형</span>
                </label>
              ))}
            </div>
          </div>

          {genError ? (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: RADIUS.sm,
                background: COLORS.dangerBg,
                color: COLORS.danger,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {genError}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating || wordPool.length === 0}
            style={{
              padding: '14px 22px',
              borderRadius: RADIUS.md,
              border: 'none',
              background: COLORS.headerGradient,
              color: COLORS.textOnGreen,
              fontWeight: 800,
              fontSize: 16,
              cursor: generating || wordPool.length === 0 ? 'not-allowed' : 'pointer',
              opacity: generating || wordPool.length === 0 ? 0.6 : 1,
            }}
          >
            {generating ? '생성 중…' : '테스트지 생성'}
          </button>
        </div>
      </div>
      </div>

      {previewQuestions && previewMeta ? (
        <div
          className="test-sheet-print-area"
          style={{
            padding: 24,
            borderRadius: RADIUS.lg,
            border: `1px solid ${COLORS.border}`,
            background: '#fff',
            boxShadow: SHADOW.card,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
              marginBottom: 20,
              paddingBottom: 12,
              borderBottom: '2px solid #1e293b',
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{previewMeta.setName}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginTop: 4 }}>{previewMeta.dayLabel}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 14, color: '#334155' }}>
              <div>
                <strong>{previewMeta.teacherName}</strong>
                <span style={{ marginLeft: 16 }}>Name: ____________________</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>{previewMeta.version}형</div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px 28px',
              alignItems: 'start',
              fontSize: 13,
              color: '#1e293b',
            }}
          >
            {[leftCol, rightCol].map((col, ci) => (
              <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {col.map((q) => (
                  <div key={q.number} style={{ breakInside: 'avoid' }}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>
                      {q.number}){' '}
                      {q.type === 'fill_blank' ? (
                        <span style={{ fontWeight: 600 }}>{String(q.word ?? '').trim()}</span>
                      ) : (
                        <span>{String(q.word ?? '').trim()}</span>
                      )}
                    </div>
                    {q.type === 'fill_blank' && q.sentence ? (
                      <div style={{ fontWeight: 500, marginBottom: 6, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                        {String(q.sentence)}
                      </div>
                    ) : null}
                    {q.question ? (
                      <div style={{ fontWeight: 600, marginBottom: 6, lineHeight: 1.45 }}>{q.question}</div>
                    ) : null}
                    <div style={{ paddingLeft: 4 }}>
                      {(Array.isArray(q.options) ? q.options : []).slice(0, 4).map((opt, oi) => (
                        <div key={oi} style={{ marginBottom: 3 }}>
                          {CIRCLED[oi]} {String(opt)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 24,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
            }}
            className="test-sheet-actions"
          >
            <button
              type="button"
              onClick={handlePrint}
              style={{
                padding: '12px 20px',
                borderRadius: RADIUS.md,
                border: 'none',
                background: COLORS.headerGradient,
                color: COLORS.textOnGreen,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              인쇄 / PDF 저장
            </button>
            <button
              type="button"
              onClick={handleReset}
              style={{
                padding: '12px 20px',
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.surface,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              다시 만들기
            </button>
          </div>
        </div>
      ) : null}

    </div>
  );
}
