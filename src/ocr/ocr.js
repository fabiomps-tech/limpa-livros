// Modo escaneado: renderiza cada página do PDF como imagem e reconhece o texto com Tesseract (OCR).
import { BookError } from '../model.js';
import { groupItemsIntoLines } from '../pdf/lines.js';
import { MSG_OPEN, MSG_PASSWORD } from '../pdf/extract.js';

/** @typedef {import('../model.js').Page} Page */
/** @typedef {{text:string, bbox:{x0:number, y0:number, x1:number, y1:number}}} OcrWord */

const RENDER_SCALE = 2; // páginas renderizadas a 2× para o OCR
const SIZE_FACTOR = 0.8; // altura da caixa da palavra → tamanho estimado da fonte
const SUPER_SIZE = 0.75; // sobrescrito: tamanho bruto < 0.75× o da linha…
const SUPER_RISE = 0.2; // …e base pelo menos 0.2× o tamanho da linha acima da base da linha
const LANGS = 'por+eng';
const OEM_LSTM_ONLY = 1;

export const STAGE_MODEL = 'Baixando modelo de reconhecimento (só na primeira vez)';

export const MSG_OCR_DATA = 'Não foi possível baixar os dados de reconhecimento de texto. '
  + 'Conecte-se à internet na primeira vez que usar o modo escaneado e tente de novo.';

/**
 * Converte as linhas reconhecidas pelo OCR numa Page (coordenadas nas mesmas unidades de width/height).
 * Tamanho bruto de cada palavra: (y1-y0)×0.8; base: y1. Como ascendentes e descendentes fazem esses valores
 * variarem, cada palavra recebe o tamanho e a base medianos da sua linha do OCR, exceto a que é bem menor
 * e está elevada (chamada de nota sobrescrita), que mantém os seus para continuar detectável.
 * @param {{words: OcrWord[]}[]} lines
 * @param {number} pageNumber
 * @param {number} width
 * @param {number} height
 * @returns {Page}
 */
export function ocrLinesToPage(lines, pageNumber, width, height) {
  const items = [];
  for (const line of lines) {
    const raw = line.words
      .filter((wd) => wd.text.trim() !== '')
      .map(({ text, bbox: { x0, y0, x1, y1 } }) => ({
        str: text, x: x0, y: y1, width: x1 - x0, size: (y1 - y0) * SIZE_FACTOR, font: '',
      }));
    if (!raw.length) continue;
    const lineSize = median(raw.map((i) => i.size));
    const lineY = median(raw.map((i) => i.y));
    for (const item of raw) {
      const superscript = item.size < SUPER_SIZE * lineSize && lineY - item.y >= SUPER_RISE * lineSize;
      items.push(superscript ? item : { ...item, size: lineSize, y: lineY });
    }
  }
  return { number: pageNumber, width, height, lines: groupItemsIntoLines(items) };
}

/** Caixa em pixels da imagem renderizada a 2× → pontos do PDF (escala 1). */
function toPoints({ x0, y0, x1, y1 }) {
  return { x0: x0 / RENDER_SCALE, y0: y0 / RENDER_SCALE, x1: x1 / RENDER_SCALE, y1: y1 / RENDER_SCALE };
}

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
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
 * onStage é chamado com STAGE_MODEL antes de carregar o modelo (na primeira vez são uns 20–30 MB).
 * @param {{pdfjs:any, Tesseract:any, onProgress?:(done:number,total:number)=>void, onStage?:(stage:string)=>void, signal?:AbortSignal}} opts
 * @returns {Promise<{pages: Page[], outline: [], title: string|null, imageCount: 0}>}
 */
export async function ocrPdf(data, { pdfjs, Tesseract, onProgress, onStage, signal }) {
  let doc;
  try {
    doc = await pdfjs.getDocument({ data, CanvasFactory: OffscreenCanvasFactory, isOffscreenCanvasSupported: true }).promise;
  } catch (e) {
    if (e?.name === 'PasswordException') throw new BookError(MSG_PASSWORD);
    throw new BookError(MSG_OPEN);
  }

  const vendor = (file) => new URL(`../../vendor/${file}`, import.meta.url).href;
  let worker;
  try {
    // Na primeira vez baixa o modelo de idioma; sem internet (ou sem a biblioteca) falha aqui.
    // No tesseract.js 5 uma falha ao baixar o modelo só chega ao errorHandler: a promessa de
    // createWorker nunca é rejeitada. Por isso a corrida com `failed`.
    onStage?.(STAGE_MODEL);
    let fail;
    const failed = new Promise((_, reject) => { fail = reject; });
    failed.catch(() => {}); // erros depois da criação chegam pela rejeição de recognize
    worker = await Promise.race([
      Tesseract.createWorker(LANGS, OEM_LSTM_ONLY, {
        workerPath: vendor('tesseract-worker.min.js'),
        corePath: vendor(''), // diretório: o Tesseract escolhe a variante (SIMD ou não) do núcleo LSTM
        errorHandler: (err) => fail(new Error(String(err))), // e evita o erro solto que o Tesseract lançaria
      }),
      failed,
    ]);
  } catch {
    await doc.destroy?.();
    throw new BookError(MSG_OCR_DATA);
  }
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
      const lines = (result.lines ?? []).map((line) => ({
        words: line.words.map(({ text, bbox }) => ({ text, bbox: toPoints(bbox) })),
      }));
      pages.push(ocrLinesToPage(lines, n, base.width, base.height));
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
