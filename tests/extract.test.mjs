import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makePdf } from './fixtures/make-pdf.mjs';
import { extractPdf } from '../src/pdf/extract.js';
import { BookError } from '../src/model.js';
const fontsUrl = fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url));
const pdfjs = { ...pdfjsLib, getDocument: (o) => pdfjsLib.getDocument({ ...o, standardFontDataUrl: fontsUrl }) };

const spec = {
  title: 'Meu Livro',
  pages: [
    { lines: [{ text: 'Título do livro', y: 60, size: 12 }, { text: 'Segunda linha', y: 90, size: 12 }] },
    { lines: [{ text: 'Página dois', y: 60, size: 12 }], image: true },
  ],
  outline: [{ title: 'Capítulo 1', page: 2 }],
};

test('extrai páginas, linhas, tamanho e y crescente', async () => {
  const r = await extractPdf(await makePdf(spec), pdfjs);
  assert.equal(r.pages.length, 2);
  assert.equal(r.pages[0].number, 1);
  assert.equal(r.pages[0].lines[0].text, 'Título do livro');
  assert.ok(Math.abs(r.pages[0].lines[0].size - 12) <= 0.5);
  assert.ok(r.pages[0].lines[0].y < r.pages[0].lines[1].y);
  assert.equal(r.pages[0].width, 420);
  assert.equal(r.imageCount, 1);
});

test('lê outline com página 1-based e nível', async () => {
  const r = await extractPdf(await makePdf(spec), pdfjs);
  assert.deepEqual(r.outline[0], { title: 'Capítulo 1', page: 2, level: 1 });
});

test('lê o título dos metadados', async () => {
  const r = await extractPdf(await makePdf(spec), pdfjs);
  assert.equal(r.title, 'Meu Livro');
});

test('chama onProgress por página', async () => {
  const calls = [];
  await extractPdf(await makePdf(spec), pdfjs, (d, t) => calls.push([d, t]));
  assert.deepEqual(calls, [[1, 2], [2, 2]]);
});

test('bytes inválidos rejeitam com BookError', async () => {
  await assert.rejects(extractPdf(new Uint8Array([1, 2, 3]), pdfjs), (e) =>
    e instanceof BookError && e.message === 'Não foi possível abrir este PDF. O arquivo pode estar corrompido.');
});

test('PDF com senha rejeita com BookError', async () => {
  const fake = { getDocument: () => ({ promise: Promise.reject({ name: 'PasswordException' }) }) };
  await assert.rejects(extractPdf(new Uint8Array([1]), fake), (e) =>
    e instanceof BookError && e.message === 'Este PDF está protegido por senha ou DRM e não pode ser lido.');
});
