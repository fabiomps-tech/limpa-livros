import { assembleBook } from '../assemble.js';
import { BookError, emptyReport } from '../model.js';

/** @typedef {import('../model.js').Block} Block */
/** @typedef {import('../model.js').Note} Note */

const MSG_CORRUPT = 'Não foi possível abrir este EPUB. O arquivo pode estar corrompido.';
const MSG_DRM = 'Este EPUB está protegido por DRM e não pode ser lido.';
const OPS_NS = 'http://www.idpf.org/2007/ops';

const JUNK_TAGS = new Set(['script', 'style', 'table']);
const PAGEBREAK = new Set(['pagebreak', 'doc-pagebreak']);
const FRONTBACK = new Set(['toc', 'doc-toc', 'index', 'doc-index', 'copyright-page', 'doc-colophon']);
const NOTEREF = new Set(['noteref', 'doc-noteref']);
const BACKLINK = new Set(['backlink', 'doc-backlink']);
const NOTE = new Set(['footnote', 'endnote', 'rearnote', 'doc-footnote', 'doc-endnote', 'doc-rearnote']);
const NOTE_SECTION = new Set(['endnotes', 'doc-endnotes', 'footnotes', 'doc-footnotes', 'rearnotes']);
const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote']);
const WRAPPER_TAGS = new Set(['div', 'section', 'article', 'main', 'ol', 'ul']);
const NOTES_ONLY_RATIO = 0.8;
const ORDINAL_SPAN = 1000; // página sintética = posição no spine * 1000 + ordem do título no arquivo

// ---------- utilidades de DOM ----------

const tagOf = (el) => (el.localName || el.tagName || '').toLowerCase().split(':').pop();
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const all = (root) => Array.from(root.querySelectorAll('*'));
const byLocalName = (root, name) => all(root).filter((e) => tagOf(e) === name);

/** Atributo tolerante a maiúsculas e a prefixo de namespace. */
function attr(el, name) {
  const direct = el.getAttribute(name);
  if (direct != null) return direct;
  const lower = name.toLowerCase();
  for (const a of Array.from(el.attributes || [])) {
    if (a.name.toLowerCase() === lower) return a.value;
  }
  return null;
}

/** Tokens de epub:type e role (minúsculos). */
function semantics(el) {
  let type = attr(el, 'epub:type');
  if (type == null && typeof el.getAttributeNS === 'function') type = el.getAttributeNS(OPS_NS, 'type');
  const role = attr(el, 'role');
  return new Set(`${type || ''} ${role || ''}`.toLowerCase().split(/\s+/).filter(Boolean));
}
const hasAny = (tokens, set) => [...tokens].some((t) => set.has(t));

function hasAncestor(el, pred) {
  for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) if (pred(p)) return true;
  return false;
}

function resolvePath(base, href) {
  const raw = href.split('#')[0].split('?')[0];
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* mantém o texto cru */
  }
  const out = [];
  for (const part of `${base}${decoded}`.split('/')) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}

function hasBlockDescendant(el) {
  return all(el).some((d) => BLOCK_TAGS.has(tagOf(d)));
}

/** Texto de um elemento; se contém blocos, junta os blocos-folha com espaço. */
function textOf(el) {
  if (!hasBlockDescendant(el)) return norm(el.textContent || '');
  return norm(
    all(el)
      .filter((d) => BLOCK_TAGS.has(tagOf(d)) && !hasBlockDescendant(d))
      .map((d) => d.textContent || '')
      .join(' '),
  );
}

// ---------- pacote EPUB ----------

async function readPackage(zip, parseHtml) {
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new BookError(MSG_CORRUPT);
  const container = parseHtml(await containerFile.async('string'));
  const rootfile = byLocalName(container, 'rootfile')[0];
  const opfPath = rootfile && attr(rootfile, 'full-path');
  const opfFile = opfPath && zip.file(resolvePath('', opfPath));
  if (!opfFile) throw new BookError(MSG_CORRUPT);
  const opf = parseHtml(await opfFile.async('string'));
  const base = resolvePath('', opfPath).split('/').slice(0, -1).join('/');
  const prefix = base ? `${base}/` : '';

  const manifest = new Map();
  for (const item of byLocalName(opf, 'item')) {
    const id = attr(item, 'id');
    const href = attr(item, 'href');
    if (id && href) {
      manifest.set(id, {
        path: resolvePath(prefix, href),
        type: (attr(item, 'media-type') || '').toLowerCase(),
        nav: (attr(item, 'properties') || '').split(/\s+/).includes('nav'),
      });
    }
  }
  const spine = [];
  for (const ref of byLocalName(opf, 'itemref')) {
    const item = manifest.get(attr(ref, 'idref'));
    if (!item) continue;
    spine.push({ ...item, linear: (attr(ref, 'linear') || 'yes').toLowerCase() !== 'no' });
  }
  const titleEl = byLocalName(opf, 'title')[0];
  return { title: titleEl ? norm(titleEl.textContent || '') : '', spine };
}

