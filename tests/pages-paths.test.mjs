import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

test('GitHub Pagesの実サブディレクトリでHTML・JS・PWAの全参照が解決する', async () => {
  const base = new URL('https://tomio-jpg.github.io/boki1-kaikeigaku/');
  const root = new URL('../dist/', import.meta.url);
  async function check(path, from = base) {
    const resolved = new URL(path, from);
    assert.ok(resolved.href.startsWith(base.href), `${path} が公開範囲外`);
    const relative = resolved.href.slice(base.href.length);
    await access(new URL(relative || 'index.html', root));
  }
  const html = await readFile(new URL('index.html', root), 'utf8');
  for (const [, path] of html.matchAll(/(?:href|src)="([^"]+)"/g)) await check(path);
  for (const file of ['app.js', 'core.js', 'data/questions.js']) {
    const text = await readFile(new URL(file, root), 'utf8');
    for (const [, path] of text.matchAll(/from ['"]([^'"]+)['"]/g)) await check(path, new URL(file, base));
  }
  const app = await readFile(new URL('app.js', root), 'utf8');
  assert.match(app, /register\('\.\/sw\.js'/);
  await check('./sw.js');
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
  for (const key of ['id', 'scope', 'start_url']) assert.equal(new URL(manifest[key], base).href, base.href);
  for (const icon of manifest.icons) await check(icon.src);
  const sw = await readFile(new URL('sw.js', root), 'utf8');
  for (const [, path] of sw.matchAll(/'(\.\/[^']*)'/g)) await check(path);
});
