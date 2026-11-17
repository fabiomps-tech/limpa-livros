import { PDFDocument, StandardFonts, PDFName, PDFString } from 'pdf-lib';

const PNG_1PX = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

/**
 * Gera um PDF para testes. y é medido do topo; página A5 (420x595); Helvetica.
 * @param {{pages: {lines: {text:string, x?:number, y:number, size?:number, font?:string}[], image?:boolean}[],
 *          outline?: {title:string, page:number}[], title?: string}} spec
 * @returns {Promise<Uint8Array>}
 */
export async function makePdf(spec) {
  const W = 420, H = 595;
  const doc = await PDFDocument.create();
  if (spec.title) doc.setTitle(spec.title);
  const fonts = {
    Helvetica: await doc.embedFont(StandardFonts.Helvetica),
    'Helvetica-Bold': await doc.embedFont(StandardFonts.HelveticaBold),
    'Times-Roman': await doc.embedFont(StandardFonts.TimesRoman),
  };
  const pages = [];
  for (const p of spec.pages) {
    const page = doc.addPage([W, H]);
    pages.push(page);
    for (const l of p.lines) {
      const font = fonts[l.font ?? 'Helvetica'] ?? fonts.Helvetica;
      page.drawText(l.text, { x: l.x ?? 40, y: H - l.y, size: l.size ?? 12, font });
    }
    if (p.image) {
      const img = await doc.embedPng(PNG_1PX);
      page.drawImage(img, { x: 40, y: 100, width: 100, height: 100 });
    }
  }
  if (spec.outline?.length) addOutline(doc, pages, spec.outline);
  return await doc.save();
}

function addOutline(doc, pages, outline) {
  const ctx = doc.context;
  const rootRef = ctx.nextRef();
  const refs = outline.map(() => ctx.nextRef());
  outline.forEach((o, i) => {
    const dict = ctx.obj({
      Title: PDFString.of(o.title),
      Parent: rootRef,
      Dest: [pages[o.page - 1].ref, PDFName.of('Fit')],
      ...(i > 0 ? { Prev: refs[i - 1] } : {}),
      ...(i < outline.length - 1 ? { Next: refs[i + 1] } : {}),
    });
    ctx.assign(refs[i], dict);
  });
  ctx.assign(rootRef, ctx.obj({
    Type: 'Outlines', First: refs[0], Last: refs[refs.length - 1], Count: outline.length,
  }));
  doc.catalog.set(PDFName.of('Outlines'), rootRef);
}
