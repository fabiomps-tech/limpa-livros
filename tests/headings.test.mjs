import test from 'node:test';
import assert from 'node:assert/strict';
import { markHeadings } from '../src/clean/headings.js';

const p = (text, page, size = 11, lineCount = 1) => ({ type: 'p', text, page, size, lineCount });

test('outline: bloco com o mesmo título vira h com o nível do outline', () => {
  const blocks = [p('Texto anterior.', 1), p('Capítulo 1', 2, 11), p('Corpo do capítulo.', 2)];
  const out = markHeadings(blocks, [], [{ title: 'Capítulo 1', page: 2, level: 1 }], 11);
  assert.equal(out[1].type, 'h');
  assert.equal(out[1].level, 1);
  assert.equal(out[2].type, 'p');
});

test('outline: comparação ignora acentos, caixa e espaços; nível máximo 2', () => {
  const blocks = [p('  CAPITULO   dois: a volta', 3)];
  const out = markHeadings(blocks, [], [{ title: 'Capítulo dois', page: 3, level: 4 }], 11);
  assert.equal(out[0].type, 'h');
  assert.equal(out[0].level, 2);
});

test('outline: sem bloco correspondente, insere h antes do primeiro bloco da página', () => {
  const blocks = [p('Um.', 1), p('Dois.', 2), p('Três.', 2)];
  const out = markHeadings(blocks, [], [{ title: 'Parte II', page: 2, level: 1 }], 11);
  assert.equal(out.length, 4);
  assert.deepEqual(out[1], { type: 'h', level: 1, text: 'Parte II', page: 2 });
  assert.equal(out[2].text, 'Dois.');
});

test('não altera a entrada', () => {
  const blocks = [p('Capítulo 1', 2)];
  const snap = JSON.stringify(blocks);
  markHeadings(blocks, [], [{ title: 'Capítulo 1', page: 2, level: 1 }], 11);
  markHeadings(blocks, [], [], 11);
  assert.equal(JSON.stringify(blocks), snap);
});

test('sem outline: 18pt com corpo 11pt vira h nível 1', () => {
  const out = markHeadings([p('O Começo', 1, 18), p('Corpo normal.', 1, 11)], [], [], 11);
  assert.equal(out[0].type, 'h');
  assert.equal(out[0].level, 1);
  assert.equal(out[1].type, 'p');
});

test('sem outline: 13pt com corpo 11pt vira h nível 2', () => {
  const out = markHeadings([p('Subtítulo', 1, 13)], [], [], 11);
  assert.equal(out[0].type, 'h');
  assert.equal(out[0].level, 2);
});

test('sem outline: bloco longo ou com muitas linhas não vira h', () => {
  const long = 'x'.repeat(90);
  const out = markHeadings([p(long, 1, 18), p('a b', 1, 18, 3)], [], [], 11);
  assert.equal(out[0].type, 'p');
  assert.equal(out[1].type, 'p');
});
