import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveBook, listBooks, getBook, deleteBook, saveScroll } from '../src/storage/library.js';

const book = (title) => ({ title, lang: 'pt-BR', html: `<p>${title}</p>`, report: { headers: 1 }, sourceName: `${title}.pdf` });

test('listBooks: dois livros, mais recente primeiro, sem html', async () => {
  const a = await saveBook(book('A'));
  const b = await saveBook(book('B'));
  const list = await listBooks();
  assert.deepEqual(list.map((x) => x.id), [b, a]);
  assert.deepEqual(list.map((x) => x.title), ['B', 'A']);
  for (const item of list) {
    assert.ok(!('html' in item));
    assert.deepEqual(Object.keys(item).sort(), ['createdAt', 'id', 'title']);
  }
  assert.ok(list[0].createdAt >= list[1].createdAt);
});

test('getBook devolve o html e os campos salvos', async () => {
  const id = await saveBook(book('C'));
  const rec = await getBook(id);
  assert.equal(rec.html, '<p>C</p>');
  assert.equal(rec.sourceName, 'C.pdf');
  assert.equal(rec.lang, 'pt-BR');
  assert.equal(rec.scrollY, 0);
  assert.deepEqual(rec.report, { headers: 1 });
});

test('saveScroll persiste; id inexistente não cria nada', async () => {
  const id = await saveBook(book('D'));
  await saveScroll(id, 1234);
  assert.equal((await getBook(id)).scrollY, 1234);
  await saveScroll('nao-existe', 5);
  assert.equal(await getBook('nao-existe'), null);
});

test('deleteBook remove; getBook de id inexistente dá null', async () => {
  const id = await saveBook(book('E'));
  await deleteBook(id);
  assert.equal(await getBook(id), null);
  assert.ok(!(await listBooks()).some((x) => x.id === id));
  assert.equal(await getBook('nada'), null);
});
