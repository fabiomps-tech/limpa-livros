import { BookError } from '../model.js';

const DB_NAME = 'limpa-livros';
const STORE = 'books';
const QUOTA_MESSAGE =
  'Sem espaço para salvar este livro no aparelho. Apague algum livro da lista e tente de novo.';

let dbPromise = null;
let lastCreatedAt = 0;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        db.onclose = () => { dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function toError(error) {
  return error && error.name === 'QuotaExceededError' ? new BookError(QUOTA_MESSAGE) : error;
}

/** Runs fn(store) in a transaction; resolves with fn's request result once the transaction completes. */
async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let result;
    try {
      const req = fn(tx.objectStore(STORE));
      if (req) req.onsuccess = () => { result = req.result; };
    } catch (error) {
      reject(toError(error));
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(toError(tx.error));
  });
}

export async function saveBook({ title, lang, html, report, sourceName }) {
  const id = crypto.randomUUID();
  // Strictly increasing, so books saved within the same millisecond keep their order.
  const createdAt = Math.max(Date.now(), lastCreatedAt + 1);
  lastCreatedAt = createdAt;
  await run('readwrite', (store) =>
    store.put({ id, title, lang, html, report, sourceName, createdAt, scrollY: 0 }));
  return id;
}

export async function listBooks() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const items = [];
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const { id, title, createdAt } = cursor.value;
      items.push({ id, title, createdAt });
      cursor.continue();
    };
    tx.oncomplete = () => resolve(items.sort((a, b) => b.createdAt - a.createdAt));
    tx.onabort = () => reject(tx.error);
  });
}

export async function getBook(id) {
  const record = await run('readonly', (store) => store.get(id));
  return record ?? null;
}

export async function deleteBook(id) {
  await run('readwrite', (store) => store.delete(id));
}

export async function saveScroll(id, y) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      if (req.result) store.put({ ...req.result, scrollY: y });
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(toError(tx.error));
  });
}
