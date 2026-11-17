import { cleanEpub } from './epub/epub.js';
import { renderBookHtml } from './assemble.js';
import { BookError } from './model.js';
import { saveBook, listBooks, getBook, deleteBook, saveScroll } from './storage/library.js';
import { emptyResultMessage } from './empty-result.js';

const MSG_TYPE = 'Escolha um arquivo PDF ou EPUB.';
const MSG_GENERIC = 'Algo deu errado ao processar este arquivo.';
const MSG_NOT_FOUND = 'Este livro não está mais na lista.';
const APP_TITLE = 'Limpa Livros';
const APP_LANG = 'pt-BR';
const SUMMARY_MS = 3000;
const SCROLL_SAVE_MS = 2000;

// ---------- limpeza (PDF no worker, EPUB na thread principal) ----------

/** @returns {'pdf'|'epub'|null} */
function fileKind(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.epub')) return 'epub';
  if (/\.[^./\\]+$/.test(name)) return null; // extensão explícita de outro tipo
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'application/epub+zip') return 'epub';
  return null;
}

const abortError = () => new DOMException('Cancelado', 'AbortError');

/**
 * Limpa um arquivo PDF ou EPUB.
 * @param {File} file
 * @param {{scanned?:boolean, onProgress?:(p:{done:number,total:number,stage:string})=>void, signal?:AbortSignal}} [opts]
 * @returns {Promise<{title:string, lang:string, html:string, report:object}>}
 */
export async function cleanFile(file, { scanned = false, onProgress, signal } = {}) {
  const kind = fileKind(file);
  if (!kind) throw new BookError(MSG_TYPE);
  if (signal?.aborted) throw abortError();
  const data = await file.arrayBuffer();
  if (signal?.aborted) throw abortError();
  return kind === 'pdf'
    ? cleanPdfInWorker(file.name, data, scanned, onProgress, signal)
    : cleanEpubHere(data, onProgress, signal);
}

function cleanPdfInWorker(name, data, scanned, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const finish = (fn, value) => {
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
      fn(value);
    };
    const onAbort = () => finish(reject, abortError());
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = ({ data: msg }) => {
      if (msg.type === 'progress') onProgress?.(msg);
      else if (msg.type === 'done') finish(resolve, { title: msg.title, lang: msg.lang, html: msg.html, report: msg.report });
      else if (msg.type === 'error') finish(reject, new BookError(msg.message));
    };
    worker.onerror = (e) => {
      console.error(e.message || e);
      finish(reject, new BookError(MSG_GENERIC));
    };
    worker.postMessage({ cmd: 'clean', name, data, scanned }, [data]);
  });
}

function parseHtml(s) {
  const xml = new DOMParser().parseFromString(s, 'application/xhtml+xml');
  if (!xml.getElementsByTagName('parsererror').length) return xml;
  return new DOMParser().parseFromString(s, 'text/html');
}

let jszipPromise = null;
function loadJSZip() {
  jszipPromise ??= import('../vendor/jszip.min.js').then(() => globalThis.JSZip);
  return jszipPromise;
}

async function cleanEpubHere(data, onProgress, signal) {
  onProgress?.({ done: 0, total: 1, stage: 'Limpando' });
  try {
    const JSZip = await loadJSZip();
    const { book, report } = await cleanEpub(new Uint8Array(data), { JSZip, parseHtml });
    if (signal?.aborted) throw abortError();
    onProgress?.({ done: 1, total: 1, stage: 'Limpando' });
    return { title: book.title, lang: book.lang, html: renderBookHtml(book), report };
  } catch (e) {
    if (e instanceof BookError || e?.name === 'AbortError') throw e;
    console.error(e);
    throw new BookError(MSG_GENERIC);
  }
}

// ---------- resumo do relatório ----------

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Resumo em português do que foi removido e movido. */
export function summarize(report) {
  const removed = [];
  if (report.headers) removed.push(plural(report.headers, 'cabeçalho', 'cabeçalhos'));
  if (report.pageNumbers) removed.push(plural(report.pageNumbers, 'número de página', 'números de página'));
  if (report.noteRefs) removed.push(plural(report.noteRefs, 'chamada de nota', 'chamadas de nota'));
  if (report.frontBackPages) removed.push(plural(report.frontBackPages, 'página de sumário/índice/ficha', 'páginas de sumário/índice/ficha'));
  if (report.images) removed.push(plural(report.images, 'imagem', 'imagens'));
  const parts = [];
  if (removed.length) parts.push(`Removidos: ${removed.join(', ')}.`);
  if (report.notesMoved) {
    parts.push(report.notesMoved === 1
      ? '1 nota movida para o fim do capítulo.'
      : `${report.notesMoved} notas movidas para o fim dos capítulos.`);
  }
  return parts.join(' ') || 'Livro pronto. Nada precisou ser removido.';
}

