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
  console.log('Claude 응답 원문:', text);
  if (!text || typeof text !== 'string') {
    return null;
  }
  try {
    let cleaned = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }

    return JSON.parse(cleaned);
  } catch (e) {
    console.error('파싱 실패, 원문:', text);
    return null;
  }
}

const VERSION_SEED = { A: 10001, B: 20002, C: 30003 };

const CIRCLED = ['①', '②', '③', '④'];

/** 레거시 / Claude 응답 타입 통일 */
function normalizeType(t) {
  const s = String(t || '').trim();
  if (s === 'word_meaning') return 'word_to_meaning';
  if (s === 'meaning_word') return 'meaning_to_word';
  return s;
}

function normWord(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

function normMeaning(s) {
  return String(s ?? '').trim();
}

function buildQuestionCountOptions(total) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  if (n === 0) return [];
  if (n < 10) return [n];
  const opts = [];
  for (let i = 10; i < n; i += 10) opts.push(i);
  opts.push(n);
  return opts;
}

function buildSlots(typesList, counts) {
  const slots = [];
  for (let i = 0; i < typesList.length; i++) {
    const c = counts[i] || 0;
    for (let j = 0; j < c; j++) slots.push(typesList[i]);
  }
  return slots;
}

function validateQuestions(questions, wordPool, expectedLen) {
  if (!Array.isArray(questions) || questions.length !== expectedLen) {
    return { ok: false, reason: `문항 개수 불일치 (기대 ${expectedLen}개)` };
  }

  const wordSet = new Set();
  const meaningSet = new Set();
  for (const w of wordPool) {
    const ww = normWord(w.word);
    if (ww) wordSet.add(ww);
    const m = normMeaning(w.meaning);
    if (m) meaningSet.add(m);
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const t = normalizeType(q.type);

    if (t === 'word_to_meaning' || t === 'meaning_to_word') {
      const opts = Array.isArray(q.options) ? q.options.map((x) => normMeaning(x)) : [];
      if (opts.length !== 4) return { ok: false, reason: `${i + 1}번: 4지선다 보기는 4개여야 합니다.` };
      if (new Set(opts).size !== 4) return { ok: false, reason: `${i + 1}번: 보기가 서로 달라야 합니다.` };
      const ans = Number(q.answer);
      if (!(ans >= 1 && ans <= 4)) return { ok: false, reason: `${i + 1}번: 정답은 1~4여야 합니다.` };
      if (t === 'word_to_meaning') {
        const wd = normWord(q.word);
        if (!wd || !wordSet.has(wd)) return { ok: false, reason: `${i + 1}번: 단어가 목록에 없습니다.` };
        for (const o of opts) {
          if (!meaningSet.has(o)) return { ok: false, reason: `${i + 1}번: 뜻 보기가 목록에 없습니다.` };
        }
      } else {
        const mn = normMeaning(q.meaning);
        if (!mn || !meaningSet.has(mn)) return { ok: false, reason: `${i + 1}번: 뜻이 목록에 없습니다.` };
        for (const o of opts) {
          if (!wordSet.has(normWord(o))) return { ok: false, reason: `${i + 1}번: 단어 보기가 목록에 없습니다.` };
        }
      }
    } else if (t === 'fill_blank') {
      const wd = normWord(q.word);
      if (!wd || !wordSet.has(wd)) return { ok: false, reason: `${i + 1}번: 빈칸 단어가 목록에 없습니다.` };
      const ex = String(q.example ?? '');
      if (!ex.includes('____') && !ex.includes('______')) {
        return { ok: false, reason: `${i + 1}번: 예문에 빈칸(____)이 있어야 합니다.` };
      }
      if (normWord(q.answer) !== wd) return { ok: false, reason: `${i + 1}번: 빈칸 정답이 단어와 일치해야 합니다.` };
    } else if (t === 'subjective_word') {
      const wd = normWord(q.word);
      if (!wd || !wordSet.has(wd)) return { ok: false, reason: `${i + 1}번: 단어가 목록에 없습니다.` };
      if (!String(q.answer ?? '').trim()) return { ok: false, reason: `${i + 1}번: 주관식 정답(뜻)이 비었습니다.` };
    } else if (t === 'subjective_meaning') {
      const mn = normMeaning(q.meaning);
      if (!mn || !meaningSet.has(mn)) return { ok: false, reason: `${i + 1}번: 뜻이 목록에 없습니다.` };
      const aw = normWord(q.answer);
      if (!aw || !wordSet.has(aw)) return { ok: false, reason: `${i + 1}번: 정답 단어가 목록에 없습니다.` };
    } else {
      return { ok: false, reason: `${i + 1}번: 알 수 없는 유형 "${q.type}"` };
    }
  }

  return { ok: true };
}

