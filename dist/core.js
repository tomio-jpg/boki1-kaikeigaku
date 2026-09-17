export const ratings = ['understood', 'unsure', 'unknown'];
export function validateQuestions(questions, categories) {
  const ids = new Set();
  for (const q of questions) {
    if (!q || ['id', 'question', 'answer', 'explanation'].some(k => typeof q[k] !== 'string' || !q[k].trim()) ||
        ids.has(q.id) || !categories.includes(q.category) || !['一問一答', '○×', '理由'].includes(q.type) ||
        !(q.relatedExam === null || typeof q.relatedExam === 'string')) throw new Error('問題データの形式を確認してください。');
    ids.add(q.id);
  }
}
export function selectQuestions(questions, category = null, random = Math.random) {
  const pool = questions.filter(q => category === null || q.category === category);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 10);
}
export function storageKey(dataset) { return `boki1-accounting:${dataset}:history:v1`; }
export function readHistory(storage, dataset) {
  const raw = storage.getItem(storageKey(dataset));
  if (raw === null) return { schemaVersion: 1, attempts: [] };
  const data = JSON.parse(raw);
  if (data.schemaVersion !== 1 || !Array.isArray(data.attempts) || data.attempts.some(a =>
    !a || typeof a.questionId !== 'string' || !ratings.includes(a.rating) || typeof a.answeredAt !== 'string'
  )) throw new Error('保存データを読み込めません。');
  return data;
}
export function saveAttempt(storage, dataset, attempt) {
  const history = readHistory(storage, dataset);
  if (!history.attempts.some(a => a.id === attempt.id)) history.attempts.push(attempt);
  storage.setItem(storageKey(dataset), JSON.stringify(history));
}
export function tally(attempts) {
  return Object.fromEntries(ratings.map(r => [r, attempts.filter(a => a.rating === r).length]));
}

function restoreToday(saved, questions) {
  if (!saved || typeof saved.id !== 'string' || !Array.isArray(saved.questionIds) ||
      !saved.questionIds.length || saved.questionIds.length > 10 ||
      new Set(saved.questionIds).size !== saved.questionIds.length ||
      !Array.isArray(saved.attempts) || saved.currentIndex !== saved.attempts.length ||
      saved.currentIndex > saved.questionIds.length ||
      !['active', 'completed'].includes(saved.status) ||
      (saved.status === 'completed') !== (saved.currentIndex === saved.questionIds.length)) {
    throw new Error('進行状況を読み込めません。');
  }
  const selected = saved.questionIds.map(id => questions.find(q => q.id === id));
  if (selected.some(q => !q) || saved.attempts.some((a, i) =>
    a.questionId !== saved.questionIds[i] || a.sessionId !== saved.id ||
    a.id !== `${saved.id}:${i}` || !ratings.includes(a.rating) || typeof a.answeredAt !== 'string')) {
    throw new Error('進行状況を読み込めません。');
  }
  return { id: saved.id, questions: selected, category: null, attempts: [...saved.attempts], revealed: false };
}

export function startOrResumeToday(storage, dataset, questions, makeId = () => crypto.randomUUID()) {
  const history = readHistory(storage, dataset);
  if (history.todaySession) {
    const restored = restoreToday(history.todaySession, questions);
    if (history.todaySession.status === 'active') return restored;
  }
  const selected = selectQuestions(questions);
  if (!selected.length) throw new Error('問題がありません。');
  const saved = { id: makeId(), questionIds: selected.map(q => q.id), currentIndex: 0,
    attempts: [], status: 'active' };
  history.todaySession = saved;
  storage.setItem(storageKey(dataset), JSON.stringify(history));
  return restoreToday(saved, questions);
}

export function pendingTodayResult(storage, dataset, questions) {
  const saved = readHistory(storage, dataset).todaySession;
  return saved?.status === 'completed' && !saved.resultDismissed ? restoreToday(saved, questions) : null;
}

export function dismissTodayResult(storage, dataset, sessionId) {
  const history = readHistory(storage, dataset);
  if (history.todaySession?.id === sessionId && history.todaySession.status === 'completed') {
    history.todaySession.resultDismissed = true;
    storage.setItem(storageKey(dataset), JSON.stringify(history));
  }
}

export function saveTodayAttempt(storage, dataset, session, attempt) {
  const history = readHistory(storage, dataset);
  const saved = history.todaySession;
  if (!saved || saved.id !== session.id || saved.status !== 'active' ||
      saved.currentIndex !== session.attempts.length ||
      attempt.sessionId !== saved.id || attempt.id !== `${saved.id}:${saved.currentIndex}` ||
      attempt.questionId !== saved.questionIds[saved.currentIndex] || !ratings.includes(attempt.rating)) {
    throw new Error('進行状況が変更されています。ホームから再開してください。');
  }
  saved.attempts.push(attempt);
  saved.currentIndex += 1;
  if (saved.currentIndex === saved.questionIds.length) saved.status = 'completed';
  if (!history.attempts.some(a => a.id === attempt.id)) history.attempts.push(attempt);
  // 評価履歴と進行状況を同じキーへ一括保存し、片方だけ進むことを防ぐ。
  storage.setItem(storageKey(dataset), JSON.stringify(history));
}