// ---------- telas ----------

const $ = (id) => document.getElementById(id);
const el = {
  nav: $('nav-leitura'),
  biblioteca: $('biblioteca'),
  processando: $('processando'),
  livro: $('livro'),
  arquivo: $('arquivo'),
  escaneado: $('escaneado'),
  mensagem: $('mensagem'),
  lista: $('lista'),
  vazio: $('vazio'),
  procArquivo: $('proc-arquivo'),
  procBarra: $('proc-barra'),
  procEtapa: $('proc-etapa'),
  procPagina: $('proc-pagina'),
  procResumo: $('proc-resumo'),
  procCancelar: $('proc-cancelar'),
};

let job = null; // {controller} enquanto um arquivo é processado
let reading = null; // {id, onScroll, timer}

function show(screen) {
  el.biblioteca.hidden = screen !== 'biblioteca';
  el.processando.hidden = screen !== 'processando';
  el.nav.hidden = screen !== 'leitura';
  el.livro.hidden = screen !== 'leitura';
  if (screen !== 'leitura') el.livro.replaceChildren();
}

function setMessage(text) {
  el.mensagem.textContent = text || '';
  el.mensagem.hidden = !text;
}

function setDocumentMeta(lang, title) {
  document.documentElement.lang = lang;
  document.title = title;
}

async function route() {
  leaveReading();
  const m = /^#\/ler\/(.+)$/.exec(location.hash);
  if (m) {
    await openReading(decodeURIComponent(m[1]));
    return;
  }
  setDocumentMeta(APP_LANG, APP_TITLE);
  if (job) {
    show('processando');
    return;
  }
  show('biblioteca');
  await renderList();
}

// ----- biblioteca -----

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

async function renderList() {
  let books = [];
  try {
    books = await listBooks();
  } catch (e) {
    console.error(e);
    setMessage('Não foi possível abrir a lista de livros neste navegador.');
  }
  el.vazio.hidden = books.length > 0;
  el.lista.replaceChildren(...books.map(bookItem));
}

function bookItem(book) {
  const li = document.createElement('li');
  li.className = 'item';
  const info = document.createElement('div');
  info.className = 'info';
  const title = document.createElement('span');
  title.className = 'titulo';
  title.textContent = book.title;
  const date = document.createElement('span');
  date.className = 'data';
  date.textContent = dateFmt.format(new Date(book.createdAt));
  info.append(title, date);

  const actions = document.createElement('div');
  actions.className = 'acoes';
  const open = document.createElement('a');
  open.className = 'botao primario';
  open.href = `#/ler/${encodeURIComponent(book.id)}`;
  open.textContent = 'Abrir';
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'botao';
  del.textContent = 'Apagar';
  del.addEventListener('click', async () => {
    if (!confirm('Apagar este livro da lista?')) return;
    try {
      await deleteBook(book.id);
    } catch (e) {
      console.error(e);
    }
    await renderList();
  });
  actions.append(open, del);
  li.append(info, actions);
  return li;
}

// ----- processamento -----

function showProgress({ done, total, stage }) {
  if (total) {
    el.procBarra.max = total;
    el.procBarra.value = done;
  } else el.procBarra.removeAttribute('value'); // etapa sem medida (ex.: baixando o modelo do OCR)
  el.procEtapa.textContent = stage;
  const perPage = stage === 'Lendo páginas' || stage === 'Reconhecendo texto';
  el.procPagina.hidden = !perPage;
  if (perPage) el.procPagina.textContent = `página ${done} de ${total}`;
}

