import { BookError } from '../model.js';

const DB_NAME = 'limpa-livros';
// meta: {id, title, lang, createdAt, scrollY, report, sourceName} — lido pela lista, sem o livro inteiro.
// content: {id, html} — só lido ao abrir o livro.
const META = 'meta';
const CONTENT = 'content';
const QUOTA_MESSAGE =
  'Sem espaço para salvar este livro no aparelho. Apague algum livro da lista e tente de novo.';

let dbPromise = null;
let lastCreatedAt = 0;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      // Versão 2: o store único 'books' das versões de teste (nunca publicadas) é descartado, sem migração.
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (db.objectStoreNames.contains('books')) db.deleteObjectStore('books');
        for (const name of [META, CONTENT]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }
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

/**
 * Roda fn(stores) numa transação sobre `names`; resolve com o resultado da requisição devolvida por fn
 * quando a transação termina. Erro síncrono em fn aborta a transação inteira.
 */
async function run(names, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let result;
    try {
      const stores = Object.fromEntries(names.map((n) => [n, tx.objectStore(n)]));
      const req = fn(stores);
      if (req) req.onsuccess = () => { result = req.result; };
    } catch (error) {
      try { tx.abort(); } catch { /* já terminada */ }
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
  await run([META, CONTENT], 'readwrite', (s) => {
    s[META].put({ id, title, lang, report, sourceName, createdAt, scrollY: 0 });
    s[CONTENT].put({ id, html });
  });
  return id;
}

export async function listBooks() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const items = [];
    const tx = db.transaction(META, 'readonly');
    const req = tx.objectStore(META).openCursor();
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

/** Registro completo (meta + html), ou null. */
export async function getBook(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([META, CONTENT], 'readonly');
    let meta;
    let content;
    tx.objectStore(META).get(id).onsuccess = (e) => { meta = e.target.result; };
    tx.objectStore(CONTENT).get(id).onsuccess = (e) => { content = e.target.result; };
    tx.oncomplete = () => resolve(meta ? { ...meta, html: content?.html ?? '' } : null);
    tx.onabort = () => reject(tx.error);
  });
}

export async function deleteBook(id) {
  await run([META, CONTENT], 'readwrite', (s) => {
    s[META].delete(id);
    s[CONTENT].delete(id);
  });
}

export async function saveScroll(id, y) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META, 'readwrite');
    const store = tx.objectStore(META);
    const req = store.get(id);
    req.onsuccess = () => {
      if (req.result) store.put({ ...req.result, scrollY: y });
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(toError(tx.error));
  });
}
