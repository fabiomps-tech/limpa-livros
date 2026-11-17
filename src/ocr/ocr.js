// Modo escaneado: renderiza cada página do PDF como imagem e reconhece o texto com Tesseract (OCR).
import { BookError } from '../model.js';
import { groupItemsIntoLines } from '../pdf/lines.js';
import { MSG_OPEN, MSG_PASSWORD } from '../pdf/extract.js';

/** @typedef {import('../model.js').Page} Page */
/** @typedef {{text:string, bbox:{x0:number, y0:number, x1:number, y1:number}}} OcrWord */

const RENDER_SCALE = 2; // páginas renderizadas a 2× para o OCR
const SIZE_FACTOR = 0.8; // altura da caixa da palavra → tamanho estimado da fonte
const LANGS = 'por+eng';
const OEM_LSTM_ONLY = 1;

/**
 * Converte palavras reconhecidas pelo OCR numa Page (coordenadas nas mesmas unidades de width/height).
 * A linha de base é aproximada pela base da caixa (y1); o tamanho, por (y1-y0)×0.8.
 * @param {OcrWord[]} words
 * @param {number} pageNumber
 * @param {number} width
 * @param {number} height
 * @returns {Page}
 */
export function ocrWordsToPage(words, pageNumber, width, height) {
  const items = words.map(({ text, bbox: { x0, y0, x1, y1 } }) => ({
    str: text,
    x: x0,
    y: y1,
    width: x1 - x0,
    size: (y1 - y0) * SIZE_FACTOR,
    font: '',
  }));
  return { number: pageNumber, width, height, lines: groupItemsIntoLines(items) };
}

/** Fábrica de canvas do pdf.js baseada em OffscreenCanvas (o worker não tem `document`). */
class OffscreenCanvasFactory {
  create(width, height) {
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) };
  }
  reset(cc, width, height) {
    cc.canvas.width = width;
    cc.canvas.height = height;
  }
  destroy(cc) {
    cc.canvas.width = 0;
    cc.canvas.height = 0;
    cc.canvas = null;
    cc.context = null;
  }
}

/**
 * Reconhece o texto de um PDF escaneado, página a página.
 * Só o modelo de idioma é baixado (uma vez, fica em cache); o livro nunca sai do navegador.
 * @param {Uint8Array} data
 * @param {{pdfjs:any, Tesseract:any, onProgress?:(done:number,total:number)=>void, signal?:AbortSignal}} opts
 * @returns {Promise<{pages: Page[], outline: [], title: string|null, imageCount: 0}>}
 */
export async function ocrPdf(data, { pdfjs, Tesseract, onProgress, signal }) {
  let doc;
  try {
    doc = await pdfjs.getDocument({ data, CanvasFactory: OffscreenCanvasFactory, isOffscreenCanvasSupported: true }).promise;
  } catch (e) {
    if (e?.name === 'PasswordException') throw new BookError(MSG_PASSWORD);
    throw new BookError(MSG_OPEN);
  }

  const vendor = (file) => new URL(`../../vendor/${file}`, import.meta.url).href;
  const worker = await Tesseract.createWorker(LANGS, OEM_LSTM_ONLY, {
    workerPath: vendor('tesseract-worker.min.js'),
    corePath: vendor(''), // diretório: o Tesseract escolhe a variante (SIMD ou não) do núcleo LSTM
  });
  try {
    const total = doc.numPages;
    /** @type {Page[]} */
    const pages = [];
    for (let n = 1; n <= total; n++) {
      signal?.throwIfAborted();
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // fundo branco: páginas transparentes viram preto no OCR
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();

      const { data: result } = await worker.recognize(canvas);
      canvas.width = canvas.height = 0;
      const words = (result.words ?? []).map(({ text, bbox }) => ({
        text,
        bbox: {
          x0: bbox.x0 / RENDER_SCALE,
          y0: bbox.y0 / RENDER_SCALE,
          x1: bbox.x1 / RENDER_SCALE,
          y1: bbox.y1 / RENDER_SCALE,
        },
      }));
      pages.push(ocrWordsToPage(words, n, base.width, base.height));
      onProgress?.(n, total);
    }

    let title = null;
    try {
      const t = (await doc.getMetadata())?.info?.Title;
      if (typeof t === 'string' && t.trim()) title = t.trim();
    } catch { /* sem metadados */ }
    return { pages, outline: [], title, imageCount: 0 };
  } finally {
    await worker.terminate();
    await doc.destroy?.();
  }
}
