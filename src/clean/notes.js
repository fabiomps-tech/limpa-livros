import { joinItems } from '../pdf/lines.js';

/** @typedef {import('../model.js').Page} Page */
/** @typedef {import('../model.js').Line} Line */
/** @typedef {import('../model.js').Note} Note */
/** @typedef {import('../model.js').Report} Report */

const FOOTNOTE_MAX = 0.9; // tamanho máximo de linha de nota, fração do corpo
const REF_MAX = 0.8; // tamanho máximo de chamada de nota
const REF_RAISE = 0.2; // elevação mínima da chamada, fração do corpo
const MARKER = /^\s*(\d{1,3}|[*†‡§]+|\[\d+\])[\s.)]\s*/;
const REF_ITEM = /^(\d+|[*†‡]+|\[\d+\])$/;
const BRACKET_ITEM = /^\[\d+\]$/;
const GLUE_GAP = 0.15;
const CONTINUATION_MIN_Y = 0.7; // bloco de continuação sem marcador: só abaixo de 70% da altura

/**
 * Tamanho de fonte do corpo: moda dos tamanhos (arredondados a 0.5) ponderada por caracteres.
 * @param {Page[]} pages
 * @returns {number}
 */
export function bodyFontSize(pages) {
  const chars = new Map();
  for (const p of pages) {
    for (const l of p.lines) {
      const s = Math.round(l.size * 2) / 2;
      chars.set(s, (chars.get(s) ?? 0) + l.text.length);
    }
  }
  let best = 0;
  let size = 0;
  for (const [s, n] of chars) if (n > best) { best = n; size = s; }
  return size;
}

/**
 * Extrai notas de rodapé: bloco contíguo de linhas pequenas na metade de baixo que começa com marcador.
 * Com `continuesNote` (a página anterior tinha notas), as linhas pequenas antes do primeiro marcador, ou
 * um bloco final sem marcador no pé da página, saem como continuação: nota com marcador '' cujo texto
 * deve ser anexado à última nota já coletada. Sem isso, essas linhas ficam no corpo.
 * @param {Page} page
 * @param {number} bodySize
 * @param {Report} report
 * @param {{continuesNote?: boolean}} [options]
 * @returns {{page: Page, notes: Note[]}}
 */
export function extractFootnotes(page, bodySize, report, { continuesNote = false } = {}) {
  const lines = page.lines;
  const small = (l) => l.size <= FOOTNOTE_MAX * bodySize && l.y > page.height / 2;
  // Último trecho contíguo de linhas pequenas que contém uma linha com marcador.
  let start = -1;
  let end = -1;
  let i = lines.length - 1;
  while (i >= 0) {
    if (!small(lines[i])) { i--; continue; }
    const runEnd = i;
    while (i >= 0 && small(lines[i])) i--;
    const first = lines.findIndex((l, k) => k > i && k <= runEnd && MARKER.test(l.text));
    if (first >= 0) {
      start = continuesNote ? i + 1 : first;
      end = runEnd;
      break;
    }
    // Bloco final sem marcador, no pé da página: continuação da nota da página anterior.
    if (continuesNote && runEnd === lines.length - 1 && lines[i + 1].y > CONTINUATION_MIN_Y * page.height) {
      start = i + 1;
      end = runEnd;
      break;
    }
  }
  if (start < 0) return { page, notes: [] };

  /** @type {Note[]} */
  const notes = [];
  for (const l of lines.slice(start, end + 1)) {
    const m = MARKER.exec(l.text);
    if (m) notes.push({ marker: m[1], text: l.text.slice(m[0].length).trim(), page: page.number });
    else if (notes.length) notes[notes.length - 1].text += ' ' + l.text.trim();
    else notes.push({ marker: '', text: l.text.trim(), page: page.number });
  }
  report.notesMoved += notes.filter((n) => n.marker !== '').length;
  return { page: { ...page, lines: [...lines.slice(0, start), ...lines.slice(end + 1)] }, notes };
}

/**
 * Remove chamadas de nota (sobrescritos e [n]) do texto das linhas.
 * @param {Page} page
 * @param {number} bodySize
 * @param {Report} report
 * @returns {Page}
 */
export function stripNoteRefs(page, bodySize, report) {
  const out = [];
  for (const line of page.lines) {
    const kept = line.items.filter((item, idx) => {
      const s = item.str.trim();
      if (!REF_ITEM.test(s)) return true;
      const raised = line.y - item.y >= REF_RAISE * bodySize;
      if (item.size <= REF_MAX * bodySize && raised) return false;
      if (BRACKET_ITEM.test(s) && idx > 0) {
        const prev = line.items[idx - 1];
        if (item.x - (prev.x + prev.width) <= GLUE_GAP * line.size && /\S$/.test(prev.str)) return false;
      }
      return true;
    });
    let text = line.text;
    let width = line.width;
    if (kept.length !== line.items.length) {
      report.noteRefs += line.items.length - kept.length;
      text = joinItems(kept, line.size);
      if (kept.length) {
        const x = kept[0].x;
        width = Math.max(...kept.map((k) => k.x + k.width)) - x;
      }
    }
    text = text.replace(/(?<=\S)\[\d+\]/g, () => { report.noteRefs++; return ''; });
    if (text === '') continue;
    out.push(text === line.text && kept.length === line.items.length ? line : { ...line, text, width, items: kept });
  }
  return { ...page, lines: out };
}
