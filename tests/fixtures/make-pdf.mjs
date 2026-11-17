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

// ---------- PDF de demonstração (o mesmo do teste de pipeline) ----------

const HEADER = 'Cabeçalho do Livro Exemplo';
const PAGE_COUNT = 14; // com 12 páginas o sumário da p.3 (índice 2) fica fora dos 15% iniciais (1.8) de classifyPage

// Linhas de corpo (11pt, passo de 14pt) a partir de y = 80, com texto distinto por página.
function body(n, count, extra = {}) {
  const words = ['sol', 'mar', 'rio', 'vento', 'chuva', 'terra', 'fogo', 'lua'];
  return Array.from({ length: count }, (_, i) => ({
    text: `Linha ${i + 1} da pagina ${n} fala de ${words[(n + i) % 8]} e ${words[(n * 3 + i) % 8]} sem parar agora.`,
    y: (extra.y0 ?? 80) + i * 14,
    size: 11,
  }));
}
function chrome(n) {
  return [{ text: HEADER, y: 30, size: 9, x: 120 }, { text: String(n), y: 570, size: 10, x: 205 }];
}

export function demoSpec() {
  const pages = [];
  for (let n = 1; n <= PAGE_COUNT; n++) {
    let lines;
    if (n === 2) {
      lines = [
        { text: 'ISBN 978-85-0000-000-0', y: 100, size: 11 },
        { text: 'CDD 869.3', y: 120, size: 11 },
        { text: 'Primeira edição, editora exemplo', y: 140, size: 11 },
      ];
    } else if (n === 3) {
      lines = [
        { text: 'Sumário', y: 80, size: 11 },
        { text: 'Capítulo 1 ........ 4', y: 110, size: 11 },
        { text: 'Capítulo 2 ........ 8', y: 124, size: 11 },
        { text: 'Posfácio ........ 11', y: 138, size: 11 },
      ];
    } else if (n === 4 || n === 8) {
      lines = [{ text: `Capítulo ${n === 4 ? 1 : 2}`, y: 80, size: 20 }, ...body(n, 8, { y0: 120 })];
    } else if (n === 6) {
      lines = [
        ...body(n, 6),
        { text: 'Aqui há uma chamada de nota no fim desta linha', y: 164, size: 11 },
        { text: '1', x: 40 + 46 * 5.5, y: 161, size: 6 },
        { text: 'e o parágrafo seguinte começa agora e segue até a próxima página, onde', y: 178, size: 11 },
        { text: 'a frase atravessa a fronteira entre as páginas e só termina aqui', y: 192, size: 11 },
        { text: '1 Nota de rodapé sobre a chamada acima.', y: 500, size: 8 },
      ];
    } else if (n === 7) {
      lines = [{ text: 'no começo da página sete.', y: 80, size: 11 }, ...body(n, 6, { y0: 120 })];
    } else lines = body(n, 8);
    pages.push({ lines: [...chrome(n), ...lines] });
  }
  return {
    title: 'Livro Exemplo',
    pages,
    outline: [{ title: 'Capítulo 1', page: 4 }, { title: 'Capítulo 2', page: 8 }],
  };
}

/** PDF longo (400 páginas de texto repetido, com cabeçalho e número), para testar desempenho. */
export function grandeSpec(pageCount = 400) {
  const pages = [];
  for (let n = 1; n <= pageCount; n++) {
    const lines = [{ text: 'Livro Grande de Teste', y: 30, size: 9, x: 140 }, { text: String(n), y: 570, size: 10, x: 205 }];
    for (let i = 0; i < 34; i++) {
      lines.push({ text: `Esta é a linha ${i + 1} da página ${n}, um texto repetido para medir o tempo.`, y: 70 + i * 14, size: 11 });
    }
    pages.push({ lines });
  }
  return { title: 'Livro Grande', pages };
}

/**
 * PDF "escaneado": renderiza páginas de um PDF para PNG (pdf.js + @napi-rs/canvas, 2×)
 * e monta um PDF só de imagens, sem camada de texto.
 * @param {Uint8Array} source
 * @param {number[]} pageNumbers 1-based
 * @returns {Promise<Uint8Array>}
 */
export async function makeScannedPdf(source, pageNumbers, scale = 2) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { fileURLToPath } = await import('node:url');
  // Sem os dados das fontes padrão o pdf.js no Node desenha páginas em branco.
  const standardFontDataUrl = fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url));
  const src = await pdfjs.getDocument({ data: source, standardFontDataUrl, verbosity: pdfjs.VerbosityLevel.ERRORS }).promise;
  const out = await PDFDocument.create();
  for (const n of pageNumbers) {
    const page = await src.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale });
    const { canvas, context } = src.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const png = await out.embedPng(canvas.toBuffer('image/png'));
    out.addPage([base.width, base.height]).drawImage(png, { x: 0, y: 0, width: base.width, height: base.height });
    page.cleanup();
  }
  await src.destroy();
  return out.save();
}

// CLI: node tests/fixtures/make-pdf.mjs --demo saida.pdf | --grande saida.pdf | --escaneado saida.pdf
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const [mode, out] = process.argv.slice(2);
  const builders = {
    '--demo': () => makePdf(demoSpec()),
    '--grande': () => makePdf(grandeSpec()),
    // Páginas 5–7 do demo: cabeçalho, número de página, nota de rodapé e frase que cruza a página.
    '--escaneado': async () => makeScannedPdf(await makePdf(demoSpec()), [5, 6, 7]),
  };
  if (!builders[mode] || !out) {
    console.error('Uso: node tests/fixtures/make-pdf.mjs --demo|--grande|--escaneado <saida.pdf>');
    process.exit(1);
  }
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, await builders[mode]());
  console.log(`Gerado ${out}`);
}