async function assertNoDrm(zip, parseHtml, spine) {
  const file = zip.file('META-INF/encryption.xml');
  if (!file) return;
  const spinePaths = new Set(spine.map((s) => s.path));
  const doc = parseHtml(await file.async('string'));
  for (const ref of byLocalName(doc, 'cipherreference')) {
    const uri = attr(ref, 'URI');
    if (uri && spinePaths.has(resolvePath('', uri))) throw new BookError(MSG_DRM);
  }
}

// ---------- limpeza de um arquivo do spine ----------

function removeJunk(body, report) {
  for (const el of all(body)) {
    if (!body.contains(el)) continue; // já removido junto com um ancestral
    const tag = tagOf(el);
    const sem = semantics(el);
    if (tag === 'figure') {
      if (all(el).some((d) => ['img', 'svg', 'image'].includes(tagOf(d)))) report.images++;
      el.remove();
    } else if (tag === 'img' || tag === 'svg') {
      report.images++;
      el.remove();
    } else if (JUNK_TAGS.has(tag)) {
      el.remove();
    } else if (hasAny(sem, PAGEBREAK)) {
      report.pageNumbers++;
      el.remove();
    } else if (tag === 'nav' || hasAny(sem, FRONTBACK)) {
      report.frontBackPages++;
      el.remove();
    }
  }
}

/** Chamadas de nota: a[noteref] ou sup cujo único filho é a[href*="#"]. */
function findNoteRefs(body) {
  const refs = [];
  for (const el of all(body)) {
    const tag = tagOf(el);
    if (tag === 'a' && hasAny(semantics(el), NOTEREF)) {
      if (!hasAncestor(el, (p) => refs.some((r) => r.el === p))) refs.push({ el, a: el });
    } else if (tag === 'sup') {
      const kids = Array.from(el.children || []);
      const a = kids.length === 1 && tagOf(kids[0]) === 'a' ? kids[0] : null;
      if (a && (attr(a, 'href') || '').includes('#') && norm(el.textContent || '') === norm(a.textContent || '')) {
        refs.push({ el, a });
      }
    }
  }
  return refs;
}

function isNotesOnly(body, referencedIds) {
  const sections = all(body).filter((e) => hasAny(semantics(e), NOTE_SECTION));
  if (sections.length) {
    const outside = all(body).filter(
      (e) =>
        BLOCK_TAGS.has(tagOf(e)) &&
        !/^h[1-6]$/.test(tagOf(e)) &&
        !hasBlockDescendant(e) &&
        !sections.some((s) => s === e || hasAncestor(e, (p) => p === s)),
    );
    if (!outside.length) return true;
  }
  let container = body;
  for (;;) {
    const kids = Array.from(container.children || []).filter((k) => !/^h[1-6]$/.test(tagOf(k)));
    if (kids.length === 1 && WRAPPER_TAGS.has(tagOf(kids[0]))) container = kids[0];
    else break;
  }
  const kids = Array.from(container.children || []).filter((k) => !/^h[1-6]$/.test(tagOf(k)));
  if (!kids.length) return false;
  const noteLike = kids.filter((k) => ['aside', 'li'].includes(tagOf(k)) && referencedIds.has(attr(k, 'id')));
  return noteLike.length / kids.length >= NOTES_ONLY_RATIO;
}

/** Elementos de nota dentro de um capítulo (mais externos primeiro, sem aninhar). */
function findNoteElements(body) {
  const sections = all(body).filter((e) => hasAny(semantics(e), NOTE_SECTION));
  const found = [];
  for (const el of all(body)) {
    const tag = tagOf(el);
    const typed = hasAny(semantics(el), NOTE);
    const inSection = ['li', 'aside'].includes(tag) && sections.some((s) => hasAncestor(el, (p) => p === s));
    if ((typed || inSection) && !found.some((f) => f === el || hasAncestor(el, (p) => p === f))) found.push(el);
  }
  return { notes: found, sections };
}

function noteMarker(text, refText) {
  if (refText) {
    const stripped = text.startsWith(refText) ? text.slice(refText.length) : null;
    return { marker: refText, text: stripped !== null && /^[\s.)\]:-]/.test(stripped) ? norm(stripped.replace(/^[\s.)\]:-]+/, '')) : text };
  }
  const m = text.match(/^(\[?\d+\]?|[*†‡]+)[.)\]]?\s+(.*)$/);
  return m ? { marker: m[1], text: m[2] } : { marker: '', text };
}

/**
 * Limpa um documento do spine.
 * @returns {{blocks:Block[], notes:Note[]}}
 */
