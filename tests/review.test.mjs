import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as core from '../dist/core.js';
import { questions, categories, dataset } from '../dist/data/questions.js';

// 実際のapp.jsのクリック処理を、分離した端末ストレージと最小DOMで実行する。
const code = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
function launch(values = new Map()) {
  let click;
  const elements = new Map();
  const app = { html: '', set innerHTML(value) { this.html = value; elements.clear(); },
    querySelector: () => null, addEventListener: (_, fn) => click = fn };
  const storage = {getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v)};
  const document = {querySelector(selector) {
    if (selector === '#app') return app;
    if (!elements.has(selector)) elements.set(selector, { hidden: true, textContent: '', focus() {}, setAttribute() {} });
    return elements.get(selector);
  }};
  let id = 0;
  vm.runInNewContext(code, { ...core, questions, categories, dataset, document, localStorage: storage,
    crypto: {randomUUID: () => `test-${++id}`}, window: {scrollTo() {}}, navigator: {}, confirm: () => true });
  return {app, values, storage, document, click(data) {click({target: {closest: () => ({dataset: data})}});},
    answer(rating) {this.click({action: 'reveal'}); this.click({rating});} };
}
function complete(ratings) {
  const ui = launch();
  ui.click({action: 'today'});
  for (const rating of ratings) ui.answer(rating);
  return ui;
}
test('△×だけを出題順に復習、答えを隠す、再評価なし、完了まで履歴不変', () => {
  const ui = complete(['understood', 'unsure', 'unknown', 'understood', 'unsure', 'unknown', 'unsure', 'understood', 'unknown', 'unsure']);
  assert.match(ui.app.html, /△・×を復習する/);
  assert.match(ui.app.html, /○ わかった/);
  const snapshot = ui.storage.getItem(core.storageKey(dataset));
  const saved = core.readHistory(ui.storage, dataset).todaySession;
  const expected = saved.attempts.filter(a => a.rating !== 'understood').map(a => a.questionId);
  assert.equal(expected.length, 7);
  ui.click({action: 'review'});
  for (let i = 0; i < 7; i++) {
    assert.match(ui.app.html, /今回の復習/);
    assert.ok(ui.app.html.includes(`${i + 1} / 7`));
    assert.ok(ui.app.html.includes(questions.find(q => q.id === expected[i]).question));
    assert.match(ui.app.html, /id="answer" hidden/);
    assert.doesNotMatch(ui.app.html, /data-rating|理解できましたか/);
    const before = ui.app.html;
    ui.click({action: 'review-next'});
    assert.equal(ui.app.html, before, '答えを見る前には進めない');
    ui.click({action: 'reveal'});
    assert.equal(ui.document.querySelector('#answer').hidden, false);
    assert.equal(ui.document.querySelector('#review-next').hidden, false);
    ui.click({rating: 'understood'});
    assert.equal(ui.storage.getItem(core.storageKey(dataset)), snapshot);
    ui.click({action: 'review-next'});
  }
  assert.match(ui.app.html, /復習完了！/);
  assert.match(ui.app.html, /ホームへ戻る/);
  assert.equal(ui.storage.getItem(core.storageKey(dataset)), snapshot);
});
test('全問○の場合は復習ボタンなし', () => {
  const ui = complete(Array(10).fill('understood'));
  assert.match(ui.app.html, /今日の10問終了/);
  assert.doesNotMatch(ui.app.html, /△・×を復習する/);
});
test('完了結果は再起動後に復元され、復習可能。明示的にホームへ戻れば終了', () => {
  let ui = complete(['understood', 'unsure', 'unknown', 'understood', 'unsure', 'unknown', 'unsure', 'understood', 'unknown', 'unsure']);
  const saved = ui.storage.getItem(core.storageKey(dataset));
  ui = launch(ui.values);
  assert.match(ui.app.html, /今日の10問終了/);
  assert.match(ui.app.html, /△・×を復習する/);
  assert.equal(ui.storage.getItem(core.storageKey(dataset)), saved);
  ui.click({action: 'review'});
  assert.match(ui.app.html, /1 \/ 7/);
  ui.click({action: 'home'});
  ui = launch(ui.values);
  assert.doesNotMatch(ui.app.html, /今日の10問終了/);
  assert.equal(core.readHistory(ui.storage, dataset).attempts.length, 10);
});
test('ホーム復帰・アプリ再起動後も3問目から再開し、完了後に復習できる', () => {
  let ui = launch();
  ui.click({action: 'today'});
  ui.answer('unsure'); ui.answer('unknown');
  const original = core.readHistory(ui.storage, dataset).todaySession.questionIds;
  ui.click({action: 'leave'});
  ui.click({action: 'today'});
  assert.match(ui.app.html, /3 \/ 10/);
  ui = launch(ui.values);
  ui.click({action: 'today'});
  assert.match(ui.app.html, /3 \/ 10/);
  assert.deepEqual(core.readHistory(ui.storage, dataset).todaySession.questionIds, original);
  for (let i = 2; i < 10; i++) ui.answer('understood');
  ui.click({action: 'review'});
  assert.match(ui.app.html, /1 \/ 2/);
  ui.click({action: 'home'});
  ui.click({action: 'today'});
  assert.match(ui.app.html, /今回のトレーニング/);
  assert.match(ui.app.html, /1 \/ 10/);
});
