import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPage, classifyPages } from '../src/clean/frontback.js';

const ln = (text, y = 100) => ({ text, x: 40, y, width: 300, size: 10, items: [] });
const page = (number, texts) => ({ number, width: 420, height: 595, lines: texts.map((t, i) => ln(t, 50 + i * 12)) });

const TOC = ['1. Introdução ........ 9', '2. Método ........ 21', '3. Resultados ........ 45', '4. Conclusão ........ 80'];
const INDEX = ['Freud, 12, 45', 'Jung, 7, 30-33', 'Lacan, 101', 'Winnicott, 5, 9, 77'];

test('sumário com pontilhado nos primeiros 15% é toc', () => {
  assert.equal(classifyPage(page(3, TOC), 2, 100), 'toc');
});

test('sumário com título e número de página solto no rodapé é toc', () => {
  assert.equal(classifyPage(page(4, ['Sumário', ...TOC, 'vii']), 3, 100), 'toc');
});

test('mesmo padrão fora dos primeiros 15% não é toc', () => {
  assert.equal(classifyPage(page(50, TOC), 49, 100), null);
});

test('continuação de sumário sem título, logo após um toc, é toc', () => {
  const pages = [page(1, ['Sumário', ...TOC]), page(2, TOC), page(3, ['Era uma vez um reino distante, onde tudo era calmo e silencioso.'])];
  assert.deepEqual(classifyPages(pages.concat(Array.from({ length: 97 }, (_, i) => page(4 + i, ['texto de corpo'])))).slice(0, 3), ['toc', 'toc', null]);
});

test('índice remissivo com título nos últimos 20% é index', () => {
  assert.equal(classifyPage(page(95, ['Índice remissivo', 'Freud, 12, 45', 'Jung, 7, 30-33', 'Lacan, 101']), 94, 100), 'index');
});

test('página sem título com padrão de índice, sem índice antes, é null', () => {
  assert.equal(classifyPage(page(95, ['Freud, 12, 45', 'Jung, 7, 30-33', 'Lacan, 101']), 94, 100), null);
  const pages = Array.from({ length: 100 }, (_, i) => page(i + 1, ['texto de corpo']));
  pages[94] = page(95, INDEX);
  assert.equal(classifyPages(pages)[94], null);
});

const BIB = [
  'FREUD, S. O mal-estar. São Paulo: Companhia das Letras, 2010',
  'Freud, S. (2010). O mal-estar. São Paulo, 2010',
  'JUNG, C. G. Tipos psicológicos. Petrópolis: Vozes, 2008',
  'Lacan, J. Escritos. Rio de Janeiro, 1998',
];

test('bibliografia com anos no fim da linha nunca é index', () => {
  assert.equal(classifyPage(page(98, BIB), 97, 100), null);
  assert.equal(classifyPage(page(98, ['Referências', ...BIB]), 97, 100), null);
  const pages = Array.from({ length: 100 }, (_, i) => page(i + 1, ['texto de corpo']));
  pages[96] = page(97, ['Índice remissivo', ...INDEX]);
  pages[97] = page(98, BIB);
  assert.equal(classifyPages(pages)[97], null);
  pages[96] = page(97, BIB);
  assert.equal(classifyPages(pages)[96], null);
});

test('página com título de índice e continuação', () => {
  const pages = Array.from({ length: 100 }, (_, i) => page(i + 1, ['texto de corpo']));
  pages[94] = page(95, ['Índice remissivo', ...INDEX]);
  pages[95] = page(96, INDEX);
  pages[96] = page(97, ['Era uma vez um reino distante.']);
  const r = classifyPages(pages);
  assert.deepEqual([r[93], r[94], r[95], r[96]], [null, 'index', 'index', null]);
});

test('ficha catalográfica com ISBN e CDD é colophon', () => {
  assert.equal(classifyPage(page(2, ['ISBN 978-85-1234-567-8', 'CDD 869.3', 'São Paulo']), 1, 100), 'colophon');
});

test('apenas um marcador não basta para colophon', () => {
  assert.equal(classifyPage(page(30, ['O livro cita o ISBN apenas uma vez.', 'Mais texto aqui.']), 29, 100), null);
});

test('bibliografia fica (null)', () => {
  const p = page(98, ['FREUD, S. O mal-estar. São Paulo: 2010.', 'JUNG, C. G. Tipos psicológicos. Petrópolis: 2008.', 'LACAN, J. Escritos. Rio de Janeiro: 1998.']);
  assert.equal(classifyPage(p, 97, 100), null);
});

test('página de corpo com frase terminada em número é null', () => {
  assert.equal(classifyPage(page(2, ['Ele chegou à cidade no ano de 2012']), 1, 100), null);
  assert.equal(classifyPage(page(50, ['Uma frase qualquer que termina em 12']), 49, 100), null);
});
