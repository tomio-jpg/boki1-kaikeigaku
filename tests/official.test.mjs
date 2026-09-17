import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
import { questions, categories, dataset } from '../dist/data/questions.js';
import { selectQuestions, saveAttempt, readHistory, tally } from '../dist/core.js';

const source = await readFile(new URL('./fixtures/verified-dataset.md', import.meta.url), 'utf8');
const provenance = JSON.parse(await readFile(new URL('./fixtures/report-provenance.json', import.meta.url), 'utf8'));
const rows = source.split('\n').filter(line => /^\| Q\d+ \|/.test(line));

test('1–4: 正式50問・連続ID・重複なし・サンプルなし', () => {
  assert.equal(dataset, 'official');
  assert.equal(questions.length, 50);
  assert.deepEqual(questions.map(q => q.id), Array.from({length: 50}, (_, i) => `Q${String(i + 1).padStart(3, '0')}`));
  assert.equal(new Set(questions.map(q => q.id)).size, 50);
  assert.doesNotMatch(JSON.stringify(questions), /SAMPLE|サンプル|ダミー/i);
});
test('5–7: 全9カテゴリー・レポートと同じ件数・本文に空欄なし', () => {
  assert.equal(categories.length, 9);
  assert.equal(new Set(questions.map(q => q.category)).size, 9);
  assert.deepEqual(Object.fromEntries(categories.map(c => [c, questions.filter(q => q.category === c).length])), provenance.categoryCounts);
  for (const q of questions) for (const field of ['question', 'answer', 'explanation']) assert.ok(q[field].trim(), `${q.id}.${field}`);
});
test('原文照合: 全50問の全フィールド・出典・関連過去問が確定版表と一致', () => {
  assert.equal(rows.length, 50);
  for (const [i, row] of rows.entries()) {
    const [id, category, type, question, answer, explanation, reference, exam] = row.split('|').slice(1, -1).map(cell => cell.trim());
    assert.deepEqual(questions[i], {id: `Q${id.slice(1).padStart(3, '0')}`, category, type, question, answer, explanation, source: reference, relatedExam: exam === '未指定' ? null : exam});
  }
  assert.equal(questions.filter(q => q.relatedExam === null).length, 36);
  assert.equal(questions.filter(q => q.relatedExam !== null).length, 14);
});
test('8: 正式50問から10問を重複なしで選択（100回）', () => {
  for (let i = 0; i < 100; i++) {
    const selection = selectQuestions(questions);
    assert.equal(selection.length, 10);
    assert.equal(new Set(selection.map(q => q.id)).size, 10);
    assert.ok(selection.every(q => questions.includes(q)));
  }
});
test('9: 全カテゴリーが該当する全問だけを重複なしで出題', () => {
  for (const c of categories) {
    const selection = selectQuestions(questions, c);
    assert.equal(selection.length, provenance.categoryCounts[c]);
    assert.ok(selection.every(q => q.category === c));
    assert.equal(new Set(selection.map(q => q.id)).size, selection.length);
  }
});
test('10: 正式ID・○△×・日時を保存し、再読込・集計できる', () => {
  const values = new Map();
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  const attempts = questions.map((q, i) => ({ id: `session:${i}`, sessionId: 'session', questionId: q.id,
    rating: ['understood', 'unsure', 'unknown'][i % 3], answeredAt: new Date(2026, 8, 16, 12, i).toISOString(), dataset }));
  for (const a of attempts) saveAttempt(storage, dataset, a);
  assert.deepEqual(readHistory(storage, dataset).attempts, attempts);
  assert.deepEqual(tally(readHistory(storage, dataset).attempts), {understood: 17, unsure: 17, unknown: 16});
  assert.deepEqual(readHistory(storage, 'sample').attempts, []);
});
test('11: PWAの相対パス・アイコン・更新キャッシュ・他アプリとの分離', async () => {
  const root = new URL('../dist/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(icon.src, root));
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  const html = await readFile(new URL('index.html', root), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) await access(new URL(match[1], root));
  const code = await readFile(new URL('sw.js', root), 'utf8');
  const events = {};
  const scope = 'https://example.test/boki/';
  const old = `boki1-accounting:${scope}:v2`;
  const current = `boki1-accounting:${scope}:v7`;
  const foreign = 'other-app-cache';
  const deleted = [];
  let cachedAssets;
  let activated = false;
  vm.runInNewContext(code, {
    URL, Request,
    self: {registration: {scope}, skipWaiting: async () => { activated = true; }, clients: {claim: async () => {}}, addEventListener: (name, fn) => events[name] = fn},
    caches: {open: async key => { assert.equal(key, current); return {addAll: async assets => { cachedAssets = assets.map(request => { assert.equal(request.cache, 'reload'); return './' + request.url.slice(scope.length); }); }}; },
      keys: async () => [old, current, foreign], delete: async key => deleted.push(key)},
  });
  let done;
  events.install({waitUntil: promise => done = promise});
  await done;
  assert.equal(activated, true);
  for (const asset of cachedAssets) await access(new URL(asset, root));
  assert.ok(cachedAssets.includes('./data/questions.js'));
  events.activate({waitUntil: promise => done = promise});
  await done;
  assert.deepEqual(deleted, [old]);
  assert.equal(typeof events.fetch, 'function');
});
