import { isPageNumberText, repetitionKey } from './pagenum.js';

const BAND = 0.08;
const MIN_SHARE = 0.3;
const MIN_PAGES = 3;

function bandOf(line, page) {
  if (line.y <= page.height * BAND) return 'top';
  if (line.y >= page.height * (1 - BAND)) return 'bottom';
  return null;
}

/** Conjunto de "banda|chave" repetidas em >=30% (e >=3) das páginas do grupo. */
function repeatedKeys(group, into) {
  if (group.length < MIN_PAGES) return;
  const counts = new Map();
  for (const page of group) {
    const seen = new Set();
    for (const line of page.lines) {
      const band = bandOf(line, page);
      if (band) seen.add(`${band}|${repetitionKey(line.text)}`);
    }
    for (const k of seen) counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (const [k, n] of counts) {
    if (n >= MIN_PAGES && n / group.length >= MIN_SHARE) into.add(k);
  }
}

/**
 * Remove números de página e cabeçalhos/rodapés repetidos, só dentro das faixas
 * de 8% no topo e na base. Não altera a entrada; atualiza o relatório.
 */
export function removeMargins(pages, report) {
  const repeated = new Set();
  repeatedKeys(pages, repeated);
  repeatedKeys(pages.filter((p) => p.number % 2 === 0), repeated);
  repeatedKeys(pages.filter((p) => p.number % 2 === 1), repeated);

  return pages.map((page) => {
    const lines = page.lines.filter((line) => {
      const band = bandOf(line, page);
      if (!band) return true;
      if (isPageNumberText(line.text)) {
        report.pageNumbers++;
        return false;
      }
      if (repeated.has(`${band}|${repetitionKey(line.text)}`)) {
        report.headers++;
        return false;
      }
      return true;
    });
    return { ...page, lines };
  });
}
