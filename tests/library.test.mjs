import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BookError } from '../src/model.js';
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

test('erro de cota vira BookError com a mensagem do brief', async (t) => {
  const original = IDBObjectStore.prototype.put;
  t.after(() => { IDBObjectStore.prototype.put = original; });
  IDBObjectStore.prototype.put = function () {
    throw new DOMException('cheio', 'QuotaExceededError');
  };
  await assert.rejects(saveBook(book('F')), (error) => {
    assert.ok(error instanceof BookError);
    assert.equal(error.message,
      'Sem espaço para salvar este livro no aparelho. Apague algum livro da lista e tente de novo.');
    return true;
  });
});

test('erro que não é de cota se propaga como Error (não null)', async (t) => {
  const original = IDBObjectStore.prototype.put;
  t.after(() => { IDBObjectStore.prototype.put = original; });
  const id = await saveBook(book('G'));
  // Falha de verdade na requisição: add de chave repetida -> ConstraintError aborta a transação.
  IDBObjectStore.prototype.put = function () {
    return this.add({ id });
  };
  await assert.rejects(saveBook(book('H')), (error) => {
    assert.ok(error instanceof Error);
    assert.ok(!(error instanceof BookError));
    assert.equal(error.name, 'ConstraintError');
    return true;
  });
});

const openRaw = () => new Promise((resolve, reject) => {
  const req = indexedDB.open('limpa-livros');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const rawGet = (db, store, id) => new Promise((resolve, reject) => {
  const req = db.transaction(store, 'readonly').objectStore(store).get(id);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/** Registra os stores de cada transação aberta enquanto fn roda. */
async function scopesDuring(t, fn) {
  const original = IDBDatabase.prototype.transaction;
  const scopes = [];
  IDBDatabase.prototype.transaction = function (names, ...rest) {
    scopes.push([].concat(names).sort().join('+'));
    return original.call(this, names, ...rest);
  };
  t.after(() => { IDBDatabase.prototype.transaction = original; });
  await fn();
  IDBDatabase.prototype.transaction = original;
  return scopes;
}

test('esquema: meta sem html e content só com {id, html}', async () => {
  const id = await saveBook(book('M'));
  const db = await openRaw();
  assert.deepEqual([...db.objectStoreNames].sort(), ['content', 'meta']);
  const meta = await rawGet(db, 'meta', id);
  assert.deepEqual(Object.keys(meta).sort(), ['createdAt', 'id', 'lang', 'report', 'scrollY', 'sourceName', 'title']);
  assert.deepEqual(await rawGet(db, 'content', id), { id, html: '<p>M</p>' });
  db.close();
});

test('listBooks e saveScroll só tocam meta; saveBook grava os dois numa transação', async (t) => {
  const scopes = await scopesDuring(t, async () => {
    const id = await saveBook(book('N'));
    await listBooks();
    await saveScroll(id, 7);
  });
  assert.deepEqual(scopes, ['content+meta', 'meta', 'meta']);
});

test('deleteBook apaga meta e content', async () => {
  const id = await saveBook(book('O'));
  await deleteBook(id);
  const db = await openRaw();
  assert.equal(await rawGet(db, 'meta', id), undefined);
  assert.equal(await rawGet(db, 'content', id), undefined);
  db.close();
});

test('falha ao gravar o conteúdo não deixa meta órfão', async (t) => {
  const original = IDBObjectStore.prototype.put;
  t.after(() => { IDBObjectStore.prototype.put = original; });
  IDBObjectStore.prototype.put = function (value) {
    if (this.name === 'content') throw new DOMException('cheio', 'QuotaExceededError');
    return original.call(this, value);
  };
  const before = (await listBooks()).length;
  await assert.rejects(saveBook(book('P')), BookError);
  IDBObjectStore.prototype.put = original;
  assert.equal((await listBooks()).length, before);
});
