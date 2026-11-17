import { splitColumns } from './columns.js';

/** @typedef {import('../model.js').Line} Line */
/** @typedef {import('../model.js').Page} Page */
/** @typedef {import('../model.js').Block} Block */

const HEADING_RATIO = 1.15;
const BODY_TOLERANCE = 0.1;
const GAP_RATIO = 1.5;
const INDENT_RATIO = 1.5;
const SAME_X = 0.5; // linhas recuadas com o mesmo x (fração do corpo) formam uma citação em bloco
const FULL_SLACK = 2; // linha "cheia": chega a até 2× o corpo da borda direita da coluna
const SENTENCE_END = /[.!?…:»"”)]\s*$/;
const SOFT_HYPHEN_END = /\p{L}[-\u2010\u00AD]$/u;
const ONLY_SYMBOLS = /^[^\p{L}\p{N}]+$/u; // ex.: "* * *", "\u2042": separador de cena, lido como ru\u00EDdo

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
  let rightEdge = null;
  let medianGap = 0;
  if (body.length >= 3) {
    leftMargin = mode(body.map((l) => Math.round(l.x)));
    rightEdge = Math.max(...body.map((l) => l.x + l.width));
    const gaps = [];
    for (let i = 1; i < lines.length; i++) {
      if (isBody(lines[i]) && isBody(lines[i - 1])) {
        const g = lines[i].y - lines[i - 1].y;
        if (g > 0) gaps.push(g);
      }
    }
    medianGap = median(gaps);
  }

  const indented = (l) => leftMargin !== null && l.x - leftMargin >= INDENT_RATIO * bodySize;

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
      // Linha só de símbolos (separador de cena) é um bloco à parte, descartado em buildParagraphs.
      const symbols = ONLY_SYMBOLS.test(clean(line.text));
      let split = !cur || cur.heading || cur.symbols || symbols;
      if (!split && medianGap > 0 && line.y - prev.y > GAP_RATIO * medianGap) split = true;
      if (!split && indented(line)) {
        // Citação em bloco: linha recuada logo abaixo de outra com o mesmo recuo, que estava cheia ou
        // não terminou a frase. Senão é recuo de primeira linha (novo parágrafo).
        const sameX = Math.abs(line.x - prev.x) <= SAME_X * bodySize;
        const full = prev.x + prev.width >= rightEdge - FULL_SLACK * bodySize;
        if (indented(prev) && sameX && (full || !SENTENCE_END.test(clean(prev.text)))) cur.quote = true;
        else split = true;
      } else if (!split && cur.quote) split = true; // fim da citação: voltou à margem
      if (split) {
        cur = startBlock(line, pageNumber);
        cur.symbols = symbols;
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
        const continues = first && last && !last.heading && !block.heading && !last.symbols && !block.symbols
          && !SENTENCE_END.test(last.text);
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
  return all.filter((b) => !b.symbols).map((b) => ({
    type: 'p',
    text: b.text,
    page: b.page,
    size: b.chars ? b.sizeSum / b.chars : bodySize,
    lineCount: b.lineCount,
  }));
}