/** 빈칸 채우기만 Claude — jobs: { row }[] */
function buildFillBlankOnlyPrompt(wordPoolJson, jobs) {
  const lines = jobs
    .map((job, k) => {
      const w = String(job.row.word ?? '').trim();
      const ex = job.row.example_sentence != null ? String(job.row.example_sentence).trim() : '';
      const exHint = ex ? ` 참고 예문(활용 가능): ${ex}` : '';
      return `${k + 1}. 문항 ${k + 1}: 단어는 반드시 "${w}". example 은 이 단어가 들어가는 영문 한 문장이며, 해당 영단어 자리만 ____ 또는 ______ 로 표시. answer 는 "${w}" 와 동일.${exHint}`;
    })
    .join('\n');

  return `아래 단어 목록에 있는 데이터만 사용한다.

단어 목록(JSON):
${wordPoolJson}

빈칸 채우기(fill_blank) ${jobs.length}문항만 생성한다.
${lines}

응답: JSON 배열만. 각 객체는 { "number": 번호, "type": "fill_blank", "word", "example", "answer" }.
number 는 1부터 순서대로. 마크다운·설명 금지.`;
}

function pickThreeWrongMeanings(wordPool, excludeRow, correctMeaning, seed) {
  const excludeId = String(excludeRow.id);
  const correctN = normMeaning(correctMeaning);
  const pool = wordPool.filter((r) => String(r.id) !== excludeId);
  const candidates = [];
  const seen = new Set([correctN]);
  for (const r of shuffleSeeded(pool, seed ^ 0x9e3779b9)) {
    const m = String(r.meaning ?? '').trim();
    if (!m) continue;
    const mn = normMeaning(m);
    if (seen.has(mn)) continue;
    seen.add(mn);
    candidates.push(m);
    if (candidates.length >= 3) break;
  }
  return candidates.slice(0, 3);
}

function pickThreeWrongWords(wordPool, excludeRow, correctWord, seed) {
  const excludeId = String(excludeRow.id);
  const correctN = normWord(correctWord);
  const pool = wordPool.filter((r) => String(r.id) !== excludeId);
  const candidates = [];
  const seen = new Set([correctN]);
  for (const r of shuffleSeeded(pool, seed ^ 0x85ebca6b)) {
    const w = String(r.word ?? '').trim();
    if (!w) continue;
    const wn = normWord(w);
    if (seen.has(wn)) continue;
    seen.add(wn);
    candidates.push(w);
    if (candidates.length >= 3) break;
  }
  return candidates.slice(0, 3);
}

function buildWordToMeaningQuestion(row, wordPool, seed) {
  const w = String(row.word ?? '').trim();
  const correctM = String(row.meaning ?? '').trim();
  const wrongs = pickThreeWrongMeanings(wordPool, row, correctM, seed);
  if (wrongs.length < 3) {
    throw new Error('4지선다(단어→뜻) 오답을 만들 뜻이 부족합니다. DAY 범위를 넓히거나 단어를 늘려 주세요.');
  }
  const opts = shuffleSeeded([correctM, ...wrongs], seed + 17);
  const answer = opts.findIndex((o) => normMeaning(o) === normMeaning(correctM)) + 1;
  return {
    type: 'word_to_meaning',
    word: w,
    question: '다음 단어의 뜻으로 올바른 것은?',
    options: opts,
    answer,
  };
}

function buildMeaningToWordQuestion(row, wordPool, seed) {
  const meaning = String(row.meaning ?? '').trim();
  const correctW = String(row.word ?? '').trim();
  const wrongs = pickThreeWrongWords(wordPool, row, correctW, seed);
  if (wrongs.length < 3) {
    throw new Error('4지선다(뜻→단어) 오답을 만들 단어가 부족합니다. DAY 범위를 넓히거나 단어를 늘려 주세요.');
  }
  const opts = shuffleSeeded([correctW, ...wrongs], seed + 29);
  const answer = opts.findIndex((o) => normWord(o) === normWord(correctW)) + 1;
  return {
    type: 'meaning_to_word',
    meaning,
    question: '다음 뜻에 해당하는 단어는?',
    options: opts,
    answer,
  };
}

