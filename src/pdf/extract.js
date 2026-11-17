import { BookError } from '../model.js';
import { groupItemsIntoLines } from './lines.js';

/** @typedef {import('../model.js').Page} Page */
/** @typedef {import('../model.js').OutlineEntry} OutlineEntry */

export const MSG_OPEN = 'Não foi possível abrir este PDF. O arquivo pode estar corrompido.';
export const MSG_PASSWORD = 'Este PDF está protegido por senha ou DRM e não pode ser lido.';

/**
 * Extrai páginas, linhas, sumário (outline), título e contagem de imagens de um PDF.
 * @param {Uint8Array} data
 * @param {any} pdfjs módulo pdf.js injetado
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<{pages: Page[], outline: OutlineEntry[], title: string|null, imageCount: number}>}
 */
export async function extractPdf(data, pdfjs, onProgress) {
  let doc;
  try {
    doc = await pdfjs.getDocument({ data }).promise;
  } catch (e) {
    if (e?.name === 'PasswordException') throw new BookError(MSG_PASSWORD);
    throw new BookError(MSG_OPEN);
  }

  const OPS = pdfjs.OPS ?? {};
  const imageOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject].filter((o) => o !== undefined));
  const total = doc.numPages;
  /** @type {Page[]} */
  const pages = [];
  let imageCount = 0;

  for (let n = 1; n <= total; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = [];
    for (const it of content.items) {
      if (typeof it.str !== 'string') continue;
      const t = it.transform;
      items.push({
        str: it.str,
        x: t[4],
        y: viewport.height - t[5],
        width: it.width,
        size: Math.hypot(t[2], t[3]),
        font: it.fontName ?? '',
      });
    }
    const ops = await page.getOperatorList();
    for (const fn of ops.fnArray) if (imageOps.has(fn)) imageCount++;
    pages.push({ number: n, width: viewport.width, height: viewport.height, lines: groupItemsIntoLines(items) });
    page.cleanup();
    onProgress?.(n, total);
  }

  const outline = await readOutline(doc);
  let title = null;
  try {
    const meta = await doc.getMetadata();
    const t = meta?.info?.Title;
    if (typeof t === 'string' && t.trim()) title = t.trim();
  } catch { /* sem metadados */ }
  await doc.destroy?.();
  return { pages, outline, title, imageCount };
}

/** @returns {Promise<OutlineEntry[]>} */
async function readOutline(doc) {
  let tree;
  try { tree = await doc.getOutline(); } catch { return []; }
  if (!tree) return [];
  const out = [];
  const walk = async (nodes, level) => {
    for (const node of nodes) {
      const page = await resolvePage(doc, node.dest);
      if (page !== null && node.title?.trim()) out.push({ title: node.title.trim(), page, level });
      if (node.items?.length) await walk(node.items, level + 1);
    }
  };
  await walk(tree, 1);
  return out;
}

/** @returns {Promise<number|null>} página 1-based */
async function resolvePage(doc, dest) {
  try {
    const d = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(d) || !d[0]) return null;
    if (typeof d[0] === 'object') return (await doc.getPageIndex(d[0])) + 1;
    if (Number.isInteger(d[0])) return d[0] + 1;
  } catch { /* destino inválido */ }
  return null;
}
