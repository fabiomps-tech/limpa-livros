import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLang } from '../src/lang.js';
import { assembleBook, renderBookHtml } from '../src/assemble.js';

test('detectLang: inglês, português, empate e texto curto', () => {
  assert.equal(detectLang('the cat and the dog is in the house'), 'en');
  assert.equal(detectLang('Os livros que não são de uma só pessoa é que importam'), 'pt-BR');
  assert.equal(detectLang(''), 'pt-BR');
  assert.equal(detectLang('the de'), 'pt-BR');
});

test('assembleBook: nota da página 5 vai para o 2º capítulo (capítulos nas pp. 1 e 4)', () => {
  const blocks = [
    { type: 'h', level: 1, text: 'Um', page: 1 },
    { type: 'p', text: 'Texto um.', page: 2 },
    { type: 'h', level: 2, text: 'Dois', page: 4 },
    { type: 'p', text: 'Texto dois.', page: 5 },
  ];
  const notes = [{ marker: '1', text: 'Nota.', page: 5 }];
  const book = assembleBook({ title: 'T', blocks, notes });
  assert.equal(book.chapters.length, 2);
  assert.deepEqual(book.chapters[0].notes, []);
  assert.deepEqual(book.chapters[1].notes, notes);
  assert.equal(book.chapters[1].level, 2);
  assert.deepEqual(book.chapters[0].paragraphs, ['Texto um.']);
});

test('assembleBook: blocos antes do primeiro título formam capítulo sem título; sem títulos há um capítulo', () => {
  const a = assembleBook({
    title: 'T',
    blocks: [{ type: 'p', text: 'Prólogo.', page: 1 }, { type: 'h', level: 1, text: 'Cap', page: 2 }],
    notes: [],
  });
  assert.equal(a.chapters[0].heading, null);
  assert.equal(a.chapters[0].level, 1);
  assert.equal(a.chapters[1].heading, 'Cap');
  assert.deepEqual(a.chapters[1].paragraphs, []);
  const b = assembleBook({ title: 'T', blocks: [{ type: 'p', text: 'x', page: 1 }], notes: [] });
  assert.equal(b.chapters.length, 1);
});

test('renderBookHtml: escapa texto, usa h2/h3 e omite notas vazias', () => {
  const book = {
    title: 'A & B', lang: 'pt-BR',
    chapters: [
      { heading: null, level: 1, paragraphs: ['a < b & "c"'], notes: [] },
      { heading: 'Cap', level: 1, paragraphs: ['x'], notes: [{ marker: '1', text: "n'<", page: 1 }] },
      { heading: 'Sub', level: 2, paragraphs: [], notes: [] },
    ],
  };
  const html = renderBookHtml(book);
  assert.ok(html.startsWith('<article lang="pt-BR"><h1>A &amp; B</h1>'));
  assert.ok(html.includes('a &lt; b &amp; &quot;c&quot;'));
  assert.ok(html.includes('<h2>Cap</h2>'));
  assert.ok(html.includes('<h3>Sub</h3>'));
  assert.ok(html.includes('<aside class="notas"><h3>Notas</h3><ol><li><b>1</b> n&#39;&lt;</li></ol></aside>'));
  assert.equal(html.split('<aside').length - 1, 1);
});
