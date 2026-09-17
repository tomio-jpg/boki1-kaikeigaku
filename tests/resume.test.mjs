import test from 'node:test';
import assert from 'node:assert/strict';
import { questions, dataset } from '../dist/data/questions.js';
import { startOrResumeToday, saveTodayAttempt, readHistory, saveAttempt, storageKey } from '../dist/core.js';

function setup() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function answer(storage, session, rating = 'understood') {
  const i = session.attempts.length;
  const attempt = {id: `${session.id}:${i}`, sessionId: session.id, questionId: session.questions[i].id,
    rating, answeredAt: new Date().toISOString(), dataset};
  saveTodayAttempt(storage, dataset, session, attempt);
  session.attempts.push(attempt);
}
test('開始直後から同じ10問・順序を保存。2問評価後は3問目から再開', () => {
  const storage = setup();
  const first = startOrResumeToday(storage, dataset, questions, () => 'first');
  const ids = first.questions.map(q => q.id);
  assert.equal(ids.length, 10);
  assert.equal(new Set(ids).size, 10);
  assert.deepEqual(startOrResumeToday(storage, dataset, questions).questions.map(q => q.id), ids);
  answer(storage, first, 'understood');
  answer(storage, first, 'unsure');
  const restarted = startOrResumeToday(storage, dataset, questions);
  assert.equal(restarted.attempts.length + 1, 3);
  assert.deepEqual(restarted.questions.map(q => q.id), ids);
  assert.deepEqual(restarted.attempts, first.attempts);
  assert.equal(readHistory(storage, dataset).todaySession.currentIndex, 2);
});
test('10問完了で完了扱い。履歴を残して次回は新しいセッション', () => {
  const storage = setup();
  const first = startOrResumeToday(storage, dataset, questions, () => 'first');
  for (let i = 0; i < 10; i++) answer(storage, first, ['understood', 'unsure', 'unknown'][i % 3]);
  assert.equal(readHistory(storage, dataset).todaySession.status, 'completed');
  const next = startOrResumeToday(storage, dataset, questions, () => 'next');
  assert.equal(next.id, 'next');
  assert.equal(next.attempts.length, 0);
  assert.equal(readHistory(storage, dataset).attempts.length, 10);
});
test('既存履歴とカテゴリー学習を保持し、今日の途中経過を壊さない', () => {
  const storage = setup();
  const previous = {id: 'previous:0', sessionId: 'previous', questionId: 'Q001', rating: 'unknown', answeredAt: new Date().toISOString()};
  saveAttempt(storage, dataset, previous);
  const today = startOrResumeToday(storage, dataset, questions, () => 'today');
  answer(storage, today);
  saveAttempt(storage, dataset, {...previous, id: 'category:0', sessionId: 'category'});
  const resumed = startOrResumeToday(storage, dataset, questions);
  assert.equal(resumed.attempts.length, 1);
  assert.equal(resumed.id, today.id);
  assert.equal(readHistory(storage, dataset).attempts.length, 3);
});
test('保存失敗時は履歴と進行状況のどちらも進まない', () => {
  const storage = setup();
  const first = startOrResumeToday(storage, dataset, questions, () => 'first');
  const before = storage.getItem(storageKey(dataset));
  const failing = {...storage, setItem: () => {throw new Error('quota');}};
  assert.throws(() => answer(failing, first));
  assert.equal(storage.getItem(storageKey(dataset)), before);
  assert.equal(first.attempts.length, 0);
  assert.throws(() => startOrResumeToday({...setup(), setItem: failing.setItem}, dataset, questions));
});
test('古い画面からの二重回答や壊れた進行状況を上書きしない', () => {
  const storage = setup();
  const first = startOrResumeToday(storage, dataset, questions, () => 'first');
  const stale = startOrResumeToday(storage, dataset, questions);
  answer(storage, first);
  assert.throws(() => answer(storage, stale));
  assert.equal(readHistory(storage, dataset).attempts.length, 1);
  const corrupt = readHistory(storage, dataset);
  corrupt.todaySession.questionIds[0] = 'missing';
  storage.setItem(storageKey(dataset), JSON.stringify(corrupt));
  assert.throws(() => startOrResumeToday(storage, dataset, questions));
});
