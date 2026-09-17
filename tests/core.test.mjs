import test from 'node:test';
import assert from 'node:assert/strict';
import { selectQuestions, validateQuestions, saveAttempt, readHistory, tally, storageKey } from '../dist/core.js';
import { questions, categories } from '../dist/data/questions.js';

test('同一セッションで重複せず10問、元データを変更しない', () => {
  const fixture = Array.from({length: 12}, (_, i) => ({id: `TEST${i}`, category: i < 4 ? 'A' : 'B'}));
  for (let i = 0; i < 100; i++) {
    const selected = selectQuestions(fixture);
    assert.equal(selected.length, 10);
    assert.equal(new Set(selected.map(q => q.id)).size, 10);
  }
  assert.equal(fixture[0].id, 'TEST0');
  assert.equal(selectQuestions(fixture, 'A').length, 4);
  assert.ok(selectQuestions(fixture, 'A').every(q => q.category === 'A'));
  assert.deepEqual(selectQuestions(fixture, 'C'), []);
});
test('正式50問、全形式とデータ構造を確認', () => {
  validateQuestions(questions, categories);
  assert.equal(questions.length, 50);
  assert.equal(selectQuestions(questions).length, 10);
  assert.equal(new Set(questions.map(q => q.type)).size, 3);
  assert.throws(() => validateQuestions([...questions, questions[0]], categories));
});
test('履歴の再読込・重複保存防止・サンプル分離・集計', () => {
  const map = new Map();
  const storage = {getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v)};
  const attempt = {id: 'session:0', sessionId: 'session', questionId: 'TEST0', rating: 'understood', answeredAt: new Date().toISOString()};
  saveAttempt(storage, 'sample', attempt);
  saveAttempt(storage, 'sample', attempt);
  assert.equal(readHistory(storage, 'sample').attempts.length, 1);
  assert.equal(readHistory(storage, 'official').attempts.length, 0);
  assert.deepEqual(tally(readHistory(storage, 'sample').attempts), {understood: 1, unsure: 0, unknown: 0});
  map.set(storageKey('sample'), '{broken');
  assert.throws(() => saveAttempt(storage, 'sample', attempt));
  assert.equal(map.get(storageKey('sample')), '{broken');
});
test('保存不可を呼び出し元に通知', () => {
  assert.throws(() => saveAttempt({getItem: () => null, setItem: () => {throw new Error('quota');}}, 'sample', {id: 'test'}));
});
