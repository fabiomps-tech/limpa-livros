/** @typedef {import('../model.js').TextItem} TextItem */
/** @typedef {import('../model.js').Line} Line */

const BASELINE_TOL = 0.3; // fração do tamanho
const SUPER_MAX = 0.5; // elevação máxima de sobrescrito, fração do tamanho
const SPACE_GAP = 0.15; // vão mínimo para inserir espaço, fração do tamanho

/**
 * Agrupa itens de texto em linhas (mesma linha de base), ordenadas por y e, dentro da linha, por x.
 * @param {TextItem[]} items
 * @returns {Line[]}
 */
export function groupItemsIntoLines(items) {
  const valid = items.filter((i) => i.str.trim() !== '');
  // Maiores primeiro: o texto principal define a linha; itens menores (sobrescritos) se anexam.
  const ordered = [...valid].sort((a, b) => b.size - a.size || a.y - b.y || a.x - b.x);
  /** @type {{y:number, size:number, items:TextItem[]}[]} */
  const groups = [];
  for (const item of ordered) {
    const g = groups.find((g) => {
      const d = Math.abs(item.y - g.y);
      if (d <= BASELINE_TOL * Math.max(item.size, g.size)) return true;
      const raised = g.y - item.y; // positivo: item mais alto na página
      return item.size < g.size && raised > 0 && raised <= SUPER_MAX * g.size;
    });
    if (g) g.items.push(item);
    else groups.push({ y: item.y, size: item.size, items: [item] });
  }
  return groups.map(buildLine).sort((a, b) => a.y - b.y || a.x - b.x);
}

/** @returns {Line} */
function buildLine(g) {
  const items = [...g.items].sort((a, b) => a.x - b.x);
  const chars = new Map(); // tamanho -> nº de caracteres
  for (const i of items) chars.set(i.size, (chars.get(i.size) ?? 0) + i.str.length);
  let size = items[0].size;
  let best = -1;
  for (const [s, n] of chars) if (n > best) { best = n; size = s; }
  const dominant = items.find((i) => i.size === size);

  let text = '';
  let prev = null;
  for (const i of items) {
    if (prev) {
      const gap = i.x - (prev.x + prev.width);
      const glued = /\s$/.test(text) || /^\s/.test(i.str);
      if (gap > SPACE_GAP * size && !glued) text += ' ';
    }
    text += i.str;
    prev = i;
  }
  const x = items[0].x;
  const right = Math.max(...items.map((i) => i.x + i.width));
  return { text: text.trim(), x, y: dominant.y, width: right - x, size, items };
}
