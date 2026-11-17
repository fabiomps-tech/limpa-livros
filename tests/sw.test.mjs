// Mantém a lista de pré-cache do service worker em sincronia com os arquivos reais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function shellList() {
  const src = readFileSync(join(root, 'sw.js'), 'utf8');
  const m = /const SHELL = \[([\s\S]*?)\];/.exec(src);
  assert.ok(m, 'sw.js deve declarar const SHELL = [ ... ];');
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const toPath = (url) => (url === './' ? 'index.html' : url.replace(/^\.\//, ''));

test('sw.js: CACHE tem versão', () => {
  const src = readFileSync(join(root, 'sw.js'), 'utf8');
  assert.match(src, /const CACHE = 'limpa-livros-v\d+';/);
});

test('sw.js: todo caminho da lista existe e é relativo', () => {
  const list = shellList();
  assert.ok(list.length > 0);
  assert.equal(new Set(list).size, list.length, 'sem repetidos');
  for (const url of list) {
    assert.ok(url.startsWith('./'), `${url} deve começar com ./`);
    assert.ok(existsSync(join(root, toPath(url))), `${url} não existe`);
  }
});

test('sw.js: lista inclui todo src/, o manifest, os ícones e as bibliotecas sem OCR', () => {
  const list = new Set(shellList());
  const expected = [
    ...walk(join(root, 'src')),
    ...walk(join(root, 'icons')),
    join(root, 'index.html'),
    join(root, 'style.css'),
    join(root, 'manifest.webmanifest'),
    join(root, 'vendor', 'pdf.min.mjs'),
    join(root, 'vendor', 'pdf.worker.min.mjs'),
    join(root, 'vendor', 'jszip.min.js'),
  ].map((p) => './' + relative(root, p).split('\\').join('/'));
  for (const url of expected) assert.ok(list.has(url), `${url} falta na lista SHELL`);
  assert.ok(list.has('./'), './ falta na lista SHELL');
  for (const url of list) assert.ok(!url.includes('tesseract'), `${url}: o OCR é guardado no primeiro uso, não na instalação`);
});

test('manifest: ícones listados existem', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Limpa Livros');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  for (const icon of manifest.icons) assert.ok(existsSync(join(root, toPath(icon.src.startsWith('./') ? icon.src : './' + icon.src))), icon.src);
});

test('sw.js: só pula a espera ao receber SKIP_WAITING (nunca sozinho)', async () => {
  const handlers = {};
  let skipped = 0;
  const fakeSelf = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => { skipped++; return Promise.resolve(); },
    location: { origin: 'http://localhost' },
    clients: { claim: async () => {} },
  };
  const fakeCaches = { open: async () => ({ addAll: async () => {} }), keys: async () => [] };
  const src = readFileSync(join(root, 'sw.js'), 'utf8');
  new Function('self', 'caches', 'Request', src)(fakeSelf, fakeCaches, class { constructor(u) { this.url = u; } });
  const waits = [];
  handlers.install({ waitUntil: (p) => waits.push(p) });
  handlers.activate({ waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.equal(skipped, 0);
  handlers.message({ data: { type: 'outra' } });
  assert.equal(skipped, 0);
  handlers.message({ data: { type: 'SKIP_WAITING' } });
  assert.equal(skipped, 1);
});