function buildSubjectiveWordQuestion(row) {
  const w = String(row.word ?? '').trim();
  const answer = String(row.meaning ?? '').trim();
  return {
    type: 'subjective_word',
    word: w,
    question: '다음 단어의 뜻을 쓰시오.',
    answer,
  };
}

function buildSubjectiveMeaningQuestion(row, hintFirstTwo) {
  const meaning = String(row.meaning ?? '').trim();
  const answer = String(row.word ?? '').trim();
  const w = answer.trim();
  const hint =
    hintFirstTwo && w.length >= 2
      ? `${w.slice(0, 2)}__________`
      : undefined;
  const q = {
    type: 'subjective_meaning',
    meaning,
    question: '다음 뜻에 해당하는 단어를 쓰시오.',
    answer,
  };
  if (hint) q.hint = hint;
  return q;
}

function buildLocalQuestion(slot, row, wordPool, seed, hintFirstTwo) {
  switch (slot) {
    case 'word_to_meaning':
      return buildWordToMeaningQuestion(row, wordPool, seed);
    case 'meaning_to_word':
      return buildMeaningToWordQuestion(row, wordPool, seed);
    case 'subjective_word':
      return buildSubjectiveWordQuestion(row);
    case 'subjective_meaning':
      return buildSubjectiveMeaningQuestion(row, hintFirstTwo);
    default:
      throw new Error(`로컬 생성 미지원 유형: ${slot}`);
  }
}

const MAX_GENERATION_RETRIES = 2;
const CLAUDE_MAX_TOKENS = 8000;

