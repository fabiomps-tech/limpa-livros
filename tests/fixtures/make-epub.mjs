import JSZip from 'jszip';

const NS = 'xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"';
const page = (body, bodyAttrs = '') =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<html ${NS}><head><title>x</title></head><body${bodyAttrs}>${body}</body></html>`;

/**
 * Monta um EPUB mínimo em memória.
 * chapters[i].xhtml é o conteúdo do <body>; endnotesFile é o body de um arquivo só de notas no fim do spine.
 * guide: referências do <guide> do OPF, ex.: [{type:'toc', href:'ch1.xhtml#inicio'}].
 * @param {{title?:string, chapters:{xhtml:string}[], nav?:boolean, endnotesFile?:string, encrypted?:boolean, guide?:{type:string, href:string}[]}} opts
 * @returns {Promise<Uint8Array>}
 */
export async function makeEpub({ title = 'Livro de Teste', chapters, nav = false, endnotesFile, encrypted = false, guide = [] }) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  const files = chapters.map((c, i) => ({ id: `c${i + 1}`, href: `ch${i + 1}.xhtml`, body: c.xhtml, linear: c.linear }));
  if (endnotesFile !== undefined) files.push({ id: 'en', href: 'notes.xhtml', body: endnotesFile });
  let manifest = files.map((f) => `<item id="${f.id}" href="${f.href}" media-type="application/xhtml+xml"/>`).join('');
  let spine = files.map((f) => `<itemref idref="${f.id}"${f.linear === false ? ' linear="no"' : ''}/>`).join('');
  if (nav) {
    manifest += '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>';
    spine = '<itemref idref="nav"/>' + spine;
    zip.file('OEBPS/nav.xhtml', page('<nav epub:type="toc"><ol><li><a href="ch1.xhtml">Sumário fantasma</a></li></ol></nav>'));
  }
  manifest += '<item id="img" href="img.png" media-type="image/png"/>';
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></metadata><manifest>${manifest}</manifest><spine>${spine}</spine>${guideXml(guide)}</package>`,
  );
  for (const f of files) zip.file(`OEBPS/${f.href}`, page(f.body, chapters[files.indexOf(f)]?.bodyAttrs ?? ''));
  if (encrypted) zip.file('META-INF/encryption.xml', encryptionXml('OEBPS/ch1.xhtml'));
  return zip.generateAsync({ type: 'uint8array' });
}

function guideXml(guide) {
  if (!guide.length) return '';
  return `<guide>${guide.map((g) => `<reference type="${g.type}" title="x" href="${g.href}"/>`).join('')}</guide>`;
}

function encryptionXml(uri) {
  return `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData></enc:EncryptedData></encryption>`;
}

/** EPUB cujo encryption.xml só ofusca uma fonte (não é DRM de conteúdo). */
export async function makeEpubWithFontObfuscation(opts) {
  const zip = await JSZip.loadAsync(await makeEpub(opts));
  zip.file('META-INF/encryption.xml', encryptionXml('OEBPS/font.otf'));
  return zip.generateAsync({ type: 'uint8array' });
}

/** EPUB de demonstração com o mesmo conteúdo do PDF do teste de pipeline. */
export function demoEpubSpec() {
  const words = ['sol', 'mar', 'rio', 'vento', 'chuva', 'terra', 'fogo', 'lua'];
  const para = (n, i) =>
    `<p>Linha ${i + 1} da pagina ${n} fala de ${words[(n + i) % 8]} e ${words[(n * 3 + i) % 8]} sem parar agora.</p>`;
  const paras = (n, count) => Array.from({ length: count }, (_, i) => para(n, i)).join('');
  const pb = (n) => `<span epub:type="pagebreak" title="${n}"/>`;
  const cap1 =
    `<h1>Capítulo 1</h1>${pb(4)}${paras(4, 8)}${pb(5)}${paras(5, 8)}${pb(6)}${paras(6, 6)}` +
    '<p>Aqui há uma chamada de nota no fim desta linha<a epub:type="noteref" href="#n1">1</a> ' +
    'e o parágrafo seguinte começa agora e segue até a próxima página, onde a frase atravessa a fronteira ' +
    `entre as páginas e só termina aqui${pb(7)} no começo da página sete.</p>${paras(7, 6)}` +
    '<aside epub:type="footnote" id="n1"><p>1 Nota de rodapé sobre a chamada acima.</p></aside>';
  const cap2 = `<h1>Capítulo 2</h1>${[8, 9, 10, 11, 12, 13, 14].map((n) => pb(n) + paras(n, 8)).join('')}`;
  return {
    title: 'Livro Exemplo',
    nav: true,
    chapters: [
      { xhtml: '<p>ISBN 978-85-0000-000-0</p><p>CDD 869.3</p><p>Primeira edição, editora exemplo</p>', bodyAttrs: ' epub:type="copyright-page"' },
      { xhtml: cap1 },
      { xhtml: cap2 },
    ],
  };
}

// CLI: node tests/fixtures/make-epub.mjs --demo saida.epub
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const [mode, out] = process.argv.slice(2);
  if (mode !== '--demo' || !out) {
    console.error('Uso: node tests/fixtures/make-epub.mjs --demo <saida.epub>');
    process.exit(1);
  }
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, await makeEpub(demoEpubSpec()));
  console.log(`Gerado ${out}`);
}
