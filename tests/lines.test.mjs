import test from 'node:test';
import assert from 'node:assert/strict';
import { groupItemsIntoLines } from '../src/pdf/lines.js';

const it = (str, x, y, width, size = 10, font = 'f') => ({ str, x, y, width, size, font });

test('itens com a mesma linha de base viram uma Line ordenada por x', () => {
  const lines = groupItemsIntoLines([it('mundo', 40, 100.2, 50), it('Olá', 10, 100, 25)]); // vão 5 < 1.5*size
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0].items.map((i) => i.str), ['Olá', 'mundo']);
  assert.equal(lines[0].x, 10);
  assert.equal(lines[0].width, 80);
});

test('une com espaço quando o vão é > 0.15*size e sem espaço quando menor', () => {
  const [a] = groupItemsIntoLines([it('Ola', 10, 50, 20), it('mundo', 32, 50, 30)]); // vão 2 > 1.5
  assert.equal(a.text, 'Ola mundo');
  const [b] = groupItemsIntoLines([it('Ol', 10, 50, 12), it('a', 22.5, 50, 6)]); // vão 0.5
  assert.equal(b.text, 'Ola');
});

test('y diferente vira linhas diferentes ordenadas por y', () => {
  const lines = groupItemsIntoLines([it('segunda', 10, 120, 40), it('primeira', 10, 100, 40)]);
  assert.deepEqual(lines.map((l) => l.text), ['primeira', 'segunda']);
  assert.ok(lines[0].y < lines[1].y);
});

test('item sobrescrito (menor e elevado até 0.5*size) fica na mesma linha', () => {
  const lines = groupItemsIntoLines([
    it('texto', 10, 100, 30, 10),
    it('1', 41, 96, 4, 6), // elevado 4 <= 5, menor
    it('depois', 46, 100, 30, 10),
  ]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].size, 10);
  assert.equal(lines[0].y, 100);
});

test('lista vazia e itens só com espaço não geram linhas', () => {
  assert.deepEqual(groupItemsIntoLines([]), []);
  assert.deepEqual(groupItemsIntoLines([it('  ', 10, 10, 5)]), []);
});

test('duas colunas na mesma linha de base viram Lines separadas', () => {
  const lines = groupItemsIntoLines([it('esquerda', 30, 100, 160), it('direita', 220, 100, 160)]);
  assert.deepEqual(lines.map((l) => l.text), ['esquerda', 'direita']);
  assert.deepEqual(lines.map((l) => l.x), [30, 220]);
  assert.deepEqual(lines.map((l) => l.width), [160, 160]);
});

test('texto justificado com vãos largos entre palavras não é dividido', () => {
  // palavras como itens separados, vãos de até 0.9×size
  const words = ['uma', 'linha', 'bem', 'justificada', 'aqui'];
  let x = 40;
  const items = words.map((w) => { const i = it(w, x, 100, w.length * 5); x += w.length * 5 + 9; return i; });
  const lines = groupItemsIntoLines(items);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, 'uma linha bem justificada aqui');
});

test('chamada de nota sobrescrita colada à palavra continua na mesma Line', () => {
  const lines = groupItemsIntoLines([it('palavra', 30, 100, 35), it('1', 65.5, 96, 3, 6), it('segue', 72, 100, 25)]);
  assert.equal(lines.length, 1);
});
