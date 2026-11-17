import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { DOMParser } from 'linkedom';
import { cleanEpub } from '../src/epub/epub.js';
import { BookError } from '../src/model.js';
import { makeEpub, makeEpubWithFontObfuscation } from './fixtures/make-epub.mjs';

const parseHtml = (s) => {
  const doc = new DOMParser().parseFromString(s, 'text/xml');
  return doc.documentElement && !doc.querySelector('parsererror') ? doc : new DOMParser().parseFromString(s, 'text/html');
};
const clean = (data) => cleanEpub(data, { JSZip, parseHtml });

test('capítulos na ordem do spine, com título do dc:title', async () => {
  const data = await makeEpub({
    title: 'Meu Livro',
    chapters: [
      { xhtml: '<h1>Um</h1><p>Primeiro   parágrafo\n do um.</p>' },
      { xhtml: '<h1>Dois</h1><p>Texto do dois.</p><h3>Sub</h3><p>Dentro.</p>' },
    ],
  });
  const { book } = await clean(data);
  assert.equal(book.title, 'Meu Livro');
  assert.deepEqual(book.chapters.map((c) => c.heading), ['Um', 'Dois', 'Sub']);
  assert.deepEqual(book.chapters.map((c) => c.level), [1, 1, 2]);
  assert.deepEqual(book.chapters[0].paragraphs, ['Primeiro parágrafo do um.']);
});

test('quebra de página some e conta como número de página', async () => {
  const data = await makeEpub({
    chapters: [{ xhtml: '<h1>A</h1><p>Antes<span epub:type="pagebreak" title="12"/> depois.</p>' }],
  });
  const { book, report } = await clean(data);
  assert.equal(book.chapters[0].paragraphs[0], 'Antes depois.');
  assert.equal(report.pageNumbers, 1);
});

test('chamada de nota some e a nota vai para o capítulo certo', async () => {
  const data = await makeEpub({
    chapters: [
      {
        xhtml:
          '<h1>A</h1><p>Texto sem nota.</p>' +
          '<h1>B</h1><p>Freud<a epub:type="noteref" href="#n1">1</a> disse.</p><p>Outra<sup><a href="#n2">2</a></sup> frase.</p>' +
          '<aside epub:type="footnote" id="n1"><p>1 Nota de Freud.</p></aside>' +
          '<aside epub:type="footnote" id="n2"><p>Segunda nota.</p></aside>',
      },
    ],
  });
  const { book, report } = await clean(data);
  assert.deepEqual(book.chapters[1].paragraphs, ['Freud disse.', 'Outra frase.']);
  assert.equal(book.chapters[0].notes.length, 0);
  assert.deepEqual(book.chapters[1].notes.map((n) => [n.marker, n.text]), [['1', 'Nota de Freud.'], ['2', 'Segunda nota.']]);
  assert.equal(report.noteRefs, 2);
  assert.equal(report.notesMoved, 2);
});

test('imagens, figuras, tabelas e scripts somem; report.images conta', async () => {
  const data = await makeEpub({
    chapters: [
      {
        xhtml:
          '<h1>A</h1><p>Texto.</p><img src="img.png" alt="x"/><figure><img src="img.png"/><figcaption>Legenda</figcaption></figure>' +
          '<svg xmlns="http://www.w3.org/2000/svg"><text>svgtext</text></svg><table><tr><td>tab</td></tr></table><script>var x=1;</script>',
      },
    ],
  });
  const { book, report } = await clean(data);
  assert.deepEqual(book.chapters[0].paragraphs, ['Texto.']);
  assert.equal(report.images, 3);
});

test('documento nav não aparece no livro', async () => {
  const data = await makeEpub({ nav: true, chapters: [{ xhtml: '<h1>A</h1><p>Texto.</p>' }] });
  const { book, report } = await clean(data);
  assert.equal(book.chapters.length, 1);
  assert.ok(!JSON.stringify(book).includes('Sumário fantasma'));
  assert.equal(report.frontBackPages, 1);
});

test('arquivo só de notas no fim vira o último capítulo', async () => {
  const data = await makeEpub({
    chapters: [{ xhtml: '<h1>A</h1><p>Texto<a epub:type="noteref" href="notes.xhtml#n1">1</a>.</p>' }],
    endnotesFile:
      '<section epub:type="endnotes"><h2>Notas</h2><ol><li id="n1">Nota final um.</li><li id="n2">Nota final dois.</li></ol></section>',
  });
  const { book, report } = await clean(data);
  assert.equal(book.chapters.length, 2);
  assert.equal(book.chapters[0].notes.length, 0);
  assert.equal(book.chapters[1].heading, 'Notas');
  assert.deepEqual(book.chapters[1].paragraphs, ['Nota final um.', 'Nota final dois.']);
  assert.equal(report.notesMoved, 0);
  assert.equal(report.noteRefs, 1);
});

test('arquivo de notas detectado por ≥80% de li/aside referenciados, sem título', async () => {
  const data = await makeEpub({
    chapters: [{ xhtml: '<h1>A</h1><p>X<a href="notes.xhtml#a">1</a> Y<a href="notes.xhtml#b">2</a>.</p>' }],
    endnotesFile: '<ol><li id="a">Primeira.</li><li id="b">Segunda.</li></ol>',
  });
  const { book } = await clean(data);
  assert.equal(book.chapters.length, 2);
  assert.equal(book.chapters[1].heading, 'Notas');
  assert.deepEqual(book.chapters[1].paragraphs, ['Primeira.', 'Segunda.']);
});

