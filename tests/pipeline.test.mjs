import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makePdf } from './fixtures/make-pdf.mjs';
import { extractPdf } from '../src/pdf/extract.js';
import { cleanPages } from '../src/pdf/pipeline.js';
import { renderBookHtml } from '../src/assemble.js';

const fontsUrl = fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url));
const pdfjs = { ...pdfjsLib, getDocument: (o) => pdfjsLib.getDocument({ ...o, standardFontDataUrl: fontsUrl }) };

const HEADER = 'Cabeçalho do Livro Exemplo';
const PAGE_COUNT = 14; // com 12 páginas o sumário da p.3 (índice 2) fica fora dos 15% iniciais (1.8) de classifyPage

// Linhas de corpo (11pt, passo de 14pt) a partir de y = 80, com texto distinto por página.
function body(n, count, extra = {}) {
  const words = ['sol', 'mar', 'rio', 'vento', 'chuva', 'terra', 'fogo', 'lua'];
  return Array.from({ length: count }, (_, i) => ({
    text: `Linha ${i + 1} da pagina ${n} fala de ${words[(n + i) % 8]} e ${words[(n * 3 + i) % 8]} sem parar agora.`,
    y: (extra.y0 ?? 80) + i * 14,
    size: 11,
  }));
}
function chrome(n) {
  return [{ text: HEADER, y: 30, size: 9, x: 120 }, { text: String(n), y: 570, size: 10, x: 205 }];
}

function spec() {
  const pages = [];
  for (let n = 1; n <= PAGE_COUNT; n++) {
    let lines;
    if (n === 2) {
      lines = [
        { text: 'ISBN 978-85-0000-000-0', y: 100, size: 11 },
        { text: 'CDD 869.3', y: 120, size: 11 },
        { text: 'Primeira edição, editora exemplo', y: 140, size: 11 },
      ];
    } else if (n === 3) {
      lines = [
        { text: 'Sumário', y: 80, size: 11 },
        { text: 'Capítulo 1 ........ 4', y: 110, size: 11 },
        { text: 'Capítulo 2 ........ 8', y: 124, size: 11 },
        { text: 'Posfácio ........ 11', y: 138, size: 11 },
      ];
    } else if (n === 4 || n === 8) {
      lines = [{ text: `Capítulo ${n === 4 ? 1 : 2}`, y: 80, size: 20 }, ...body(n, 8, { y0: 120 })];
    } else if (n === 6) {
      lines = [
        ...body(n, 6),
        { text: 'Aqui há uma chamada de nota no fim desta linha', y: 164, size: 11 },
        { text: '1', x: 40 + 46 * 5.5, y: 161, size: 6 },
        { text: 'e o parágrafo seguinte começa agora e segue até a próxima página, onde', y: 178, size: 11 },
        { text: 'a frase atravessa a fronteira entre as páginas e só termina aqui', y: 192, size: 11 },
        { text: '1 Nota de rodapé sobre a chamada acima.', y: 500, size: 8 },
      ];
    } else if (n === 7) {
      lines = [{ text: 'no começo da página sete.', y: 80, size: 11 }, ...body(n, 6, { y0: 120 })];
    } else lines = body(n, 8);
    pages.push({ lines: [...chrome(n), ...lines] });
  }
  return {
    title: 'Livro Exemplo',
    pages,
    outline: [{ title: 'Capítulo 1', page: 4 }, { title: 'Capítulo 2', page: 8 }],
  };
}

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
