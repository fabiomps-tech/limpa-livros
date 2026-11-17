/** Minúsculas, sem acentos, espaços únicos. */
function normalize(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

const MAX_HEADING_CHARS = 80;
const MAX_HEADING_LINES = 2;
// Folga além do título do outline: evita transformar um parágrafo longo em título.
const OUTLINE_SLACK_CHARS = 40;

function markFromOutline(blocks, outline) {
  const out = blocks.map((b) => ({ ...b }));
  const inserts = []; // { index: posição em `out` antes da qual inserir, block }
  for (const entry of outline) {
    const title = normalize(entry.title);
    if (!title) continue;
    const level = Math.min(2, Math.max(1, entry.level || 1));
    const found = out.findIndex((b) => {
      if (b.type !== 'p' || b.page !== entry.page) return false;
      const t = normalize(b.text);
      return t.length <= title.length + OUTLINE_SLACK_CHARS && (t.startsWith(title) || t.includes(title));
    });
    if (found >= 0) {
      out[found].type = 'h';
      out[found].level = level;
      continue;
    }
    let index = out.findIndex((b) => b.page >= entry.page);
    if (index < 0) index = out.length;
    inserts.push({ index, block: { type: 'h', level, text: String(entry.title).trim(), page: entry.page } });
  }
  // Insere do fim para o começo; entradas do mesmo ponto mantêm a ordem do outline.
  const byIndex = new Map();
  for (const { index, block } of inserts) {
    if (!byIndex.has(index)) byIndex.set(index, []);
    byIndex.get(index).push(block);
  }
  const result = [];
  for (let i = 0; i <= out.length; i++) {
    if (byIndex.has(i)) result.push(...byIndex.get(i));
    if (i < out.length) result.push(out[i]);
  }
  return result;
}

function markFromSize(blocks, bodySize) {
  return blocks.map((b) => {
    if (b.type !== 'p' || !b.size || !bodySize) return { ...b };
    const short = (b.lineCount ?? 1) <= MAX_HEADING_LINES && b.text.length <= MAX_HEADING_CHARS;
    if (!short) return { ...b };
    if (b.size >= 1.3 * bodySize) return { ...b, type: 'h', level: 1 };
    if (b.size >= 1.15 * bodySize) return { ...b, type: 'h', level: 2 };
    return { ...b };
  });
}

/** Marca títulos (type 'h'), pelo outline quando existe, senão pelo tamanho da fonte. Não altera a entrada. */
export function markHeadings(blocks, pages, outline, bodySize) {
  if (outline && outline.length) return markFromOutline(blocks, outline);
  return markFromSize(blocks, bodySize);
}
