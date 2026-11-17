import { emptyReport } from '../model.js';
import { classifyPages } from '../clean/frontback.js';
import { removeMargins } from '../clean/margins.js';
import { bodyFontSize, extractFootnotes, stripNoteRefs } from '../clean/notes.js';
import { buildParagraphs } from '../clean/paragraphs.js';
import { markHeadings } from '../clean/headings.js';
import { assembleBook } from '../assemble.js';

/**
 * Limpa as páginas extraídas de um PDF e monta o livro.
 * @param {{pages: import('../model.js').Page[], outline: import('../model.js').OutlineEntry[], title: string|null, imageCount: number}} input
 * @param {(stage:string)=>void} [onProgress]
 * @returns {{book: import('../model.js').Book, report: import('../model.js').Report}}
 */
export function cleanPages({ pages, outline, title, imageCount }, onProgress) {
  const report = emptyReport();
  report.images = imageCount ?? 0;

  onProgress?.('front-back');
  const kinds = classifyPages(pages);
  report.frontBackPages = kinds.filter((k) => k !== null).length;
  const kept = pages.filter((_, i) => kinds[i] === null);

  onProgress?.('margins');
  const trimmed = removeMargins(kept, report);
  const bodySize = bodyFontSize(trimmed);

  onProgress?.('notes');
  const notes = [];
  const bodyPages = trimmed.map((p) => {
    const { page, notes: found } = extractFootnotes(p, bodySize, report);
    notes.push(...found);
    return stripNoteRefs(page, bodySize, report);
  });

  onProgress?.('paragraphs');
  const blocks = markHeadings(buildParagraphs(bodyPages, bodySize), bodyPages, outline, bodySize);

  onProgress?.('assemble');
  return { book: assembleBook({ title: title || 'Livro', blocks, notes }), report };
}
