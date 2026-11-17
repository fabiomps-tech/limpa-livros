import test from 'node:test';
import assert from 'node:assert/strict';
import { groupItemsIntoLines } from '../src/pdf/lines.js';
import { emptyReport } from '../src/model.js';
import { bodyFontSize, extractFootnotes, stripNoteRefs } from '../src/clean/notes.js';

const it = (str, x, y, width, size = 11) => ({ str, x, y, width, size, font: 'f' });
const line = (text, y, size = 11, x = 40) => {
  const width = text.length * size * 0.5;
  return { text, x, y, width, size, items: [it(text, x, y, width, size)] };
};
const page = (lines, number = 7) => ({ number, width: 420, height: 595, lines });

test('extractFootnotes: separa duas notas de 9pt, com continuação, e remove as linhas', () => {
  const p = page([
    line('Texto do corpo da página.', 100),
    line('Mais texto do corpo.', 120),
    line('1 Ver Freud, 1920.', 500, 9),
    line('2 Idem.', 512, 9),
    line('continuação', 524, 9),
  ]);
  const report = emptyReport();
  const { page: out, notes } = extractFootnotes(p, 11, report);
  assert.deepEqual(notes, [
    { marker: '1', text: 'Ver Freud, 1920.', page: 7 },
    { marker: '2', text: 'Idem. continuação', page: 7 },
  ]);
  assert.deepEqual(out.lines.map((l) => l.text), ['Texto do corpo da página.', 'Mais texto do corpo.']);
  assert.equal(report.notesMoved, 2);
  assert.equal(p.lines.length, 5); // não muta
});

test('extractFootnotes: citação recuada em 10pt sem marcador não é nota', () => {
  const p = page([line('Corpo.', 100), line('Citação recuada longa', 400, 10, 80)]);
  const report = emptyReport();
  const { page: out, notes } = extractFootnotes(p, 11, report);
  assert.deepEqual(notes, []);
  assert.equal(out.lines.length, 2);
  assert.equal(report.notesMoved, 0);
});

test('extractFootnotes: linha pequena na metade de cima não é nota', () => {
  const p = page([line('1 Algo pequeno', 100, 9), line('Corpo', 400)]);
  const { notes } = extractFootnotes(p, 11, emptyReport());
  assert.deepEqual(notes, []);
});

test('stripNoteRefs: remove sobrescrito elevado do texto da linha', () => {
  const [l] = groupItemsIntoLines([
    it('como disse Freud', 10, 100, 80),
    it('1', 90, 96, 4, 7),
    it('ontem', 96, 100, 30),
  ]);
  assert.equal(l.text, 'como disse Freud1 ontem');
  const report = emptyReport();
  const out = stripNoteRefs(page([l]), 11, report);
  assert.equal(out.lines[0].text, 'como disse Freud ontem');
  assert.equal(out.lines[0].items.length, 2);
  assert.equal(report.noteRefs, 1);
  assert.equal(l.items.length, 3); // não muta
});

test('stripNoteRefs: [n] colado à palavra, em corpo normal, sai do texto', () => {
  const l = line('como disse Freud[12] ontem', 100);
  const report = emptyReport();
  const out = stripNoteRefs(page([l]), 11, report);
  assert.equal(out.lines[0].text, 'como disse Freud ontem');
  assert.equal(report.noteRefs, 1);
});

test('stripNoteRefs: "em 1920 ele" em 11pt fica inalterado', () => {
  const l = line('em 1920 ele', 100);
  const report = emptyReport();
  const out = stripNoteRefs(page([l]), 11, report);
  assert.equal(out.lines[0].text, 'em 1920 ele');
  assert.equal(report.noteRefs, 0);
});

test('bodyFontSize: 90% do texto em 11 → 11', () => {
  const p = page([line('a'.repeat(90), 100, 11), line('b'.repeat(10), 120, 9)]);
  assert.equal(bodyFontSize([p]), 11);
});

test('bodyFontSize: arredonda a 0.5', () => {
  const p = page([line('a'.repeat(50), 100, 10.9), line('b'.repeat(10), 120, 8)]);
  assert.equal(bodyFontSize([p]), 11);
});

test('extractFootnotes: linhas pequenas antes do primeiro marcador continuam a nota da página anterior', () => {
  const p = page([
    line('Corpo da página.', 100),
    line('e termina aqui.', 500, 9),
    line('2 Outra nota.', 512, 9),
  ]);
  const report = emptyReport();
  const { page: out, notes } = extractFootnotes(p, 11, report, { continuesNote: true });
  assert.deepEqual(notes, [
    { marker: '', text: 'e termina aqui.', page: 7 },
    { marker: '2', text: 'Outra nota.', page: 7 },
  ]);
  assert.deepEqual(out.lines.map((l) => l.text), ['Corpo da página.']);
  assert.equal(report.notesMoved, 1);
});

test('extractFootnotes: sem nota na página anterior, linhas antes do marcador ficam no corpo', () => {
  const p = page([line('Corpo da página.', 100), line('linha pequena', 500, 9), line('2 Outra nota.', 512, 9)]);
  const { page: out, notes } = extractFootnotes(p, 11, emptyReport());
  assert.deepEqual(notes.map((n) => n.marker), ['2']);
  assert.deepEqual(out.lines.map((l) => l.text), ['Corpo da página.', 'linha pequena']);
});

test('cleanPages: nota que atravessa duas e três páginas é anexada à nota anterior', async () => {
  const { cleanPages } = await import('../src/pdf/pipeline.js');
  const body = (n) => [line(`Corpo da página ${n} com texto.`, 100), line('Mais uma frase do corpo.', 112), line('E a última frase.', 124)];
  const pages = [
    page([...body(1), line('1 Nota que começa aqui e', 500, 9), line('segue na linha de baixo', 512, 9)], 1),
    page([...body(2), line('e termina na página seguinte.', 500, 9), line('2 Outra nota', 512, 9)], 2),
    page([...body(3), line('continua só aqui.', 520, 9)], 3),
    page(body(4), 4),
  ];
  const { book, report } = cleanPages({ pages, outline: [], title: 'T', imageCount: 0 });
  const notes = book.chapters.flatMap((c) => c.notes);
  assert.deepEqual(notes.map((n) => [n.marker, n.text]), [
    ['1', 'Nota que começa aqui e segue na linha de baixo e termina na página seguinte.'],
    ['2', 'Outra nota continua só aqui.'],
  ]);
  const text = book.chapters.flatMap((c) => c.paragraphs).join(' ');
  assert.ok(!text.includes('termina na página seguinte'));
  assert.ok(!text.includes('continua só aqui'));
  assert.equal(report.notesMoved, 2);
});