async function processFile(file) {
  setMessage('');
  const controller = new AbortController();
  job = { controller };
  el.procArquivo.textContent = file.name;
  el.procResumo.hidden = true;
  el.procCancelar.hidden = false;
  el.procBarra.removeAttribute('value'); // indeterminado até o primeiro progresso
  el.procEtapa.textContent = 'Preparando';
  el.procPagina.hidden = true;
  show('processando');

  const scanned = el.escaneado.checked;
  try {
    const result = await cleanFile(file, { scanned, onProgress: showProgress, signal: controller.signal });
    const emptyMessage = emptyResultMessage(fileKind(file), scanned, result);
    if (emptyMessage) {
      // Sem texto para ler: não salva; volta à biblioteca com a explicação.
      job = null;
      location.hash = '#/';
      await route();
      setMessage(emptyMessage);
      return;
    }
    el.procCancelar.hidden = true; // daqui em diante o livro já está limpo; só falta salvar
    const id = await saveBook({ ...result, sourceName: file.name });
    el.procBarra.max = 1;
    el.procBarra.value = 1;
    el.procEtapa.textContent = 'Pronto';
    el.procPagina.hidden = true;
    el.procResumo.textContent = summarize(result.report);
    el.procResumo.hidden = false;
    await new Promise((r) => setTimeout(r, SUMMARY_MS));
    job = null;
    location.hash = `#/ler/${encodeURIComponent(id)}`;
  } catch (e) {
    job = null;
    if (e?.name === 'AbortError') {
      await route();
      return;
    }
    if (!(e instanceof BookError)) console.error(e);
    await route();
    setMessage(e instanceof BookError ? e.message : MSG_GENERIC);
  }
}

el.arquivo.addEventListener('change', () => {
  const file = el.arquivo.files?.[0];
  el.arquivo.value = '';
  if (file && !job) processFile(file);
});

el.procCancelar.addEventListener('click', () => {
  job?.controller.abort();
});

// ----- leitura -----

async function openReading(id) {
  let book = null;
  try {
    book = await getBook(id);
  } catch (e) {
    console.error(e);
  }
  if (!book) {
    location.hash = '#/';
    setMessage(MSG_NOT_FOUND);
    return;
  }
  show('leitura');
  setDocumentMeta(book.lang || APP_LANG, book.title || APP_TITLE);
  el.livro.innerHTML = book.html; // HTML gerado por renderBookHtml, com todo texto escapado
  requestAnimationFrame(() => window.scrollTo(0, book.scrollY || 0));

  // lastY acompanha a rolagem; ao sair, salva lastY (window.scrollY já pode ter mudado com a troca de tela).
  const state = { id, timer: null, lastY: book.scrollY || 0 };
  state.flush = () => {
    clearTimeout(state.timer);
    state.timer = null;
    saveScroll(id, state.lastY).catch((e) => console.error(e));
  };
  state.onScroll = () => {
    state.lastY = Math.round(window.scrollY);
    if (state.timer === null) state.timer = setTimeout(state.flush, SCROLL_SAVE_MS);
  };
  window.addEventListener('scroll', state.onScroll, { passive: true });
  reading = state;
}

function leaveReading() {
  if (!reading) return;
  window.removeEventListener('scroll', reading.onScroll);
  if (reading.timer !== null) reading.flush();
  reading = null;
}

// A posição de leitura é restaurada por openReading, não pelo navegador.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

window.addEventListener('pagehide', () => {
  if (reading && reading.timer !== null) reading.flush();
});
document.addEventListener('visibilitychange', () => {
  // No Android a aba pode ser encerrada em segundo plano sem pagehide.
  if (document.visibilityState === 'hidden' && reading && reading.timer !== null) reading.flush();
});
window.addEventListener('hashchange', route);
route();

// ----- service worker -----

// Funciona sem internet depois da primeira visita (ver sw.js). Uma versão nova do site fica esperando
// e é oferecida na biblioteca; só passa a valer quando a pessoa toca em "Atualizar".
async function setupServiceWorker() {
  const sw = navigator.serviceWorker;
  const bar = $('atualizacao');
  let waiting = null;
  let updating = false;
  const offer = (worker) => {
    if (!worker || !sw.controller) return; // primeira instalação: não há versão antiga a trocar
    waiting = worker;
    bar.hidden = false;
  };
  $('atualizar').addEventListener('click', () => {
    if (!waiting) return;
    updating = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  });
  sw.addEventListener('controllerchange', () => {
    if (!updating) return; // ex.: clients.claim() da primeira instalação
    updating = false;
    location.reload();
  });

  const registration = await sw.register('./sw.js');
  offer(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') offer(worker);
    });
  });
  await registration.update();
}

if ('serviceWorker' in navigator) setupServiceWorker().catch((e) => console.error(e));
