import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makePdf, demoSpec as spec } from './fixtures/make-pdf.mjs';
import { extractPdf } from '../src/pdf/extract.js';
import { cleanPages } from '../src/pdf/pipeline.js';
import { renderBookHtml } from '../src/assemble.js';

const fontsUrl = fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url));
const pdfjs = { ...pdfjsLib, getDocument: (o) => pdfjsLib.getDocument({ ...o, standardFontDataUrl: fontsUrl }) };

test('pipeline de ponta a ponta: limpa um PDF de 14 páginas', async () => {
  const ex = await extractPdf(await makePdf(spec()), pdfjs);
  const stages = [];
  const { book, report } = cleanPages(ex, (s) => stages.push(s));
  const html = renderBookHtml(book);

  assert.ok(!html.includes('Cabeçalho do Livro'), 'cabeçalho removido');
  assert.ok(!html.includes('ISBN'), 'ficha removida');
  assert.ok(!html.includes('........'), 'sumário removido');
  assert.ok(html.includes('a frase atravessa a fronteira entre as páginas e só termina aqui no começo da página sete.'), 'parágrafo cruzado inteiro');
  assert.equal(html.split('<h2>').length - 1, 2);
  assert.equal(book.chapters.length, 3);
  assert.equal(book.chapters[1].notes.length, 1);
  assert.equal(book.chapters[1].notes[0].text, 'Nota de rodapé sobre a chamada acima.');
  assert.equal(book.chapters[2].notes.length, 0);
  assert.ok(/<aside class="notas">.*Nota de rodapé sobre a chamada acima\./.test(html));
  assert.ok(report.headers >= 10, `headers=${report.headers}`);
  assert.equal(report.frontBackPages, 2);
  assert.equal(report.notesMoved, 1);
  assert.equal(report.images, ex.imageCount);
  assert.ok(stages.length > 0);
});
