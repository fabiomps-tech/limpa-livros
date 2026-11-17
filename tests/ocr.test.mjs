import test from 'node:test';
import assert from 'node:assert/strict';
import { ocrLinesToPage, ocrPdf, MSG_OCR_DATA } from '../src/ocr/ocr.js';
import { BookError } from '../src/model.js';

const w = (text, x0, y0, x1, y1) => ({ text, bbox: { x0, y0, x1, y1 } });

test('ocrLinesToPage: duas linhas do OCR viram 2 Lines na ordem, unidas por espaço', () => {
  const lines = [
    { words: [w('linha', 50, 140, 110, 160), w('segunda', 120, 141, 210, 162)] },
    { words: [w('Primeira', 50, 100, 150, 122), w('ação', 160, 101, 215, 120)] },
  ];
  const page = ocrLinesToPage(lines, 3, 420, 595);
  assert.equal(page.number, 3);
  assert.equal(page.width, 420);
  assert.equal(page.height, 595);
  assert.deepEqual(page.lines.map((l) => l.text), ['Primeira ação', 'linha segunda']);
  assert.ok(page.lines[0].y < page.lines[1].y);
});

test('ocrLinesToPage: palavras com ascendentes, descendentes e só altura-x ficam com o mesmo tamanho e y', () => {
  const lines = [{
    words: [
      w('Linha', 10, 100, 40, 112), // ascendente: altura 12
      w('pagina', 45, 103, 80, 116), // descendente: base mais baixa
      w('mar', 85, 104, 105, 112), // só altura-x: altura 8
      w('agora', 110, 104, 140, 115), // descendente
      w('fala', 145, 100, 165, 112), // ascendente
    ],
  }];
  const page = ocrLinesToPage(lines, 1, 420, 595);
  assert.equal(page.lines.length, 1);
  const [line] = page.lines;
  assert.equal(line.text, 'Linha pagina mar agora fala');
  const sizes = new Set(line.items.map((i) => i.size));
  const ys = new Set(line.items.map((i) => i.y));
  assert.equal(sizes.size, 1);
  assert.equal(ys.size, 1);
  assert.ok(Math.abs(line.size - 9.6) < 1e-9); // mediana dos tamanhos brutos
  assert.equal(line.y, 112); // mediana das bases
});

test('ocrLinesToPage: "1" pequeno e elevado depois de uma palavra mantém tamanho menor e y mais alto', () => {
  const lines = [{
    words: [
      w('chamada', 10, 100, 60, 112),
      w('de', 65, 100, 80, 112),
      w('linha', 85, 100, 115, 112),
      w('1', 117, 104, 120, 109), // altura 5 (< 0.75×), base 3 acima
    ],
  }];
  const page = ocrLinesToPage(lines, 1, 420, 595);
  assert.equal(page.lines.length, 1);
  const items = page.lines[0].items;
  const one = items.find((i) => i.str === '1');
  const body = items.find((i) => i.str === 'linha');
  assert.ok(one.size < body.size);
  assert.ok(one.y < body.y);
  assert.equal(one.size, 5 * 0.8);
  assert.equal(one.y, 109);
});

test('ocrLinesToPage ignora palavras vazias e não altera a entrada', () => {
  const lines = [{ words: [w('Olá', 10, 50, 40, 70), w('  ', 50, 50, 60, 70)] }];
  const copy = structuredClone(lines);
  const page = ocrLinesToPage(lines, 1, 100, 100);
  assert.deepEqual(lines, copy);
  assert.equal(page.lines.length, 1);
  assert.deepEqual(page.lines[0].items.map((i) => i.str), ['Olá']);
  assert.equal(page.lines[0].items[0].size, 16);
  assert.equal(page.lines[0].items[0].y, 70);
});

test('ocrPdf: falha ao iniciar o OCR (dados não baixados) vira BookError e fecha o PDF', async () => {
  let destroyed = false;
  const pdfjs = { getDocument: () => ({ promise: Promise.resolve({ numPages: 1, destroy: async () => { destroyed = true; } }) }) };
  const Tesseract = { createWorker: async () => { throw new Error('network'); } };
  await assert.rejects(ocrPdf(new Uint8Array(), { pdfjs, Tesseract }), (e) => e instanceof BookError && e.message === MSG_OCR_DATA);
  assert.equal(destroyed, true);
  assert.equal(MSG_OCR_DATA, 'Não foi possível baixar os dados de reconhecimento de texto. Conecte-se à internet na primeira vez que usar o modo escaneado e tente de novo.');
});

test('ocrPdf: Tesseract ausente (falha ao carregar a biblioteca) vira BookError', async () => {
  const pdfjs = { getDocument: () => ({ promise: Promise.resolve({ numPages: 1, destroy: async () => {} }) }) };
  await assert.rejects(ocrPdf(new Uint8Array(), { pdfjs, Tesseract: undefined }), (e) => e instanceof BookError && e.message === MSG_OCR_DATA);
});

test('ocrPdf: modelo que falha ao baixar (Tesseract 5 só avisa pelo errorHandler) vira BookError', async () => {
  let destroyed = false;
  const pdfjs = { getDocument: () => ({ promise: Promise.resolve({ numPages: 1, destroy: async () => { destroyed = true; } }) }) };
  // Como no tesseract.js 5: a falha de loadLanguage chama errorHandler e a promessa de createWorker nunca resolve.
  const Tesseract = { createWorker: (langs, oem, opts) => { setTimeout(() => opts.errorHandler('Error: Network error while fetching'), 0); return new Promise(() => {}); } };
  await assert.rejects(ocrPdf(new Uint8Array(), { pdfjs, Tesseract }), (e) => e instanceof BookError && e.message === MSG_OCR_DATA);
  assert.equal(destroyed, true);
});

test('ocrLinesToPage: uma linha do OCR que atravessa duas colunas vira duas Lines', () => {
  const lines = [{ words: [w('esquerda', 30, 100, 190, 112), w('direita', 220, 100, 380, 112)] }];
  const page = ocrLinesToPage(lines, 1, 420, 595);
  assert.deepEqual(page.lines.map((l) => l.text), ['esquerda', 'direita']);
});
