import JSZip from 'jszip';

const NS = 'xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"';
const page = (body) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<html ${NS}><head><title>x</title></head><body>${body}</body></html>`;

/**
 * Monta um EPUB mínimo em memória.
 * chapters[i].xhtml é o conteúdo do <body>; endnotesFile é o body de um arquivo só de notas no fim do spine.
 * @param {{title?:string, chapters:{xhtml:string}[], nav?:boolean, endnotesFile?:string, encrypted?:boolean}} opts
 * @returns {Promise<Uint8Array>}
 */
export async function makeEpub({ title = 'Livro de Teste', chapters, nav = false, endnotesFile, encrypted = false }) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  const files = chapters.map((c, i) => ({ id: `c${i + 1}`, href: `ch${i + 1}.xhtml`, body: c.xhtml }));
  if (endnotesFile !== undefined) files.push({ id: 'en', href: 'notes.xhtml', body: endnotesFile });
  let manifest = files.map((f) => `<item id="${f.id}" href="${f.href}" media-type="application/xhtml+xml"/>`).join('');
  let spine = files.map((f) => `<itemref idref="${f.id}"/>`).join('');
  if (nav) {
    manifest += '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>';
    spine = '<itemref idref="nav"/>' + spine;
    zip.file('OEBPS/nav.xhtml', page('<nav epub:type="toc"><ol><li><a href="ch1.xhtml">Sumário fantasma</a></li></ol></nav>'));
  }
  manifest += '<item id="img" href="img.png" media-type="image/png"/>';
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`,
  );
  for (const f of files) zip.file(`OEBPS/${f.href}`, page(f.body));
  if (encrypted) zip.file('META-INF/encryption.xml', encryptionXml('OEBPS/ch1.xhtml'));
  return zip.generateAsync({ type: 'uint8array' });
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
