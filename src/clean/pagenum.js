const ROMAN = '(?=[ivxlcdm])m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})';
const NUM = String.raw`(?:\d{1,5}|${ROMAN})`;
const DASH = '[-\u2013\u2014]';

const ONLY_NUMBER = new RegExp(String.raw`^(?:${DASH}\s*)?${NUM}(?:\s*${DASH})?$`, 'i');
const LABELLED = /^(?:página|pág\.?|p\.|page|pp\.)\s*\d{1,5}$/i;

/** Texto de linha que parece apenas um número de página (inclusive com título ao lado, separado por "|"). */
export function isPageNumberText(s) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (ONLY_NUMBER.test(t) || LABELLED.test(t)) return true;
  if (t.includes('|')) {
    const parts = t.split('|').map((p) => p.trim());
    if (parts.length === 2 && parts.some((p) => p && (ONLY_NUMBER.test(p) || LABELLED.test(p)))) return true;
  }
  return false;
}

const ROMAN_WORD = new RegExp(String.raw`(?<![\p{L}\d])${ROMAN}(?![\p{L}\d])`, 'giu');

/** Chave de repetição: minúsculas, espaços únicos, dígitos e romanos isolados viram "#". */
export function repetitionKey(s) {
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\d+/g, '#')
    .replace(ROMAN_WORD, '#');
}
