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

/**
 * Linhas da página como fileiras visuais: Lines na mesma linha de base (ex.: título e número de página
 * de um sumário sem pontilhado, separados em Lines distintas pelo vão) são juntadas em ordem de x.
 */
function rowLines(page) {
  const sorted = [...page.lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const l of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(l.y - row.y) <= 0.3 * Math.max(l.size, row.size)) row.parts.push(l);
    else rows.push({ y: l.y, size: l.size, parts: [l] });
  }
  return rows
    .map((r) => r.parts.sort((a, b) => a.x - b.x).map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim())
    .filter((t) => t && !isPageNumberText(t));
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

// Linha de índice: "termo, 12, 45-47". Número final que parece ano (1500-2099) indica bibliografia.
function isIndexLine(t) {
  if (!INDEX_LINE.test(t)) return false;
  const last = Number(/(\d+)\s*$/.exec(t)[1]);
  return !(last >= 1500 && last <= 2099);
}

function hasIndexPattern(lines) {
  return lines.length >= MIN_LINES && ratio(lines, isIndexLine) >= RATIO;
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
    const rows = rowLines(page);
    const titleAt = rows.slice(0, 3).findIndex((t) => TOC_TITLE.test(t));
    const body = titleAt >= 0 ? rows.filter((_, i) => i !== titleAt) : rows;
    if (hasTocPattern(body)) return 'toc';
  }
  if (pageIndex >= pageCount * (1 - INDEX_FRACTION)) {
    // Só a primeira página do índice, com título, é reconhecida aqui; as demais vêm de classifyPages.
    const titleAt = lines.slice(0, 3).findIndex((t) => INDEX_TITLE.test(t));
    if (titleAt >= 0 && hasIndexPattern(lines.filter((_, i) => i !== titleAt))) return 'index';
  }
  return null;
}

/** Classifica todas as páginas, incluindo continuações de sumário e de índice sem título. */
export function classifyPages(pages) {
  const result = pages.map((p, i) => classifyPage(p, i, pages.length));
  for (let i = 1; i < pages.length; i++) {
    if (result[i] !== null) continue;
    const prev = result[i - 1];
    if (prev === 'toc' && hasTocPattern(rowLines(pages[i]))) result[i] = 'toc';
    else if (prev === 'index' && hasIndexPattern(textLines(pages[i]))) result[i] = 'index';
  }
  return result;
}
