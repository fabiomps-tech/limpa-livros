import { splitColumns } from './columns.js';

/** @typedef {import('../model.js').Line} Line */
/** @typedef {import('../model.js').Page} Page */
/** @typedef {import('../model.js').Block} Block */

const HEADING_RATIO = 1.15;
const BODY_TOLERANCE = 0.1;
const GAP_RATIO = 1.5;
const INDENT_RATIO = 1.5;
const SENTENCE_END = /[.!?…:»"”)]\s*$/;
const SOFT_HYPHEN_END = /\p{L}[-\u2010\u00AD]$/u;

const clean = (s) => s.replace(/\s+/g, ' ').trim();

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const [v, c] of counts) if (best === null || c > best[1] || (c === best[1] && v < best[0])) best = [v, c];
  return best ? best[0] : null;
}

/** Junta dois trechos: remove hífen de quebra de palavra, senão usa um espaço. */
function joinText(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (SOFT_HYPHEN_END.test(a) && /^\p{Ll}/u.test(b)) return a.slice(0, -1) + b;
  return `${a} ${b}`;
}

/** Acumulador de linhas de um bloco. */
function startBlock(line, page) {
  return { text: clean(line.text), page, sizeSum: line.size * clean(line.text).length, chars: clean(line.text).length, lineCount: 1, heading: false };
}

function addLine(block, line) {
  const t = clean(line.text);
  block.text = joinText(block.text, t);
  block.sizeSum += line.size * t.length;
  block.chars += t.length;
  block.lineCount += 1;
}

/** Blocos de uma coluna de uma página. */
function blocksOfColumn(lines, pageNumber, bodySize) {
  const isBody = (l) => Math.abs(l.size - bodySize) <= BODY_TOLERANCE * bodySize;
  const body = lines.filter(isBody);
  let leftMargin = null;
  let medianGap = 0;
  if (body.length >= 3) {
    leftMargin = mode(body.map((l) => Math.round(l.x)));
    const gaps = [];
    for (let i = 1; i < lines.length; i++) {
      if (isBody(lines[i]) && isBody(lines[i - 1])) {
        const g = lines[i].y - lines[i - 1].y;
        if (g > 0) gaps.push(g);
      }
    }
    medianGap = median(gaps);
  }

  const blocks = [];
  let cur = null;
  let prev = null;
  for (const line of lines) {
    if (!clean(line.text)) continue;
    const isHeading = line.size >= HEADING_RATIO * bodySize;
    if (isHeading) {
      const joinsPrev =
        cur && cur.heading && cur.lineCount < 2 && Math.abs(prev.size - line.size) < 0.5 && line.y - prev.y <= 1.6 * line.size;
      if (joinsPrev) addLine(cur, line);
      else {
        cur = startBlock(line, pageNumber);
        cur.heading = true;
        blocks.push(cur);
      }
    } else {
      let split = !cur || cur.heading;
      if (!split && medianGap > 0 && line.y - prev.y > GAP_RATIO * medianGap) split = true;
      if (!split && leftMargin !== null && line.x - leftMargin >= INDENT_RATIO * bodySize) split = true;
      if (split) {
        cur = startBlock(line, pageNumber);
        blocks.push(cur);
      } else addLine(cur, line);
    }
    prev = line;
  }
  return blocks;
}

/**
 * Monta parágrafos a partir de páginas já sem margens, notas e chamadas de nota.
 * @param {Page[]} pages
 * @param {number} bodySize
 * @returns {Block[]}
 */
export function buildParagraphs(pages, bodySize) {
  /** @type {ReturnType<typeof startBlock>[]} */
  const all = [];
  for (const page of pages) {
    for (const column of splitColumns(page)) {
      let first = true;
      for (const block of blocksOfColumn(column, page.number, bodySize)) {
        const last = all[all.length - 1];
        // continuação: só no primeiro bloco de uma coluna/página, se o anterior não terminou
        const continues = first && last && !last.heading && !block.heading && !SENTENCE_END.test(last.text);
        if (continues) {
          last.text = joinText(last.text, block.text);
          last.sizeSum += block.sizeSum;
          last.chars += block.chars;
          last.lineCount += block.lineCount;
        } else all.push(block);
        first = false;
      }
    }
  }
  return all.map((b) => ({
    type: 'p',
    text: b.text,
    page: b.page,
    size: b.chars ? b.sizeSum / b.chars : bodySize,
    lineCount: b.lineCount,
  }));
}
