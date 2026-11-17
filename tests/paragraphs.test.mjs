import test from 'node:test';
import assert from 'node:assert/strict';
import { orderByColumns } from '../src/clean/columns.js';
import { buildParagraphs } from '../src/clean/paragraphs.js';

const BODY = 10;
const ln = (text, x, y, width = 300, size = BODY) => ({ text, x, y, width, size, items: [] });
const page = (number, lines) => ({ number, width: 420, height: 595, lines });

test('hifenização: "pro-" + "cesso de" vira "processo de"', () => {
  const blocks = buildParagraphs([page(1, [ln('pro-', 40, 100), ln('cesso de', 40, 112)])], BODY);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, 'processo de');
  assert.equal(blocks[0].type, 'p');
  assert.equal(blocks[0].lineCount, 2);
});

test('hífen de palavra composta seguido de maiúscula é mantido', () => {
  const blocks = buildParagraphs([page(1, [ln('guarda-', 40, 100), ln('Chuva', 40, 112)])], BODY);
  assert.equal(blocks[0].text, 'guarda- Chuva');
});

test('parágrafo sem pontuação final continua na página seguinte, mesmo com recuo', () => {
  const blocks = buildParagraphs(
    [page(3, [ln('e então ele', 40, 100)]), page(4, [ln('saiu.', 60, 100)])],
    BODY,
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, 'e então ele saiu.');
  assert.equal(blocks[0].page, 3);
});

test('parágrafo terminado em ponto e outro recuado na página seguinte são dois blocos', () => {
  const blocks = buildParagraphs(
    [page(3, [ln('Acabou aqui.', 40, 100)]), page(4, [ln('Outro começa.', 60, 100)])],
    BODY,
  );
  assert.deepEqual(blocks.map((b) => b.text), ['Acabou aqui.', 'Outro começa.']);
  assert.deepEqual(blocks.map((b) => b.page), [3, 4]);
});

test('duas colunas intercaladas em y são lidas A1 A2 B1 B2', () => {
  const p = page(1, [
    ln('A1', 30, 100, 80),
    ln('B1', 230, 100, 80),
    ln('A2', 30, 112, 80),
    ln('B2', 230, 112, 80),
  ]);
  assert.deepEqual(orderByColumns(p).map((l) => l.text), ['A1', 'A2', 'B1', 'B2']);
});

test('coluna única é ordenada apenas por y', () => {
  const p = page(1, [ln('b', 40, 112), ln('a', 40, 100), ln('c', 40, 124)]);
  assert.deepEqual(orderByColumns(p).map((l) => l.text), ['a', 'b', 'c']);
});

test('recuo de primeira linha separa parágrafos', () => {
  const blocks = buildParagraphs(
    [
      page(1, [
        ln('primeiro parágrafo', 40, 100),
        ln('continua aqui.', 40, 112),
        ln('segundo parágrafo', 55, 124),
        ln('termina aqui.', 40, 136),
        ln('terceiro parágrafo', 40, 148),
      ]),
    ],
    BODY,
  );
  assert.deepEqual(blocks.map((b) => b.text), [
    'primeiro parágrafo continua aqui.',
    'segundo parágrafo termina aqui. terceiro parágrafo',
  ]);
});

test('vão vertical grande separa parágrafos', () => {
  const blocks = buildParagraphs(
    [page(1, [ln('um.', 40, 100), ln('dois.', 40, 112), ln('três.', 40, 124), ln('quatro.', 40, 148)])],
    BODY,
  );
  assert.deepEqual(blocks.map((b) => b.text), ['um. dois. três.', 'quatro.']);
});

test('linha grande forma bloco próprio e não participa da virada de página', () => {
  const blocks = buildParagraphs(
    [page(1, [ln('texto sem fim', 40, 100), ln('CAPÍTULO', 40, 130, 100, 20)]), page(2, [ln('resto.', 40, 100)])],
    BODY,
  );
  assert.deepEqual(blocks.map((b) => b.text), ['texto sem fim', 'CAPÍTULO', 'resto.']);
  assert.equal(blocks[1].size, 20);
});

test('dentro da mesma página, parágrafo sem ponto final não é fundido ao seguinte por vão', () => {
  const blocks = buildParagraphs(
    [page(1, [ln('um', 40, 100), ln('dois', 40, 112), ln('três', 40, 124), ln('quatro', 40, 148)])],
    BODY,
  );
  assert.deepEqual(blocks.map((b) => b.text), ['um dois três', 'quatro']);
});

test('duas colunas com linhas de base compartilhadas: esquerda inteira, depois direita', async () => {
  const { groupItemsIntoLines } = await import('../src/pdf/lines.js');
  const items = [];
  const left = ['O texto da coluna', 'esquerda segue por', 'várias linhas até', 'terminar aqui.'];
  const right = ['Já a coluna da', 'direita começa um', 'novo assunto e', 'termina também.'];
  left.forEach((t, k) => items.push({ str: t, x: 30, y: 100 + 12 * k, width: 160, size: BODY, font: 'f' }));
  right.forEach((t, k) => items.push({ str: t, x: 220, y: 100 + 12 * k, width: 160, size: BODY, font: 'f' }));
  const p = { number: 1, width: 420, height: 595, lines: groupItemsIntoLines(items) };
  const blocks = buildParagraphs([p], BODY);
  assert.deepEqual(blocks.map((b) => b.text), [left.join(' '), right.join(' ')]);
});
