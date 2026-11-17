import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyResultMessage, MSG_LOW_TEXT, MSG_OCR_EMPTY, MSG_EPUB_EMPTY } from '../src/empty-result.js';

const ok = { html: '<h1>Livro</h1><p>Texto.</p>', report: {} };

test('resultado com parágrafos não tem mensagem', () => {
  assert.equal(emptyResultMessage('pdf', false, ok), null);
  assert.equal(emptyResultMessage('pdf', true, ok), null);
  assert.equal(emptyResultMessage('epub', false, ok), null);
});

test('PDF de texto com pouco texto sugere o modo escaneado', () => {
  assert.equal(emptyResultMessage('pdf', false, { ...ok, report: { lowText: true } }), MSG_LOW_TEXT);
  assert.match(MSG_LOW_TEXT, /PDF escaneado/);
});

test('sem nenhum <p> no html: mensagem conforme o tipo', () => {
  const empty = { html: '<h1>Livro</h1>', report: {} };
  assert.equal(emptyResultMessage('pdf', false, empty), MSG_LOW_TEXT);
  assert.equal(emptyResultMessage('pdf', true, empty), MSG_OCR_EMPTY);
  assert.equal(emptyResultMessage('epub', false, empty), MSG_EPUB_EMPTY);
  assert.equal(MSG_OCR_EMPTY, 'O reconhecimento não encontrou texto neste PDF.');
  assert.equal(MSG_EPUB_EMPTY, 'Este EPUB não tem texto para ler.');
});

test('<pre> ou <picture> não contam como parágrafo', () => {
  assert.equal(emptyResultMessage('epub', false, { html: '<pre>x</pre>', report: {} }), MSG_EPUB_EMPTY);
});
