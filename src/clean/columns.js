/** @typedef {import('../model.js').Line} Line */
/** @typedef {import('../model.js').Page} Page */

const byY = (a, b) => a.y - b.y || a.x - b.x;

/**
 * Separa as linhas de uma página em colunas de leitura.
 * Duas colunas só são detectadas se ≥60% das linhas têm largura < 55% da largura útil
 * e as linhas estreitas se dividem em duas faixas de x separadas por um vão.
 * @param {Page} page
 * @returns {Line[][]} colunas (cada uma ordenada por y); uma única coluna se não houver duas
 */
export function splitColumns(page) {
  const lines = [...page.lines].sort(byY);
  if (lines.length < 4) return [lines];

  const minX = Math.min(...lines.map((l) => l.x));
  const maxX = Math.max(...lines.map((l) => l.x + l.width));
  const usable = maxX - minX;
  if (usable <= 0) return [lines];

  const narrow = lines.filter((l) => l.width < 0.55 * usable);
  if (narrow.length < 0.6 * lines.length) return [lines];

  // une os intervalos [x, x+width] das linhas estreitas e procura o maior vão entre eles
  const spans = narrow.map((l) => [l.x, l.x + l.width]).sort((a, b) => a[0] - b[0]);
  let reach = spans[0][1];
  let gutter = null;
  for (const [start, end] of spans.slice(1)) {
    if (start > reach && (!gutter || start - reach > gutter.size)) {
      gutter = { size: start - reach, at: (start + reach) / 2 };
    }
    reach = Math.max(reach, end);
  }
  if (!gutter || gutter.size < 0.03 * usable) return [lines];

  const left = lines.filter((l) => l.x < gutter.at);
  const right = lines.filter((l) => l.x >= gutter.at);
  const leftNarrow = narrow.filter((l) => l.x < gutter.at).length;
  const rightNarrow = narrow.length - leftNarrow;
  if (leftNarrow < 2 || rightNarrow < 2) return [lines];
  return [left, right];
}

/**
 * Ordem de leitura de uma página: coluna esquerda inteira e depois a direita,
 * ou apenas por y quando a página tem uma coluna.
 * @param {Page} page
 * @returns {Line[]}
 */
export function orderByColumns(page) {
  return splitColumns(page).flat();
}
