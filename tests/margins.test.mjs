import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPageNumberText } from '../src/clean/pagenum.js';
import { removeMargins } from '../src/clean/margins.js';
import { emptyReport } from '../src/model.js';

test('isPageNumberText reconhece números de página', () => {
  for (const s of ['12', 'xii', 'XIV', '— 12 —', '- 7 -', 'Página 12', 'p. 12', '12 | O Livro', 'O Livro | 12', 'I']) {
    assert.equal(isPageNumberText(s), true, s);
  }
  for (const s of ['12 de outubro de 1990', 'Capítulo 12', 'Eu']) {
    assert.equal(isPageNumberText(s), false, s);
  }
});

const line = (text, y) => ({ text, x: 40, y, width: 100, size: 10, items: [] });

function book() {
  const pages = [];
  for (let n = 1; n <= 10; n++) {
    const lines = [];
    if (n > 1) lines.push(line(n % 2 === 0 ? 'O LIVRO X' : 'Capítulo 1', 20));
    else lines.push(line('Era uma vez um homem', 20));
    lines.push(line('corpo do texto', 300));
    if (n <= 5) lines.push(line('— Sim.', 320));
    if (n <= 2) lines.push(line('* * *', 25));
    if (n === 4) lines.push(line('42', 350));
    lines.push(line(String(n), 560));
    pages.push({ number: n, width: 420, height: 595, lines });
  }
  return pages;
}

test('removeMargins remove cabeçalhos e números, preservando o resto', () => {
  const pages = book();
  const snapshot = JSON.stringify(pages);
  const report = emptyReport();
  const out = removeMargins(pages, report);
  assert.equal(JSON.stringify(pages), snapshot, 'não altera a entrada');
  assert.equal(report.pageNumbers, 10);
  assert.equal(report.headers, 9); // pág. 1 não tem cabeçalho
  const texts = (i) => out[i].lines.map((l) => l.text);
  assert.ok(texts(0).includes('Era uma vez um homem'));
  assert.ok(!texts(1).includes('O LIVRO X'));
  assert.ok(!texts(2).includes('Capítulo 1'));
  assert.ok(texts(0).includes('* * *') && texts(1).includes('* * *'));
  assert.equal(out.filter((p) => p.lines.some((l) => l.text === '— Sim.')).length, 5);
  assert.ok(texts(3).includes('42'));
});