test('notas ficam no capítulo certo quando um arquivo tem vários títulos', async () => {
  const data = await makeEpub({
    chapters: [
      {
        xhtml:
          '<h1>A</h1><p>a<a epub:type="noteref" href="#n1">1</a></p><h1>B</h1><p>b<a epub:type="noteref" href="#n2">2</a></p>' +
          '<aside epub:type="footnote" id="n1"><p>nota A</p></aside><aside epub:type="footnote" id="n2"><p>nota B</p></aside>',
      },
    ],
  });
  const { book } = await clean(data);
  assert.deepEqual(book.chapters.map((c) => c.notes.map((n) => n.text)), [['nota A'], ['nota B']]);
});

test('sumário e ficha dentro do arquivo são removidos', async () => {
  const data = await makeEpub({
    chapters: [
      {
        xhtml:
          '<h1>A</h1><p>Texto.</p><section epub:type="copyright-page"><p>Copyright</p></section><nav epub:type="toc"><p>Sum</p></nav>',
      },
    ],
  });
  const { book, report } = await clean(data);
  assert.deepEqual(book.chapters[0].paragraphs, ['Texto.']);
  assert.equal(report.frontBackPages, 2);
});

test('bytes inválidos geram BookError', async () => {
  await assert.rejects(clean(new Uint8Array([1, 2, 3, 4])), (e) => {
    assert.ok(e instanceof BookError);
    assert.equal(e.message, 'Não foi possível abrir este EPUB. O arquivo pode estar corrompido.');
    return true;
  });
});

test('EPUB com DRM gera BookError', async () => {
  const data = await makeEpub({ encrypted: true, chapters: [{ xhtml: '<h1>A</h1><p>x</p>' }] });
  await assert.rejects(clean(data), (e) => {
    assert.ok(e instanceof BookError);
    assert.equal(e.message, 'Este EPUB está protegido por DRM e não pode ser lido.');
    return true;
  });
});

test('ofuscação só de fonte não é DRM', async () => {
  const data = await makeEpubWithFontObfuscation({ chapters: [{ xhtml: '<h1>A</h1><p>Texto.</p>' }] });
  const { book } = await clean(data);
  assert.deepEqual(book.chapters[0].paragraphs, ['Texto.']);
});

const parseAsHtml = (s) => new DOMParser().parseFromString(s, 'text/html');

test('itens linear="no" são pulados', async () => {
  const data = await makeEpub({
    chapters: [{ xhtml: '<h1>A</h1><p>Texto.</p>' }, { xhtml: '<h1>Extra</h1><p>Fora.</p>', linear: false }],
  });
  const { book } = await clean(data);
  assert.deepEqual(book.chapters.map((c) => c.heading), ['A']);
});

test('epub:type no body descarta o arquivo (índice) e conta', async () => {
  const data = await makeEpub({
    chapters: [{ xhtml: '<h1>A</h1><p>Texto.</p>' }, { xhtml: '<h1>Índice</h1><p>x, 1</p>', bodyAttrs: ' epub:type="index"' }],
  });
  const { book, report } = await clean(data);
  assert.deepEqual(book.chapters.map((c) => c.heading), ['A']);
  assert.equal(report.frontBackPages, 1);
});

test('epub:type endnotes no body trata o arquivo como só de notas', async () => {
  const data = await makeEpub({
    chapters: [{ xhtml: '<h1>A</h1><p>Texto.</p>' }, { xhtml: '<p id="x">Nota um.</p><p>Nota dois.</p>', bodyAttrs: ' epub:type="endnotes"' }],
  });
  const { book, report } = await clean(data);
  assert.equal(book.chapters.length, 2);
  assert.equal(book.chapters[1].heading, 'Notas');
  assert.equal(book.chapters[1].paragraphs.length, 2);
  assert.equal(report.notesMoved, 0);
});

test('fallback text/html: pagebreak auto-fechado não engole o texto seguinte', async () => {
  const data = await makeEpub({
    chapters: [{ xhtml: '<h1>A</h1><p>Antes<span epub:type="pagebreak" title="3"/> depois.</p><p>Outro.</p>' }],
  });
  const { book } = await cleanEpub(data, { JSZip, parseHtml: parseAsHtml });
  assert.deepEqual(book.chapters[0].paragraphs, ['Antes depois.', 'Outro.']);
});

test('pagebreak com filhos mantém o texto', async () => {
  const data = await makeEpub({
    chapters: [{ xhtml: '<h1>A</h1><p>Antes <span epub:type="pagebreak">texto real</span> depois.</p>' }],
  });
  const { book } = await clean(data);
  assert.equal(book.chapters[0].paragraphs[0], 'Antes texto real depois.');
});

test('br vira espaço', async () => {
  const data = await makeEpub({ chapters: [{ xhtml: '<h1>A</h1><p>linha<br/>outra</p>' }] });
  const { book } = await clean(data);
  assert.deepEqual(book.chapters[0].paragraphs, ['linha outra']);
});

test('div/section usados como parágrafo viram parágrafos', async () => {
  const data = await makeEpub({
    chapters: [{ xhtml: '<section><h1>A</h1><div>Primeiro.</div><div class="x">Segundo <i>itálico</i>.</div></section>' }],
  });
  const { book } = await clean(data);
  assert.deepEqual(book.chapters[0].paragraphs, ['Primeiro.', 'Segundo itálico.']);
});

test('texto direto em li/blockquote com p aninhado não é perdido', async () => {
  const data = await makeEpub({
    chapters: [{ xhtml: '<h1>A</h1><blockquote>Citação solta<p>Dentro.</p>Final.</blockquote>' }],
  });
  const { book } = await clean(data);
  assert.deepEqual(book.chapters[0].paragraphs, ['Citação solta', 'Dentro.', 'Final.']);
});