async function runClaudeFillBlanksOnly(wordPoolJson, jobs, wordPool) {
  if (!jobs.length) return [];
  const prompt = buildFillBlankOnlyPrompt(wordPoolJson, jobs);
  const system =
    '너는 교육용 영어 단어 시험 문제를 만든다. 반드시 JSON 배열만 출력한다. 마크다운·코드펜스·설명 금지.';

  let lastErr = '';
  let lastRaw = '';
  for (let attempt = 0; attempt <= MAX_GENERATION_RETRIES; attempt++) {
    const extra = attempt > 0 ? `\n\n[재시도 ${attempt}] ${lastErr}` : '';

    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt + extra,
        system,
        max_tokens: CLAUDE_MAX_TOKENS,
      }),
    });
    const data = await res.json();
    const raw = data.text || '';
    lastRaw = raw;
    const parsed = parseClaudeJson(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      lastErr = 'JSON 배열 파싱 실패';
      continue;
    }
    if (parsed.length !== jobs.length) {
      lastErr = `JSON 배열 개수 불일치 (기대 ${jobs.length}개)`;
      continue;
    }

    const normalized = parsed.map((q) => ({
      ...q,
      type: 'fill_blank',
    }));

    let rowOk = true;
    for (let k = 0; k < jobs.length; k++) {
      if (normWord(normalized[k].word) !== normWord(jobs[k].row.word)) {
        lastErr = `${k + 1}번째 빈칸 문항의 단어가 배정과 다릅니다.`;
        rowOk = false;
        break;
      }
    }
    if (!rowOk) continue;

    const v = validateQuestions(normalized, wordPool, jobs.length);
    if (v.ok) {
      return normalized;
    }
    lastErr = v.reason || '검증 실패';
  }

  const preview = String(lastRaw || '').slice(0, 200);
  throw new Error(
    lastErr === 'JSON 배열 파싱 실패'
      ? `JSON 파싱 실패: ${preview}${lastRaw.length > 200 ? '…' : ''}`
      : lastErr || '빈칸 문제 생성 실패',
  );
}

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
  const [typeMeaningToWord, setTypeMeaningToWord] = useState(false);
  const [typeFillBlank, setTypeFillBlank] = useState(false);
  const [typeSubjectiveWord, setTypeSubjectiveWord] = useState(false);
  const [typeSubjectiveMeaning, setTypeSubjectiveMeaning] = useState(false);
  const [hintFirstTwo, setHintFirstTwo] = useState(false);

  const [includeAnswerSheet, setIncludeAnswerSheet] = useState(false);

  const [questionCount, setQuestionCount] = useState(10);
  const [version, setVersion] = useState('A');

  const [wordPool, setWordPool] = useState([]);
  const [previewQuestions, setPreviewQuestions] = useState(null);
  const [previewMeta, setPreviewMeta] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });
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

  const maxQuestions = wordPool.length;

  const questionCountOptions = useMemo(() => buildQuestionCountOptions(maxQuestions), [maxQuestions]);

  useEffect(() => {
    if (questionCountOptions.length === 0) return;
    if (!questionCountOptions.includes(questionCount)) {
      setQuestionCount(questionCountOptions[questionCountOptions.length - 1]);
    }
  }, [questionCountOptions, questionCount]);

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
    if (typeWordToMeaning) typesList.push('word_to_meaning');
    if (typeMeaningToWord) typesList.push('meaning_to_word');
    if (typeFillBlank) typesList.push('fill_blank');
    if (typeSubjectiveWord) typesList.push('subjective_word');
    if (typeSubjectiveMeaning) typesList.push('subjective_meaning');

    if (typesList.length === 0) {
      setGenError('문제 유형을 하나 이상 선택하세요.');
      return;
    }

    const needFourMc = typeWordToMeaning || typeMeaningToWord;
    if (needFourMc && wordPool.length < 4) {
      setGenError('4지선다 유형은 선택한 DAY 범위에 단어가 4개 이상 있어야 합니다.');
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

    const counts = distributeCounts(n, typesList.length);
    const slots = buildSlots(typesList, counts);

    const assignmentSeed =
      (9001 +
        n * 733 +
        String(selectedSet)
          .split('')
          .reduce((a, c) => a + c.charCodeAt(0), 0) +
        (Number(startDay) || 1) * 13 +
        (Number(endDay) || 1) * 17) >>>
      0;
    const assignRows = shuffleSeeded([...wordPool], assignmentSeed).slice(0, n);

    const wordsJson = JSON.stringify(
      wordPool.map((w) => ({
        word: String(w.word ?? '').trim(),
        meaning: String(w.meaning ?? '').trim(),
        example_sentence: w.example_sentence != null ? String(w.example_sentence).trim() : '',
        day: w.day,
      })),
      null,
      0,
    );

    const fillBlankJobs = [];
    const built = new Array(n);

    setGenerating(true);
    const needClaude = slots.some((s) => s === 'fill_blank');
    setGenProgress({ done: 0, total: needClaude ? 1 : 1 });

    try {
      for (let i = 0; i < n; i++) {
        const slot = slots[i];
        const row = assignRows[i];
        const qSeed = (assignmentSeed + i * 1103515245) >>> 0;
        if (slot === 'fill_blank') {
          fillBlankJobs.push({ index: i, row });
          built[i] = null;
        } else {
          built[i] = buildLocalQuestion(
            slot,
            row,
            wordPool,
            qSeed,
            typeSubjectiveMeaning && hintFirstTwo,
          );
        }
      }

      if (fillBlankJobs.length > 0) {
        const claudeQs = await runClaudeFillBlanksOnly(wordsJson, fillBlankJobs, wordPool);
        fillBlankJobs.forEach((job, k) => {
          built[job.index] = { ...claudeQs[k], type: 'fill_blank' };
        });
      }

      let flat = built.map((q, idx) => ({
        ...q,
        number: idx + 1,
        type: normalizeType(q.type),
      }));

      setGenProgress({ done: 1, total: 1 });

      const orderSeed = (VERSION_SEED[version] || 1) + n * 17;
      const shuffled = shuffleSeeded(flat, orderSeed);
      const renumbered = shuffled.map((q, i) => ({ ...q, type: normalizeType(q.type), number: i + 1 }));

      const lo = Math.min(Number(startDay) || 1, Number(endDay) || 1);
      const hi = Math.max(Number(startDay) || 1, Number(endDay) || 1);
      setPreviewMeta({
        setName: selectedSet,
        dayLabel: lo === hi ? `DAY ${lo}` : `DAY ${lo}–${hi}`,
        version,
        teacherName,
        includeAnswerSheet,
      });
      setPreviewQuestions(renumbered);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : '요청에 실패했습니다.');
    } finally {
      setGenerating(false);
      setGenProgress({ done: 0, total: 0 });
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

  const renderQuestionBlock = (q) => {
    const t = normalizeType(q.type);
    const n = q.number;

    if (t === 'meaning_to_word') {
      return (
        <div key={n} className="test-question-item" style={{ breakInside: 'avoid', marginBottom: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            {n}) {normMeaning(q.meaning)}
          </div>
          {q.question ? (
            <div style={{ fontWeight: 600, marginBottom: 6, lineHeight: 1.45 }}>{q.question}</div>
          ) : (
            <div style={{ fontWeight: 600, marginBottom: 6 }}>다음 뜻에 해당하는 단어는?</div>
          )}
          <div style={{ paddingLeft: 4 }}>
            {(Array.isArray(q.options) ? q.options : []).slice(0, 4).map((opt, oi) => (
              <div key={oi} style={{ marginBottom: 3 }}>
                {CIRCLED[oi]} {String(opt)}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (t === 'fill_blank') {
      return (
        <div key={n} className="test-question-item" style={{ breakInside: 'avoid', marginBottom: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>{n}) 빈칸 채우기</div>
          <div style={{ fontWeight: 500, marginBottom: 8, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {String(q.example ?? '')}
          </div>
        </div>
      );
    }

    if (t === 'subjective_word') {
      return (
        <div key={n} className="test-question-item" style={{ breakInside: 'avoid', marginBottom: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            {n}) <span style={{ fontWeight: 700 }}>{String(q.word ?? '').trim()}</span>
          </div>
          {q.question ? (
            <div style={{ fontWeight: 600, marginBottom: 8, lineHeight: 1.45 }}>{q.question}</div>
          ) : (
            <div style={{ fontWeight: 600, marginBottom: 8 }}>다음 단어의 뜻을 쓰시오.</div>
          )}
          <div style={{ borderBottom: '1px solid #94a3b8', minHeight: 28 }} />
        </div>
      );
    }

    if (t === 'subjective_meaning') {
      return (
        <div key={n} className="test-question-item" style={{ breakInside: 'avoid', marginBottom: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            {n}) {normMeaning(q.meaning)}
          </div>
          {q.hint ? (
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>힌트: {String(q.hint)}</div>
          ) : null}
          {q.question ? (
            <div style={{ fontWeight: 600, marginBottom: 8, lineHeight: 1.45 }}>{q.question}</div>
          ) : (
            <div style={{ fontWeight: 600, marginBottom: 8 }}>다음 뜻에 해당하는 단어를 쓰시오.</div>
          )}
          <div style={{ borderBottom: '1px solid #94a3b8', minHeight: 28 }} />
        </div>
      );
    }

    /* word_to_meaning & legacy */
    return (
      <div key={n} className="test-question-item" style={{ breakInside: 'avoid', marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>
          {n}) <span style={{ fontWeight: 700 }}>{String(q.word ?? '').trim()}</span>
        </div>
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
    );
  };

  const formatKeyLine = (q) => {
    const t = normalizeType(q.type);
    if (t === 'word_to_meaning' || t === 'meaning_to_word') {
      const a = Number(q.answer);
      if (a >= 1 && a <= 4) return CIRCLED[a - 1];
      return String(q.answer ?? '');
    }
    if (t === 'fill_blank') return String(q.answer ?? '').trim();
    return String(q.answer ?? '').trim();
  };

  if (teacherLoading) {
    return (
      <div style={{ padding: '8px 0 24px', color: COLORS.textSecondary }}>
        선생님 정보 확인 중…
      </div>
    );
  }

  if (!teacherId) {
    return (
      <div style={{ padding: '8px 0 24px', color: COLORS.textSecondary }}>
        로그인한 선생님 정보가 없습니다.
      </div>
    );
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
        className="teacher-test-page-header no-print"
        style={{
          marginBottom: 16,
          padding: '14px 18px',
          borderRadius: RADIUS.lg,
          background: COLORS.headerGradient,
          color: COLORS.textOnGreen,
          boxShadow: SHADOW.card,
          boxSizing: 'border-box',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>테스트지 생성</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.95, lineHeight: 1.5, fontWeight: 500 }}>
          세트·DAY·유형을 고른 뒤 생성하면 4지선다·주관식은 즉시 만들어지고, 빈칸 채우기만 Claude로 생성합니다. 미리보기 후 인쇄할 수 있습니다.
        </p>
      </header>

      <div className="teacher-test-form-no-print" style={{ width: '100%', maxWidth: '100%' }}>
        <div
          style={{
            padding: 22,
            borderRadius: RADIUS.xl,
            border: `1px solid ${COLORS.border}`,
            borderLeft: '4px solid #667eea',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            boxShadow: '0 8px 32px rgba(31, 38, 135, 0.06)',
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>세트 선택</span>
              <select
                value={selectedSet}
                onChange={(e) => setSelectedSet(e.target.value)}
                disabled={setsLoading}
                style={{
                  padding: '10px 12px',
                  borderRadius: RADIUS.sm,
                  border: `1px solid ${COLORS.border}`,
                  fontSize: 15,
                  background: COLORS.surface,
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
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                문제 유형 — 각각 독립 선택 (복수 선택 가능)
              </div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>
                원하는 유형만 켜면 됩니다. 여러 유형을 동시에 선택할 수 있습니다.
              </div>
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={typeFillBlank}
                  onChange={(e) => setTypeFillBlank(e.target.checked)}
                />
                <span>빈칸 채우기 — 예문에서 단어 빠진 것</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={typeSubjectiveWord}
                  onChange={(e) => setTypeSubjectiveWord(e.target.checked)}
                />
                <span>주관식 — 단어 보고 뜻 쓰기</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={typeSubjectiveMeaning}
                  onChange={(e) => setTypeSubjectiveMeaning(e.target.checked)}
                />
                <span>주관식 — 뜻 보고 단어 쓰기</span>
              </label>
              {typeSubjectiveMeaning ? (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginLeft: 24,
                    marginTop: 4,
                    fontSize: 14,
                    color: COLORS.textSecondary,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={hintFirstTwo}
                    onChange={(e) => setHintFirstTwo(e.target.checked)}
                  />
                  <span>첫 두 글자 힌트 표시 (예: pr__________ )</span>
                </label>
              ) : null}
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
                  최대 {maxQuestions}문항 (10단위 + 마지막은 범위 단어 수)
                </span>
              )}
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeAnswerSheet}
                onChange={(e) => setIncludeAnswerSheet(e.target.checked)}
              />
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                답지 포함 (테스트지 뒤에 별도 페이지로 인쇄)
              </span>
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

            {generating && genProgress.total > 0 ? (
              <div style={{ marginTop: 4 }}>
                <div
                  style={{
                    height: 8,
                    borderRadius: 4,
                    background: '#e2e8f0',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.round((genProgress.done / genProgress.total) * 100)}%`,
                      background: 'linear-gradient(90deg, #667eea, #764ba2)',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 6, display: 'block' }}>
                  생성 진행: {genProgress.done}/{genProgress.total} 묶음
                </span>
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
                fontSize: 15,
                cursor: generating || wordPool.length === 0 ? 'not-allowed' : 'pointer',
                opacity: generating || wordPool.length === 0 ? 0.6 : 1,
                boxShadow: generating || wordPool.length === 0 ? 'none' : '0 4px 16px rgba(102, 126, 234, 0.28)',
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
            width: '100%',
            maxWidth: '100%',
            margin: '0 auto',
            padding: 24,
            borderRadius: RADIUS.xl,
            border: `1px solid ${COLORS.border}`,
            background: '#fff',
            boxShadow: '0 8px 32px rgba(31, 38, 135, 0.06)',
          }}
        >
          <div
            style={{
              marginBottom: 20,
              paddingBottom: 12,
              borderBottom: '2px solid #1e293b',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
              {previewMeta.setName} {previewMeta.dayLabel}
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                marginTop: 10,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: '#334155' }}>{previewMeta.teacherName}</div>
              <div style={{ fontSize: 14, color: '#334155' }}>Name: ____________________</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: '#64748b', marginTop: 6 }}>
              {previewMeta.version}형
            </div>
          </div>

          <div
            className="test-questions-columns"
            style={{
              columnCount: 2,
              columnGap: 40,
              fontSize: 13,
              color: '#1e293b',
            }}
          >
            {previewQuestions.map((q) => renderQuestionBlock(q))}
          </div>

          {previewMeta.includeAnswerSheet ? (
            <div className="test-answer-key-page">
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: '#0f172a',
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: '1px solid #cbd5e1',
                }}
              >
                {previewMeta.setName} {previewMeta.dayLabel} 답안지
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px 16px',
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                {previewQuestions
                  .filter((q) => {
                    const t = normalizeType(q.type);
                    return t === 'word_to_meaning' || t === 'meaning_to_word';
                  })
                  .map((q) => (
                    <div key={`k-${q.number}`}>
                      {q.number}. {formatKeyLine(q)}
                    </div>
                  ))}
              </div>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8, color: '#334155' }}>[주관식·빈칸 답]</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                {previewQuestions.map((q) => {
                  const t = normalizeType(q.type);
                  if (t === 'word_to_meaning' || t === 'meaning_to_word') return null;
                  return (
                    <div key={`sk-${q.number}`}>
                      {q.number}. {formatKeyLine(q)}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div
            style={{
              marginTop: 24,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
            }}
            className="test-sheet-actions no-print"
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
