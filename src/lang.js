const PT = new Set(['de', 'que', 'não', 'uma', 'os', 'é']);
const EN = new Set(['the', 'and', 'of', 'to', 'is', 'that']);
const MIN_HITS = 3;

/**
 * Detecta o idioma pela contagem de palavras funcionais. Empate ou pouco texto: 'pt-BR'.
 * @param {string} text
 * @returns {'pt-BR'|'en'}
 */
export function detectLang(text) {
  let pt = 0;
  let en = 0;
  for (const w of String(text).toLowerCase().match(/\p{L}+/gu) ?? []) {
    if (PT.has(w)) pt++;
    if (EN.has(w)) en++;
  }
  return en > pt && en >= MIN_HITS ? 'en' : 'pt-BR';
}
