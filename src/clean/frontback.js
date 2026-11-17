import { isPageNumberText } from './pagenum.js';

const MIN_LINES = 3;
const RATIO = 0.6;
const TOC_FRACTION = 0.15;
const INDEX_FRACTION = 0.2;

const TOC_TITLE = /^(sum[áa]rio|[íi]ndice|contents|table of contents)$/i;
const INDEX_TITLE = /^([íi]ndice remissivo|[íi]ndice onom[áa]stico|index)$/i;
// Número de página ao final; romano só com pontilhado, para não pegar "... Capítulo I" em prosa.
const TOC_ARABIC = /\S.*?(?:\.{2,}|\s)\s*\d{1,4}$/;
const TOC_ROMAN = /\S.*?\.{2,}\s*[ivxlcdm]{1,8}$/i;
const INDEX_LINE = /^[^\d]\S.*?,\s*\d+(?:\s*[-\u2013]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-\u2013]\s*\d+)?)*$/;

const COLOPHON_MARKERS = [
  /\bISBN\b/i,
  /\bCDD\b/,
  /\bCDU\b/,
  /Dados Internacionais de Cataloga[çc][ãa]o/i,
  /©/,
  /\bCopyright\b/i,
  /Todos os direitos reservados/i,
  /Impresso no Brasil/i,
];

function textLines(page) {
  return page.lines.map((l) => l.text.replace(/\s+/g, ' ').trim()).filter((t) => t && !isPageNumberText(t));
}

function isTocLine(t) {
  return TOC_ARABIC.test(t) || TOC_ROMAN.test(t);
}

function ratio(lines, test) {
  return lines.length ? lines.filter(test).length / lines.length : 0;
}

function hasTocPattern(lines) {
  return lines.length >= MIN_LINES && ratio(lines, isTocLine) >= RATIO;
}

function hasIndexPattern(lines) {
  return lines.length >= MIN_LINES && ratio(lines, (t) => INDEX_LINE.test(t)) >= RATIO;
}

function isColophon(page) {
  const joined = page.lines.map((l) => l.text).join('\n');
  return COLOPHON_MARKERS.filter((re) => re.test(joined)).length >= 2;
}

/** Classifica uma página isolada: 'toc', 'index', 'colophon' ou null. Continuações sem título ficam com classifyPages. */
export function classifyPage(page, pageIndex, pageCount) {
  if (isColophon(page)) return 'colophon';
  const lines = textLines(page);
  if (pageIndex < pageCount * TOC_FRACTION) {
    const titleAt = lines.slice(0, 3).findIndex((t) => TOC_TITLE.test(t));
    const body = titleAt >= 0 ? lines.filter((_, i) => i !== titleAt) : lines;
    if (hasTocPattern(body)) return 'toc';
  }
  if (pageIndex >= pageCount * (1 - INDEX_FRACTION)) {
    const titleAt = lines.slice(0, 3).findIndex((t) => INDEX_TITLE.test(t));
    const body = titleAt >= 0 ? lines.filter((_, i) => i !== titleAt) : lines;
    if (hasIndexPattern(body)) return 'index';
  }
  return null;
}

/** Classifica todas as páginas, incluindo continuações de sumário e de índice sem título. */
export function classifyPages(pages) {
  const result = pages.map((p, i) => classifyPage(p, i, pages.length));
  for (let i = 1; i < pages.length; i++) {
    if (result[i] !== null) continue;
    const prev = result[i - 1];
    const lines = textLines(pages[i]);
    if (prev === 'toc' && hasTocPattern(lines)) result[i] = 'toc';
    else if (prev === 'index' && hasIndexPattern(lines)) result[i] = 'index';
  }
  return result;
}
