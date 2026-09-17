// 指定されたDeep Research書き出しの確定版テーブルだけを取り込む。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { categories } from '../dist/data/questions.js';

const input = process.argv[2];
assert.ok(input, 'レポートのファイルパスを指定してください。');
const raw = await readFile(input);
const report = JSON.parse(raw.toString('utf8'));
const body = report.widget_state.report_message.content.parts.join('\n');
const heading = '## 検証済み50問データセット';
assert.equal(body.split(heading).length, 2);
const section = body.split(heading)[1].split(/^## /m)[0];
const lines = section.split('\n').filter(line => /^\| Q\d+ \|/.test(line));
assert.equal(lines.length, 50);
const questions = lines.map((line, index) => {
  const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
  assert.equal(cells.length, 8);
  const [number, category, type, question, answer, explanation, source, exam] = cells;
  assert.equal(number, `Q${index + 1}`);
  assert.ok(categories.includes(category));
  return { id: `Q${String(index + 1).padStart(3, '0')}`, category, type, question, answer, explanation,
    relatedExam: exam === '未指定' ? null : exam, source };
});
const counts = Object.fromEntries(categories.map(category => [category, questions.filter(q => q.category === category).length]));
for (const [category, count] of Object.entries(counts)) {
  const match = body.match(new RegExp(`"${category}"\\s*:\\s*(\\d+)`));
  assert.ok(match, `レポートの構成図に${category}が必要です`);
  assert.equal(count, Number(match[1]));
}
await mkdir('tests/fixtures', { recursive: true });
await writeFile('tests/fixtures/verified-dataset.md', `${heading}${section}`, 'utf8');
await writeFile('tests/fixtures/report-provenance.json', JSON.stringify({
  title: report.title, reportSha256: createHash('sha256').update(raw).digest('hex'),
  section: heading, categoryCounts: counts,
}, null, 2) + '\n');
await writeFile('dist/data/questions.js',
  '// 添付レポート「検証済み50問データセット」から原文のまま転記。\n' +
  '// Markdown強調記号を含め本文を保持。出典は内部データとして保存。\n' +
  "export const dataset = 'official';\n" +
  `export const categories = ${JSON.stringify(categories, null, 2)};\n` +
  `export const questions = ${JSON.stringify(questions, null, 2)};\n`);
console.log(JSON.stringify({ count: questions.length, categoryCounts: counts,
  relatedExams: questions.filter(q => q.relatedExam !== null).length }, null, 2));
