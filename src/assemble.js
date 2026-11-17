import { detectLang } from './lang.js';

/** @typedef {import('./model.js').Block} Block */
/** @typedef {import('./model.js').Note} Note */
/** @typedef {import('./model.js').Book} Book */

const LANG_SAMPLE_CHARS = 20000;

/**
 * Agrupa blocos em capítulos (cada 'h' abre um) e distribui as notas pela página.
 * @param {{title:string, blocks:Block[], notes:Note[]}} input
 * @returns {Book}
 */
export function assembleBook({ title, blocks, notes }) {
  const chapters = [];
  const starts = []; // página inicial de cada capítulo
  let current = null;
  for (const b of blocks) {
    if (b.type === 'h') {
      current = { heading: b.text, level: b.level === 2 ? 2 : 1, paragraphs: [], notes: [] };
      chapters.push(current);
      starts.push(b.page);
    } else {
      if (!current) {
        current = { heading: null, level: 1, paragraphs: [], notes: [] };
        chapters.push(current);
        starts.push(-Infinity);
      }
      current.paragraphs.push(b.text);
    }
  }
  if (!chapters.length) {
    chapters.push({ heading: null, level: 1, paragraphs: [], notes: [] });
    starts.push(-Infinity);
  }
  for (const note of notes) {
    let idx = 0;
    for (let i = 0; i < chapters.length; i++) if (starts[i] <= note.page) idx = i;
    chapters[idx].notes.push(note);
  }
  const sample = blocks.filter((b) => b.type === 'p').map((b) => b.text).join(' ').slice(0, LANG_SAMPLE_CHARS);
  return { title, lang: detectLang(sample), chapters };
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * Fragmento HTML do livro; todo texto é escapado.
 * @param {Book} book
 * @returns {string}
 */
export function renderBookHtml(book) {
  let html = `<article lang="${esc(book.lang)}"><h1>${esc(book.title)}</h1>`;
  for (const ch of book.chapters) {
    html += '<section>';
    if (ch.heading !== null) {
      const tag = ch.level === 2 ? 'h3' : 'h2';
      html += `<${tag}>${esc(ch.heading)}</${tag}>`;
    }
    for (const p of ch.paragraphs) html += `<p>${esc(p)}</p>`;
    if (ch.notes.length) {
      html += '<aside class="notas"><h3>Notas</h3><ol>';
      for (const n of ch.notes) html += `<li><b>${esc(n.marker)}</b> ${esc(n.text)}</li>`;
      html += '</ol></aside>';
    }
    html += '</section>';
  }
  return html + '</article>';
}
