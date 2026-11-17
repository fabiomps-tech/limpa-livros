import test from 'node:test';
import assert from 'node:assert/strict';
import { ocrWordsToPage } from '../src/ocr/ocr.js';

const w = (text, x0, y0, x1, y1) => ({ text, bbox: { x0, y0, x1, y1 } });

test('ocrWordsToPage: palavras de duas linhas viram 2 Lines na ordem, unidas por espaço', () => {
  const words = [
    w('linha', 50, 140, 110, 160),
    w('Primeira', 50, 100, 150, 122),
    w('segunda', 120, 141, 210, 162),
    w('ação', 160, 101, 215, 120),
  ];
  const page = ocrWordsToPage(words, 3, 420, 595);
  assert.equal(page.number, 3);
  assert.equal(page.width, 420);
  assert.equal(page.height, 595);
  assert.equal(page.lines.length, 2);
  assert.deepEqual(page.lines.map((l) => l.text), ['Primeira ação', 'linha segunda']);
  assert.ok(page.lines[0].y < page.lines[1].y);
});

test('ocrWordsToPage: tamanho estimado como (y1-y0)*0.8 e palavras vazias ignoradas', () => {
  const page = ocrWordsToPage([w('Olá', 10, 50, 40, 70), w('  ', 50, 50, 60, 70)], 1, 100, 100);
  assert.equal(page.lines.length, 1);
  const [item] = page.lines[0].items;
  assert.equal(item.size, 16);
  assert.equal(item.x, 10);
  assert.equal(item.width, 30);
  assert.equal(item.y, 70);
});

test('ocrWordsToPage não altera as palavras recebidas', () => {
  const words = [w('Olá', 10, 50, 40, 70)];
  const copy = structuredClone(words);
  ocrWordsToPage(words, 1, 100, 100);
  assert.deepEqual(words, copy);
});
