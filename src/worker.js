// Worker de módulo: limpa PDFs fora da thread da interface.
// Entrada: {cmd:'clean', name, data:ArrayBuffer, scanned}
// Saída: {type:'progress', done, total, stage} | {type:'done', title, lang, html, report} | {type:'error', message}
import * as pdfjs from '../vendor/pdf.min.mjs';
import { extractPdf } from './pdf/extract.js';
import { ocrPdf } from './ocr/ocr.js';
import { cleanPages } from './pdf/pipeline.js';
import { renderBookHtml } from './assemble.js';
import { BookError } from './model.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

const MSG_TYPE = 'Escolha um arquivo PDF ou EPUB.';
const MSG_GENERIC = 'Algo deu errado ao processar este arquivo.';
const LOW_TEXT_CHARS_PER_PAGE = 50;
const CLEAN_STAGES = ['front-back', 'margins', 'notes', 'paragraphs', 'assemble'];

// Só avisos de erro do pdf.js no console (ex.: fontes padrão ausentes não importam para extrair texto).
const quietPdfjs = {
  ...pdfjs,
  getDocument: (opts) => pdfjs.getDocument({ ...opts, verbosity: pdfjs.VerbosityLevel.ERRORS }),
};

const post = (msg) => self.postMessage(msg);

self.onmessage = async (event) => {
  const { cmd, name, data, scanned } = event.data ?? {};
  if (cmd !== 'clean') return;
  try {
    // A interface já escolheu o tipo (extensão ou MIME); aqui só recusa extensão explícita que não é .pdf.
    const ext = /\.([^./\\]+)$/.exec(name ?? '')?.[1];
    if (ext && ext.toLowerCase() !== 'pdf') throw new BookError(MSG_TYPE);
    post(await cleanPdf(new Uint8Array(data), scanned));
  } catch (e) {
    if (!(e instanceof BookError)) console.error(e);
    post({ type: 'error', message: e instanceof BookError ? e.message : MSG_GENERIC });
  }
};

async function cleanPdf(bytes, scanned) {
  if (scanned) {
    // Carregado sob demanda: só o modo escaneado precisa do Tesseract (UMD, registra globalThis.Tesseract).
    // Se a biblioteca não carregar, Tesseract fica indefinido e ocrPdf responde com a mensagem de OCR.
    await import('../vendor/tesseract.min.js').catch(() => {});
    const extracted = await ocrPdf(bytes, {
      pdfjs: quietPdfjs,
      Tesseract: globalThis.Tesseract,
      onProgress: (done, total) => post({ type: 'progress', done, total, stage: 'Reconhecendo texto' }),
    });
    return finish(extracted, false);
  }

  const extracted = await extractPdf(bytes, quietPdfjs, (done, total) =>
    post({ type: 'progress', done, total, stage: 'Lendo páginas' }));

  let chars = 0;
  for (const page of extracted.pages) for (const line of page.lines) chars += line.text.replace(/\s/g, '').length;
  const lowText = chars / Math.max(1, extracted.pages.length) < LOW_TEXT_CHARS_PER_PAGE;
  return finish(extracted, lowText);
}

function finish(extracted, lowText) {
  const { book, report } = cleanPages(extracted, (stage) =>
    post({ type: 'progress', done: CLEAN_STAGES.indexOf(stage) + 1, total: CLEAN_STAGES.length, stage: 'Limpando' }));
  if (lowText) report.lowText = true;
  return { type: 'done', title: book.title, lang: book.lang, html: renderBookHtml(book), report };
}
