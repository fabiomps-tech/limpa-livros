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
