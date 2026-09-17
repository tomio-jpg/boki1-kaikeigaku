import { questions, categories, dataset } from './data/questions.js';
import { validateQuestions, selectQuestions, saveAttempt, tally, startOrResumeToday, saveTodayAttempt, pendingTodayResult, dismissTodayResult } from './core.js';

const app = document.querySelector('#app');
const notice = document.querySelector('#notice');
const labels = { understood: '○ わかった', unsure: '△ あやしい', unknown: '× わからない' };
let session;
let review;
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function show(html) {
  app.innerHTML = html;
  window.scrollTo(0, 0);
  const title = app.querySelector('h1');
  title?.setAttribute('tabindex', '-1');
  title?.focus({ preventScroll: true });
}
function button(action, text, style = 'secondary') { return `<button class="${style}" data-action="${action}">${text}</button>`; }
function home() {
  if (session?.category === null && session.attempts.length === session.questions.length) {
    try { dismissTodayResult(localStorage, dataset, session.id); }
    catch { notice.textContent = '終了状態を保存できませんでした。もう一度お試しください。'; return; }
  }
  session = null;
  review = null;
  show(`<section class="home"><p class="eyebrow">毎日、少しずつ。</p><h1>今日も、会計学を<br>ひとつずつ。</h1><p class="intro">1日10〜15分の理論トレーニング</p>
    <div class="home-actions">${button('today', '今日の10問 <span aria-hidden="true">→</span>', 'primary')}${button('categories', 'カテゴリーから選ぶ')}</div>
    <aside class="registration-info"><strong>登録済み・${questions.length}問</strong><p>「今日の10問」では${questions.length}問から<br>重複なしで${Math.min(10, questions.length)}問を出題します。</p></aside>
    <p class="footnote">試験日：2026年11月15日<br>学習結果はこの端末に保存されます。</p></section>`);
}
function categoryList() {
  show(`${button('home', '← ホーム', 'back')}<h1>カテゴリーから選ぶ</h1><p class="intro">選んだカテゴリーから最大10問</p><div class="categories">${categories.map((c, i) => {
    const count = questions.filter(q => q.category === c).length;
    return `<button class="category" data-category="${i}" ${count === 0 ? 'disabled' : ''}><span>${escape(c)}</span><small>${count ? `${count}問` : '準備中'}</small></button>`;
  }).join('')}</div>`);
}
function start(category = null) {
  if (category === null) {
    try { session = startOrResumeToday(localStorage, dataset, questions); }
    catch { notice.textContent = '進行状況を保存・読み込みできませんでした。ブラウザーの保存設定や空き容量を確認してください。'; return; }
    questionView();
    return;
  }
  const selected = selectQuestions(questions, category);
  if (!selected.length) { notice.textContent = '問題がまだ登録されていません。'; return; }
  session = { id: crypto.randomUUID(), questions: selected, category, attempts: [], revealed: false };
  questionView();
}
function questionView() {
  const list = review ? review.questions : session.questions;
  const index = review ? review.index : session.attempts.length;
  const q = list[index];
  show(`${button(review ? 'home' : 'leave', '← ホーム', 'back')}<div class="progress-label"><span>${review ? '今回の復習' : '今回のトレーニング'}</span><strong>${index + 1} / ${list.length}</strong></div>
    <progress aria-label="${review ? '確認済み' : '回答済み'}の問題数" value="${index}" max="${list.length}"></progress>
    <article class="question-card"><div class="tags"><span>${escape(q.category)}</span><span>${escape(q.type)}</span></div><h1 class="question">${escape(q.question)}</h1>
    <div id="answer" hidden><section class="answer"><h2>答え</h2><p>${escape(q.answer)}</p><h2>解説</h2><p>${escape(q.explanation)}</p>${q.relatedExam ? `<p class="related">関連過去問：${escape(q.relatedExam)}</p>` : ''}</section></div></article>
    <div id="reveal">${button('reveal', '答えを見る', 'primary')}</div>${review ? `<div id="review-next" hidden>${button('review-next', '次の問題へ', 'primary')}</div>` : `<div id="ratings" hidden><p class="rating-prompt">理解できましたか？</p><div class="rating-buttons">${Object.entries(labels).map(([value, label]) => `<button class="rating ${value}" data-rating="${value}">${label}</button>`).join('')}</div></div>`}<p id="save-error" role="alert"></p>`);
}
function reviewQuestions() {
  const ids = new Set(session.attempts.filter(a => a.rating === 'unsure' || a.rating === 'unknown').map(a => a.questionId));
  return session.questions.filter(q => ids.has(q.id));
}
function result() {
  const counts = tally(session.attempts);
  const title = session.category ? 'トレーニング終了！' : session.questions.length === 10 ? '今日の10問終了！' : `今日の${session.questions.length}問終了！`;
  show(`<section class="result"><p class="eyebrow">おつかれさまでした</p><h1>${title}</h1><p class="intro">${session.questions.length}問、振り返りました。</p><div class="result-counts">${Object.entries(labels).map(([key, label]) => `<div class="result-row ${key}"><span>${label}</span><strong>${counts[key]}<small>問</small></strong></div>`).join('')}</div><p class="footnote">この端末に保存しました。</p>${session.category === null && reviewQuestions().length ? `<div class="result-actions">${button('review', '△・×を復習する', 'secondary')}</div>` : ''}${button('home', 'ホームへ戻る', 'primary')}</section>`);
}
app.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target || target.disabled) return;
  notice.textContent = '';
  if (target.dataset.category !== undefined) return start(categories[Number(target.dataset.category)]);
  if (target.dataset.rating && session?.revealed && !review) {
    const index = session.attempts.length;
    const attempt = { id: `${session.id}:${index}`, sessionId: session.id, questionId: session.questions[index].id,
      rating: target.dataset.rating, answeredAt: new Date().toISOString(), dataset };
    try {
      if (session.category === null) saveTodayAttempt(localStorage, dataset, session, attempt);
      else saveAttempt(localStorage, dataset, attempt);
    }
    catch { document.querySelector('#save-error').textContent = '保存できませんでした。ブラウザーの保存設定や空き容量を確認し、もう一度評価を押してください。回答はまだ進めていません。'; return; }
    session.attempts.push(attempt);
    session.revealed = false;
    return session.attempts.length === session.questions.length ? result() : questionView();
  }
  switch (target.dataset.action) {
    case 'home': return home();
    case 'leave': if (confirm('ホームへ戻りますか？ 回答済みの評価は保存されています。')) home(); return;
    case 'today': return start();
    case 'categories': return categoryList();
    case 'review':
      if (!session || session.category !== null || session.attempts.length !== session.questions.length) return;
      const selected = reviewQuestions();
      if (!selected.length) return;
      review = { questions: selected, index: 0, revealed: false };
      return questionView();
    case 'review-next':
      if (!review?.revealed) return;
      review.index += 1;
      review.revealed = false;
      if (review.index < review.questions.length) return questionView();
      review = null;
      return show(`<section class="result"><h1>復習完了！</h1>${button('home', 'ホームへ戻る', 'primary')}</section>`);
    case 'reveal':
      if (review) review.revealed = true;
      else session.revealed = true;
      document.querySelector('#answer').hidden = false;
      document.querySelector(review ? '#review-next' : '#ratings').hidden = false;
      document.querySelector('#reveal').hidden = true;
      document.querySelector('#answer').setAttribute('tabindex', '-1');
      document.querySelector('#answer').focus({ preventScroll: true });
  }
});
try {
  validateQuestions(questions, categories);
  try { session = pendingTodayResult(localStorage, dataset, questions); }
  catch { notice.textContent = '保存済みの結果を読み込めませんでした。'; }
  if (session) result();
  else home();
}
catch { show('<h1>問題データを確認してください</h1><p>問題データの形式に誤りがあります。</p>'); }
if ('serviceWorker' in navigator) {
  // 完了結果は保存から復元できる。学習中・復習中には更新で画面を中断しない。
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!review && (!session || session.attempts.length === session.questions.length)) window.location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => { notice.textContent = 'オフラインの準備ができませんでした。通信環境を確認して、アプリを開き直してください。'; });
}