function cleanDocument(doc, spineIndex, referencedIds, report) {
  const body = doc.body || byLocalName(doc, 'body')[0] || doc.documentElement;
  const blocks = [];
  const notes = [];
  if (!body) return { blocks, notes };
  const pageOf = (ordinal) => spineIndex * ORDINAL_SPAN + ordinal;

  removeJunk(body, report);
  const refs = findNoteRefs(body);

  // ordem de cada elemento: cada h1–h3 (fora de notas) abre uma nova ordem no arquivo
  const { notes: noteEls, sections } = findNoteElements(body);
  const ordinalOf = new Map();
  let ordinal = 0;
  for (const el of all(body)) {
    if (/^h[1-3]$/.test(tagOf(el)) && !noteEls.some((n) => hasAncestor(el, (p) => p === n))) ordinal++;
    ordinalOf.set(el, ordinal);
  }
  const refInfo = new Map();
  for (const r of refs) {
    const href = attr(r.a, 'href') || '';
    const id = href.includes('#') ? href.split('#')[1] : null;
    if (id) refInfo.set(id, { text: norm(r.a.textContent || ''), ordinal: ordinalOf.get(r.el) ?? 0 });
  }

  const notesOnly = isNotesOnly(body, referencedIds);

  // notas de capítulo: extraídas antes de remover as chamadas
  const extracted = [];
  if (!notesOnly) {
    for (const el of noteEls) {
      for (const d of all(el)) if (hasAny(semantics(d), BACKLINK)) d.remove();
      const raw = textOf(el);
      if (!raw) continue;
      const ref = refInfo.get(attr(el, 'id'));
      const { marker, text } = noteMarker(raw, ref ? ref.text : '');
      extracted.push({ el, marker, text, ordinal: ref ? ref.ordinal : (ordinalOf.get(el) ?? 0) });
    }
  }

  for (const r of refs) {
    if (r.el.parentNode) {
      report.noteRefs++;
      r.el.remove();
    }
  }
  if (!notesOnly) {
    for (const n of extracted) {
      notes.push({ marker: n.marker, text: n.text, page: pageOf(n.ordinal) });
      report.notesMoved++;
    }
    for (const el of noteEls) el.remove();
    for (const s of sections) if (s.parentNode && !textOf(s)) s.remove();
  } else {
    for (const d of all(body)) if (hasAny(semantics(d), BACKLINK)) d.remove();
  }

  let sawHeading = false;
  for (const el of all(body)) {
    const tag = tagOf(el);
    const isLeaf = BLOCK_TAGS.has(tag) || (notesOnly && tag === 'aside');
    if (!isLeaf || hasBlockDescendant(el)) continue;
    const text = norm(el.textContent || '');
    if (!text) continue;
    const page = pageOf(ordinalOf.get(el) ?? 0);
    if (/^h[1-3]$/.test(tag)) {
      sawHeading = true;
      blocks.push({ type: 'h', level: tag === 'h3' ? 2 : 1, text, page });
    } else {
      blocks.push({ type: 'p', text, page });
    }
  }
  if (notesOnly && blocks.length && !sawHeading) {
    blocks.unshift({ type: 'h', level: 1, text: 'Notas', page: pageOf(0) });
  }
  return { blocks, notes };
}

// ---------- API ----------

/**
 * Limpa um EPUB e devolve o livro.
 * @param {Uint8Array} data
 * @param {{JSZip:any, parseHtml:(xml:string)=>Document}} deps
 * @returns {Promise<{book:import('../model.js').Book, report:import('../model.js').Report}>}
 */
export async function cleanEpub(data, { JSZip, parseHtml }) {
  let zip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new BookError(MSG_CORRUPT);
  }
  let pkg;
  try {
    pkg = await readPackage(zip, parseHtml);
  } catch (e) {
    if (e instanceof BookError) throw e;
    throw new BookError(MSG_CORRUPT);
  }
  await assertNoDrm(zip, parseHtml, pkg.spine);

  const report = emptyReport();
  const docs = [];
  for (const item of pkg.spine) {
    if (!item.linear) continue;
    if (item.nav) {
      report.frontBackPages++;
      continue;
    }
    if (!/html/.test(item.type)) continue;
    const file = zip.file(item.path);
    if (!file) continue;
    docs.push(parseHtml(await file.async('string')));
  }

  const referencedIds = new Set();
  for (const doc of docs) {
    for (const a of byLocalName(doc, 'a')) {
      const href = attr(a, 'href') || '';
      if (href.includes('#')) referencedIds.add(href.split('#')[1]);
    }
  }

  const blocks = [];
  const notes = [];
  docs.forEach((doc, i) => {
    const part = cleanDocument(doc, i + 1, referencedIds, report);
    blocks.push(...part.blocks);
    notes.push(...part.notes);
  });
  const book = assembleBook({ title: pkg.title || 'Sem título', blocks, notes });
  return { book, report };
}
