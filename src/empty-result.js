// Regra do resultado vazio: um livro sem texto para ler não é salvo na biblioteca.

export const MSG_LOW_TEXT = 'Este PDF parece ser escaneado. Marque “PDF escaneado” e tente de novo.';
export const MSG_OCR_EMPTY = 'O reconhecimento não encontrou texto neste PDF.';
export const MSG_EPUB_EMPTY = 'Este EPUB não tem texto para ler.';

/**
 * Mensagem a mostrar quando o resultado não tem texto para ler (pouco texto ou nenhum parágrafo).
 * @param {'pdf'|'epub'} kind
 * @param {boolean} scanned modo escaneado (OCR)
 * @param {{html:string, report:{lowText?:boolean}}} result
 * @returns {string|null} null quando o livro pode ser salvo
 */
export function emptyResultMessage(kind, scanned, result) {
  const empty = Boolean(result.report?.lowText) || !/<p[\s>]/.test(result.html || '');
  if (!empty) return null;
  if (kind === 'epub') return MSG_EPUB_EMPTY;
  return scanned ? MSG_OCR_EMPTY : MSG_LOW_TEXT;
}
