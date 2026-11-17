/** @typedef {{str:string, x:number, y:number, width:number, size:number, font:string}} TextItem  y medido do TOPO da página para baixo */
/** @typedef {{text:string, x:number, y:number, width:number, size:number, items:TextItem[]}} Line */
/** @typedef {{number:number, width:number, height:number, lines:Line[]}} Page */
/** @typedef {{title:string, page:number, level:number}} OutlineEntry  página 1-based */
/** @typedef {{type:'p'|'h', level?:number, text:string, page:number, size?:number, lineCount?:number}} Block */
/** @typedef {{marker:string, text:string, page:number}} Note */
/** @typedef {{heading:string|null, level:number, paragraphs:string[], notes:Note[]}} Chapter */
/** @typedef {{title:string, lang:string, chapters:Chapter[]}} Book */
/** @typedef {{headers:number, pageNumbers:number, notesMoved:number, noteRefs:number, frontBackPages:number, images:number}} Report */

/** Erro com mensagem já em português, exibida ao usuário. */
export class BookError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BookError';
  }
}

/** @returns {Report} */
export function emptyReport() {
  return { headers: 0, pageNumbers: 0, notesMoved: 0, noteRefs: 0, frontBackPages: 0, images: 0 };
}
