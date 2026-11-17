# Limpa Livros: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** construir uma página web estática que limpa PDFs (com texto ou escaneados) e EPUBs no navegador e mostra o livro como texto contínuo, próprio para o "Ler em voz alta" do Edge no PC e no Android.

**Arquitetura:** o núcleo de limpeza é feito de funções JS puras que operam sobre um modelo neutro de páginas e linhas (`Page`/`Line`). Elas são testadas no Node com `node --test`. Três adaptadores alimentam esse núcleo: PDF via pdf.js, OCR via tesseract.js e EPUB via JSZip. A interface roda o processamento num Web Worker, guarda os livros no IndexedDB e funciona como PWA offline.

**Stack:** JavaScript ES modules, sem build. `pdfjs-dist` 4.x, `jszip` 3.x e `tesseract.js` 5.x, copiados para `vendor/`. Para testes: Node 20+ (instalado: v26), `node --test`, `pdf-lib` (gera PDFs de teste), `linkedom` (DOM no Node) e `fake-indexeddb`.

**Spec:** `docs/2026-11-17-limpa-livros-design.md` (leia junto com este plano).

## Restrições globais

- Todo processamento ocorre no navegador; nenhuma requisição de rede envia o conteúdo do livro.
- Bibliotecas servidas de `vendor/` (nada de CDN em tempo de execução).
- Textos da interface e mensagens de erro em português do Brasil.
- Na dúvida, manter o texto: um falso positivo (apagar texto real) é pior que deixar sujeira.
- O HTML do livro deve ter `lang` (`pt-BR` padrão, `en` quando detectado) e a tela de leitura só pode ter o livro dentro de `<main>`.
- Sai: cabeçalhos/rodapés repetidos, números de página, chamadas de nota, sumário, índice remissivo, ficha catalográfica, imagens, tabelas. Fica: dedicatória, prefácio, apresentação, bibliografia.
- Notas de rodapé → seção "Notas" no fim do capítulo, com o marcador original. Seção de notas já existente no fim fica onde está.
- Diretório do projeto: `C:\Users\Acer\Downloads\limpa-livros\` (repositório git criado na Tarefa 1).

## Foco de revisão

1. **Página de abertura de capítulo sem cabeçalho:** a primeira linha do corpo, no topo da página, não pode ser removida como cabeçalho → teste na Tarefa 2.
2. **Linha de corpo repetida no topo de várias páginas** (separador `* * *`, fala `— Sim.`) só sai se estiver na faixa e se repetir de fato em ≥30% das páginas; separadores de cena com tamanho de corpo ficam → teste na Tarefa 2.
3. **Livro grande (300+ páginas) no celular:** extrair página por página e liberar memória (`page.cleanup()`), sem guardar o PDF renderizado → passo de verificação na Tarefa 9.
4. **Arquivo inválido, corrompido ou com senha/DRM:** mensagem amigável em português, não travar → testes nas Tarefas 1 e 7.
5. **Texto com `<`, `&` ou aspas:** sempre escapar no HTML gerado → teste na Tarefa 6.

---

## Modelo de dados (compartilhado; definido na Tarefa 1 em `src/model.js`, via JSDoc)

```js
/** @typedef {{str:string, x:number, y:number, width:number, size:number, font:string}} TextItem  // y = topo da página para baixo (origem no alto) */
/** @typedef {{text:string, x:number, y:number, width:number, size:number, items:TextItem[]}} Line */
/** @typedef {{number:number, width:number, height:number, lines:Line[]}} Page */
/** @typedef {{title:string, page:number, level:number}} OutlineEntry  // page 1-based */
/** @typedef {{type:'p'|'h', level?:number, text:string, page:number, size?:number, lineCount?:number}} Block  // size = tamanho médio das linhas; lineCount = nº de linhas */
/** @typedef {{marker:string, text:string, page:number}} Note */
/** @typedef {{heading:string|null, level:number, paragraphs:string[], notes:Note[]}} Chapter */
/** @typedef {{title:string, lang:string, chapters:Chapter[]}} Book */
/** @typedef {{headers:number, pageNumbers:number, notesMoved:number, noteRefs:number, frontBackPages:number, images:number}} Report */
export class BookError extends Error {}   // mensagem já em português, mostrada ao usuário
export function emptyReport() /* → Report com zeros */
```

## Estrutura de arquivos

```
limpa-livros/
  index.html  style.css  manifest.webmanifest  sw.js  icons/
  src/
    model.js
    pdf/lines.js       agrupar TextItem em Line
    pdf/extract.js     pdf.js → Page[] + outline + título
    clean/pagenum.js   reconhecer número de página
    clean/margins.js   cabeçalhos/rodapés/números
    clean/notes.js     notas de rodapé e chamadas
    clean/columns.js   ordem de leitura por colunas
    clean/paragraphs.js linhas → Block[]
    clean/headings.js  títulos
    clean/frontback.js sumário/índice/ficha
    lang.js            detecção de idioma
    assemble.js        Block[] + notas → Book; Book → HTML
    pdf/pipeline.js    cleanPages(): orquestra o núcleo
    epub/epub.js       EPUB → Book
    ocr/ocr.js         PDF escaneado → Page[] (navegador)
    storage/library.js IndexedDB
    worker.js          Web Worker
    app.js             interface
  vendor/              cópias das libs (gerado por scripts/vendor.mjs)
  scripts/vendor.mjs
  tests/  fixtures/make-pdf.mjs  fixtures/make-epub.mjs  *.test.mjs
```

---

### Tarefa 1: Projeto, modelo e extração de PDF

**Arquivos:**
- Criar: `package.json`, `.gitignore` (node_modules), `scripts/vendor.mjs`, `src/model.js`, `src/pdf/lines.js`, `src/pdf/extract.js`, `tests/fixtures/make-pdf.mjs`, `tests/lines.test.mjs`, `tests/extract.test.mjs`

**Interfaces:**
- Produz: o modelo acima; `groupItemsIntoLines(items: TextItem[]): Line[]`; `extractPdf(data: Uint8Array, pdfjs, onProgress?: (done:number,total:number)=>void): Promise<{pages: Page[], outline: OutlineEntry[], title: string|null, imageCount: number}>`; `makePdf(spec): Promise<Uint8Array>`, usado em todos os testes de PDF.

- [ ] **Passo 1: Preparar o projeto.** Rode `git init` na pasta (os docs já existentes entram no primeiro commit). `package.json` com `"type":"module"`, script `"test":"node --test tests/"`, script `"vendor":"node scripts/vendor.mjs"`, dependências `pdfjs-dist@^4`, `jszip@^3`, `tesseract.js@^5` e devDependências `pdf-lib`, `linkedom`, `fake-indexeddb`. Rode `npm install`. `scripts/vendor.mjs` copia para `vendor/`: `pdf.min.mjs`, `pdf.worker.min.mjs`, `jszip.min.js`, `tesseract.min.js`, o worker e o core wasm do tesseract. `vendor/` é versionado, para o site funcionar sem npm.
- [ ] **Passo 2: Criar o gerador de fixtures.** `tests/fixtures/make-pdf.mjs` exporta `makePdf({pages: [{lines: [{text, x?, y, size?, font?}], image?: boolean}], outline?: [{title, page}], title?})`. Ele usa pdf-lib, Helvetica, y medido do topo e página A5 (420×595).
- [ ] **Passo 3: Escrever testes que falham.**
  - `lines.test.mjs`:
    - itens com a mesma linha de base (diferença ≤ 0.3×size) viram uma `Line`, ordenados por x;
    - o texto é unido com espaço quando o vão é > 0.15×size e sem espaço quando é menor;
    - itens com y diferente viram linhas diferentes, ordenadas por y;
    - um item sobrescrito (menor e elevado em até 0.5×size) fica na mesma linha do texto ao lado.
  - `extract.test.mjs`:
    - PDF de 2 páginas → `pages.length === 2`, `pages[0].lines[0].text === 'Título do livro'`, `size` ≈ 12 ±0.5, `y` crescente de cima para baixo;
    - outline `[{title:'Capítulo 1', page:2}]` → `outline[0]` igual a `{title:'Capítulo 1', page:2, level:1}`;
    - `title` igual ao dos metadados;
    - bytes inválidos (`new Uint8Array([1,2,3])`) → rejeita com `BookError` e mensagem `'Não foi possível abrir este PDF. O arquivo pode estar corrompido.'`;
    - PDF com senha → `BookError` com `'Este PDF está protegido por senha ou DRM e não pode ser lido.'` (pdf-lib não criptografa: passe um `pdfjs` falso cujo `getDocument().promise` rejeita com um erro `{name:'PasswordException'}`).
- [ ] **Passo 4: Rodar `npm test`.** Esperado: FAIL (módulos não existem).
- [ ] **Passo 5: Implementar `src/model.js`, `src/pdf/lines.js` e `src/pdf/extract.js`.** Em `extract.js`, `size = Math.hypot(t[2], t[3])` e `y = viewport.height - t[5]` (`t` = `item.transform`). Processe página por página e chame `page.cleanup()` após cada uma. Conte imagens pelos operadores `paintImageXObject`/`paintInlineImageXObject` de `getOperatorList()`. No Node, os testes usam `pdfjs-dist/legacy/build/pdf.mjs`; o navegador usa o arquivo de `vendor/`, injetado como parâmetro `pdfjs`.
- [ ] **Passo 6: Rodar `npm test`.** Esperado: PASS.
- [ ] **Passo 7: Commit.** `git add -A && git commit -m "feat: extração de PDF para modelo de páginas e linhas"`

### Tarefa 2: Números de página, cabeçalhos e rodapés

**Arquivos:** criar `src/clean/pagenum.js`, `src/clean/margins.js`, `tests/margins.test.mjs`

**Interfaces:**
- Consome: `Page`, `Report`.
- Produz: `isPageNumberText(s: string): boolean`; `removeMargins(pages: Page[], report: Report): Page[]` (novo array; não altera a entrada).

Regras:
- Faixas: 8% de cima e 8% de baixo da altura da página.
- Chave de repetição: texto em minúsculas, sem espaços duplicados, com cada sequência de dígitos e cada número romano isolado trocados por `#`.
- Repetida: aparece na mesma faixa em ≥30% das páginas e em pelo menos 3 páginas, contando pares e ímpares separadamente e também juntas.
- Uma linha só sai se estiver na faixa.

- [ ] **Passo 1: Escrever testes que falham.**
  - `isPageNumberText`: true para `'12'`, `'xii'`, `'XIV'`, `'— 12 —'`, `'- 7 -'`, `'Página 12'`, `'p. 12'`, `'12 | O Livro'`, `'O Livro | 12'`; false para `'12 de outubro de 1990'`, `'Capítulo 12'`, `'Eu'`. `'I'` sozinho → true (romano isolado; só é removido se estiver na faixa).
  - `removeMargins` com 10 páginas:
    - cabeçalho `'O LIVRO X'` nas pares, `'Capítulo 1'` nas ímpares e número no rodapé → tudo removido, e `report.headers === 10`, `report.pageNumbers === 10`;
    - **(Foco 1)** a página 1 começa com `'Era uma vez um homem'` no topo e não tem cabeçalho → essa linha permanece;
    - **(Foco 2)** `'* * *'` no topo de 2 das 10 páginas → permanece; `'— Sim.'` no meio da página em 5 páginas → permanece, porque está fora da faixa;
    - um número isolado no meio da página (linha de tabela) → permanece.
- [ ] **Passo 2: Rodar `npm test`.** Esperado: FAIL.
- [ ] **Passo 3: Implementar as duas funções.**
- [ ] **Passo 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Passo 5: Commit.** `feat: remoção de cabeçalhos, rodapés e números de página`

### Tarefa 3: Notas de rodapé e chamadas de nota

**Arquivos:** criar `src/clean/notes.js`, `tests/notes.test.mjs`

**Interfaces:**
- Consome: `Page`, `Line`, `Note`, `Report`.
- Produz:
  - `bodyFontSize(pages: Page[]): number`: moda dos tamanhos arredondados a 0.5, ponderada por caracteres;
  - `extractFootnotes(page: Page, bodySize: number, report: Report): {page: Page, notes: Note[]}`;
  - `stripNoteRefs(page: Page, bodySize: number, report: Report): Page`.

Regras:
- Nota de rodapé: um bloco contíguo de linhas na metade de baixo da página, todas com `size ≤ 0.9×bodySize`, cuja primeira linha começa com marcador (`^\s*(\d{1,3}|[*†‡§]+|\[\d+\])[\s.)]`). Linhas seguintes sem marcador continuam a nota anterior.
- Chamada de nota: item com `size ≤ 0.8×bodySize`, só dígitos, `*†‡` ou `[n]`, com base elevada em ≥0.2×bodySize em relação à linha, ou entre colchetes `[n]` colado à palavra anterior. Sai do texto da linha.

- [ ] **Passo 1: Escrever testes que falham.**
  - página com corpo 11pt e duas notas 9pt (`'1 Ver Freud, 1920.'` e `'2 Idem.'`, a segunda com uma linha de continuação) → `notes` igual a `[{marker:'1', text:'Ver Freud, 1920.', page:N}, {marker:'2', text:'Idem. continuação', page:N}]` e linhas removidas da página;
  - linha `'como disse Freud¹ ontem'` (item `'1'` em 7pt, elevado) → `'como disse Freud ontem'`, `report.noteRefs === 1`;
  - `'em 1920 ele'`, tudo em 11pt → inalterado;
  - uma citação recuada em 10pt no meio da página, sem marcador → não é nota;
  - `bodyFontSize` com 90% do texto em 11 → 11.
- [ ] **Passo 2: Rodar `npm test`.** Esperado: FAIL.
- [ ] **Passo 3: Implementar.**
- [ ] **Passo 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Passo 5: Commit.** `feat: notas de rodapé e chamadas de nota`

### Tarefa 4: Colunas e parágrafos

**Arquivos:** criar `src/clean/columns.js`, `src/clean/paragraphs.js`, `tests/paragraphs.test.mjs`

**Interfaces:**
- Produz:
  - `orderByColumns(page: Page): Line[]`;
  - `buildParagraphs(pages: Page[], bodySize: number): Block[]`, só com `type:'p'` (títulos vêm na Tarefa 5), `page` da primeira linha, `size` médio e `lineCount`. Uma linha com tamanho ≥1.15×bodySize sempre forma bloco próprio (candidata a título).

Regras:
- **Colunas:** se ≥60% das linhas da página têm largura < 55% da largura útil e se agrupam em duas faixas de x separadas por um vão, ler a coluna esquerda inteira e depois a direita. Caso contrário, ordenar por y.
- **Novo parágrafo:** quando o vão vertical é > 1.5× o vão mediano de linhas do corpo, ou quando o x inicial está recuado em ≥1.5×bodySize em relação à margem esquerda modal.
- **Hifenização:** se a linha termina em `-` (ou `‐`, `­`) precedido de letra e a próxima começa com minúscula, remover o hífen e juntar sem espaço. Hífen de palavra composta que já começa a próxima linha com maiúscula fica, sem juntar.
- **Virada de página:** se o último bloco da página não termina em `[.!?…:»"”)]` (ignorando espaço final), ele continua no primeiro bloco da página seguinte, mesmo com recuo.

- [ ] **Passo 1: Escrever testes que falham.**
  - `'pro-'` / `'cesso de'` → `'processo de'`;
  - `'guarda-'` / `'Chuva'` → mantém `'guarda- Chuva'` (aceito, para não arriscar);
  - parágrafo que termina em `'e então ele'` na página 3 e continua com `'saiu.'` na página 4 → um único bloco `'e então ele saiu.'`;
  - parágrafo terminado em `'.'` na página 3 e outro recuado na 4 → dois blocos;
  - página de duas colunas (esquerda `'A1'`, `'A2'`; direita `'B1'`, `'B2'`, intercaladas em y) → ordem `A1 A2 B1 B2`;
  - recuo de primeira linha separa parágrafos.
- [ ] **Passo 2: Rodar `npm test`.** Esperado: FAIL.
- [ ] **Passo 3: Implementar.**
- [ ] **Passo 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Passo 5: Commit.** `feat: ordem de colunas e montagem de parágrafos`

### Tarefa 5: Títulos e partes de fora do texto

**Arquivos:** criar `src/clean/headings.js`, `src/clean/frontback.js`, `tests/headings.test.mjs`, `tests/frontback.test.mjs`

**Interfaces:**
- Produz:
  - `classifyPage(page: Page, pageIndex: number, pageCount: number): 'toc'|'index'|'colophon'|null`;
  - `markHeadings(blocks: Block[], pages: Page[], outline: OutlineEntry[], bodySize: number): Block[]`.

Regras de `classifyPage`:
- `'toc'`: página nos primeiros 15% do livro, com ≥60% das linhas não vazias terminando em número de página (`\d+$` ou romano), opcionalmente com pontilhado, ou com uma linha `'Sumário'`/`'Índice'`/`'Contents'` no topo seguida de linhas assim. Uma página que continua o sumário sem esse título também conta, se vier logo depois de uma `'toc'` e tiver o mesmo padrão.
- `'index'`: página nos últimos 20%, com ≥60% das linhas no formato `termo, 12, 45-47`. A primeira página do índice tem título `'Índice remissivo'`/`'Índice onomástico'`/`'Index'`; páginas seguintes contam se tiverem o mesmo padrão.
- `'colophon'`: página com ≥2 destes marcadores: `ISBN`, `CDD`, `CDU`, `Dados Internacionais de Catalogação`, `©`, `Copyright`, `Todos os direitos reservados`, `Impresso no Brasil`.
- Nada mais é removido. A bibliografia não é classificada e fica.

Regras de `markHeadings`:
- Com outline: o primeiro bloco cuja página é `entry.page` e cujo texto normalizado começa com o título normalizado (ou o contém) vira `type:'h'`, com `level` do outline (máximo 2). Se não houver bloco assim, insere um bloco `h` com o título do outline antes do primeiro bloco daquela página.
- Sem outline: um bloco de uma ou duas linhas, com até 80 caracteres e `size ≥ 1.3×bodySize`, vira `h` nível 1; com `size ≥ 1.15×bodySize`, vira `h` nível 2. Use `block.size` e `block.lineCount`, produzidos pela Tarefa 4.

- [ ] **Passo 1: Escrever testes que falham.**
  - sumário com linhas `'1. Introdução ........ 9'` na página 3 de 100 → `'toc'`;
  - página 95 de 100 com `'Freud, 12, 45'` e similares → `'index'`;
  - página com `'ISBN 978-85-...'` e `'CDD 869.3'` → `'colophon'`;
  - página 98 com uma bibliografia (`'FREUD, S. O mal-estar. São Paulo: 2010.'`) → `null`;
  - página de corpo com uma frase terminada em `'12'` → `null`;
  - outline `[{title:'Capítulo 1', page:2, level:1}]` e bloco `'Capítulo 1'` na página 2 → esse bloco vira `{type:'h', level:1}`;
  - sem outline, bloco de 18pt com corpo 11pt → `h` nível 1.
- [ ] **Passo 2: Rodar `npm test`.** Esperado: FAIL.
- [ ] **Passo 3: Implementar.**
- [ ] **Passo 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Passo 5: Commit.** `feat: títulos e remoção de sumário, índice e ficha`

### Tarefa 6: Montagem do livro, idioma, HTML e pipeline de PDF

**Arquivos:** criar `src/lang.js`, `src/assemble.js`, `src/pdf/pipeline.js`, `tests/assemble.test.mjs`, `tests/pipeline.test.mjs`

**Interfaces:**
- Consome: tudo das Tarefas 1 a 5.
- Produz:
  - `detectLang(text: string): 'pt-BR'|'en'`: conta palavras funcionais (`de, que, não, uma, os, é` contra `the, and, of, to, is, that`); se houver empate ou texto curto, devolve `'pt-BR'`;
  - `assembleBook({title: string, blocks: Block[], notes: Note[]}): Book`: cada `h` abre um capítulo. Blocos antes do primeiro `h` formam um capítulo com `heading: null`. Cada nota vai para o capítulo que contém a sua página. Sem títulos, há um único capítulo. `lang` vem de `detectLang`;
  - `renderBookHtml(book: Book): string`: fragmento `<article lang="…"><h1>título</h1><section><h2>…</h2><p>…</p><aside class="notas"><h3>Notas</h3><ol><li><b>1</b> texto</li></ol></aside></section></article>`. Os capítulos com `level` 1 usam `h2` e os com `level` 2 usam `h3`. Todo texto é escapado (`& < > " '`);
  - `cleanPages({pages, outline, title, imageCount}: …, onProgress?): {book: Book, report: Report}`, nesta ordem: `classifyPage` (remove páginas e soma `frontBackPages`) → `removeMargins` → `bodyFontSize` → `extractFootnotes` e `stripNoteRefs` por página → `buildParagraphs` → `markHeadings` → `assembleBook`. `report.images = imageCount`.

- [ ] **Passo 1: Escrever testes que falham.**
  - **(Foco 5)** parágrafo `'a < b & "c"'` → o HTML contém `a &lt; b &amp; &quot;c&quot;`;
  - nota da página 5 com capítulos começando nas páginas 1 e 4 → vai para as notas do 2º capítulo;
  - `detectLang('the cat and the dog is in the house')` → `'en'`; um parágrafo em português → `'pt-BR'`;
  - pipeline de ponta a ponta com `makePdf` (12 páginas: ficha na p.2, sumário na p.3, cabeçalho e número em todas, uma nota de rodapé na p.6, um parágrafo cruzando as pp.6–7, outline com 2 capítulos):
    - o HTML não contém o cabeçalho, nem `'ISBN'`, nem as linhas do sumário;
    - contém o parágrafo cruzado inteiro e 2 `<h2>`;
    - a nota aparece dentro de `aside.notas` do capítulo certo;
    - `report.headers ≥ 10`, `report.frontBackPages === 2`, `report.notesMoved === 1`.
- [ ] **Passo 2: Rodar `npm test`.** Esperado: FAIL.
- [ ] **Passo 3: Implementar.**
- [ ] **Passo 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Passo 5: Commit.** `feat: montagem do livro e pipeline de PDF`

### Tarefa 7: EPUB

**Arquivos:** criar `src/epub/epub.js`, `tests/fixtures/make-epub.mjs`, `tests/epub.test.mjs`

**Interfaces:**
- Consome: `assembleBook`/`Book`, `Report`, `BookError`.
- Produz: `cleanEpub(data: Uint8Array, {JSZip, parseHtml: (xml:string)=>Document}): Promise<{book: Book, report: Report}>`. No navegador, `parseHtml` usa `new DOMParser().parseFromString(s, 'application/xhtml+xml')`, com recaída para `'text/html'` em caso de `parsererror`. Nos testes, usa `linkedom`.

Regras:
- `META-INF/container.xml` aponta para o `.opf`.
- Os itens do `spine` são lidos em ordem. Itens `linear="no"` e o documento `nav` são pulados.
- Removidos: `img`, `svg`, `figure`, `table`, `script`, `style` e elementos com `epub:type`/`role` em `pagebreak`, `doc-pagebreak`, `toc`, `doc-toc`, `index`, `doc-index`, `copyright-page`, `doc-colophon`.
- Chamadas de nota: `a` com `epub:type="noteref"`/`role="doc-noteref"`, ou `sup` cujo único filho é `a` com `href` contendo `#`. A chamada é removida.
- Notas `aside`/elementos com `footnote`/`endnote`/`doc-footnote`/`doc-endnote` *dentro* de um capítulo vão para `notes` daquele capítulo. As notas de um arquivo do spine composto só de notas (`doc-endnotes`/`endnotes`, ou ≥80% de `aside`s/`li`s com id referenciado) ficam como capítulo próprio.
- Os blocos são `h1`–`h3` (viram `type:'h'`, nível 1 para `h1`/`h2` e nível 2 para `h3`) e `p`/`li`/`blockquote` (viram `p`, com espaço normalizado).
- Título vem do `dc:title`.
- ZIP inválido → `BookError('Não foi possível abrir este EPUB. O arquivo pode estar corrompido.')`.
- `META-INF/encryption.xml` com conteúdo de spine criptografado → `BookError('Este EPUB está protegido por DRM e não pode ser lido.')`.

- [ ] **Passo 1: Criar o gerador de fixtures e escrever testes que falham.** `makeEpub({title, chapters:[{xhtml}], nav?:true, endnotesFile?:xhtml, encrypted?:true})` monta o EPUB com JSZip.
  - capítulos na ordem do spine;
  - `<span epub:type="pagebreak" title="12"/>` some;
  - `Freud<a epub:type="noteref" href="#n1">1</a>` vira `Freud`, e o `aside` `#n1` vai para `chapters[i].notes`;
  - a imagem some e `report.images` conta;
  - o `nav` não aparece no livro;
  - o arquivo de notas no fim vira o último capítulo;
  - **(Foco 4)** bytes inválidos → `BookError`; EPUB com `encryption.xml` → `BookError` de DRM.
- [ ] **Passo 2: Rodar `npm test`.** Esperado: FAIL.
- [ ] **Passo 3: Implementar.**
- [ ] **Passo 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Passo 5: Commit.** `feat: limpeza de EPUB`

### Tarefa 8: Biblioteca no IndexedDB

**Arquivos:** criar `src/storage/library.js`, `tests/library.test.mjs`

**Interfaces:**
- Produz, num banco `'limpa-livros'` v1 com store `books` (keyPath `id`):
  - `saveBook({title, lang, html, report, sourceName}): Promise<string>`: gera `id` com `crypto.randomUUID()` e guarda `createdAt` e `scrollY: 0`;
  - `listBooks(): Promise<{id,title,createdAt}[]>`, do mais recente para o mais antigo, sem o `html`;
  - `getBook(id): Promise<Record|null>`;
  - `deleteBook(id): Promise<void>`;
  - `saveScroll(id, y: number): Promise<void>`.
- Erro de cota (`QuotaExceededError`) → `BookError('Sem espaço para salvar este livro no aparelho. Apague algum livro da lista e tente de novo.')`.

- [ ] **Passo 1: Escrever testes que falham** (`import 'fake-indexeddb/auto'`):
  - salvar dois livros e `listBooks` → 2 itens em ordem decrescente e sem a chave `html`;
  - `getBook` devolve o `html`;
  - `saveScroll` persiste;
  - `deleteBook` remove;
  - `getBook` com id inexistente → `null`.
- [ ] **Passo 2: Rodar `npm test`.** Esperado: FAIL.
- [ ] **Passo 3: Implementar.**
- [ ] **Passo 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Passo 5: Commit.** `feat: biblioteca local no IndexedDB`

### Tarefa 9: Interface, worker e tela de leitura

**Arquivos:** criar `index.html`, `style.css`, `src/app.js`, `src/worker.js` e `.claude/launch.json` (servidor estático `npx http-server -p 8080 -c-1`, porta 8080)

**Interfaces:**
- Consome: `extractPdf`, `cleanPages`, `renderBookHtml`, `cleanEpub`, a biblioteca e `BookError`.
- Mensagens do worker (`type: 'module'`):
  - entrada: `{cmd:'clean', name:string, data:ArrayBuffer, scanned:boolean}`;
  - saída: `{type:'progress', done, total, stage:'Lendo páginas'|'Reconhecendo texto'|'Limpando'}`, `{type:'done', title, lang, html, report}` ou `{type:'error', message}`.
  - Uma exceção que não é `BookError` vira `'Algo deu errado ao processar este arquivo.'`.
  - O tipo é decidido pela extensão/MIME (`.pdf`, `.epub`); outro tipo → `'Escolha um arquivo PDF ou EPUB.'`.
  - No modo normal, se o PDF tiver < 50 caracteres por página em média, o worker responde `done` com `report.lowText = true`, e a interface sugere marcar "PDF escaneado".

Telas, com roteamento por hash: `#/` biblioteca e `#/ler/<id>` leitura.
- **Biblioteca:**
  - título "Limpa Livros";
  - botão `<label>` "Escolher livro (PDF ou EPUB)" sobre `<input type=file accept=".pdf,.epub,application/pdf,application/epub+zip">`;
  - checkbox "PDF escaneado";
  - lista "Meus livros" com título, data (pt-BR) e botões "Abrir" e "Apagar" (este com `confirm('Apagar este livro da lista?')`);
  - texto vazio: "Nenhum livro ainda.".
- **Processando:** `<progress>`, etapa, "página X de Y" e botão "Cancelar", que encerra o worker. Ao terminar, o livro é salvo, o resumo do relatório aparece por 3 s (texto em português, por exemplo "Removidos: 214 cabeçalhos, 230 números de página, 2 páginas de sumário/índice/ficha. 57 notas movidas para o fim dos capítulos.") e a página navega para a leitura.
- **Leitura:**
  - fora de `<main>`, só um `<nav>` com o link "‹ Biblioteca";
  - `<main>` contém só o HTML do livro, com `document.documentElement.lang` e `document.title` iguais aos do livro;
  - restaura `scrollY` e salva a rolagem com throttle de 2 s;
  - CSS: coluna `max-width: 38rem`, fonte 1.2rem, `line-height: 1.6`, tema claro/escuro por `prefers-color-scheme`, legível em 360px de largura.

- [ ] **Passo 1: Implementar `index.html`, `style.css`, `app.js` e `worker.js`.** No worker, `pdfjs.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.mjs'`. O modo escaneado chama `ocrPdf`, criado na Tarefa 10. Até lá, o worker responde `error` com `'Modo escaneado ainda não disponível.'`.
- [ ] **Passo 2: Gerar arquivos de verificação.** Execute `node tests/fixtures/make-pdf.mjs --demo samples/demo.pdf` e `node tests/fixtures/make-epub.mjs --demo samples/demo.epub`, o mesmo conteúdo do teste de pipeline. Isso exige um modo CLI nos geradores. Também gere `samples/grande.pdf`, com 400 páginas de texto repetido.
- [ ] **Passo 3: Verificar no navegador embutido** (`preview_start` com o nome do launch.json):
  - carregar `demo.pdf` → a leitura mostra 2 capítulos, sem cabeçalho/ISBN/sumário, e com notas no fim;
  - voltar à biblioteca → o livro está na lista; reabrir → a rolagem é restaurada; "Apagar" → o livro sai da lista;
  - carregar `demo.epub` → mesmo resultado;
  - carregar um `.txt` → mensagem "Escolha um arquivo PDF ou EPUB.";
  - **(Foco 3)** carregar `grande.pdf` com emulação mobile (`resize_window` preset mobile) → conclui sem travar a interface, com progresso atualizando;
  - `read_page` na leitura → nenhum texto de botão dentro de `main`;
  - console sem erros.
- [ ] **Passo 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Passo 5: Commit.** `feat: interface, worker e tela de leitura`

### Tarefa 10: Modo escaneado (OCR)

**Arquivos:** criar `src/ocr/ocr.js`, `tests/ocr.test.mjs`; modificar `src/worker.js`

**Interfaces:**
- Produz:
  - `ocrWordsToPage(words: {text, bbox:{x0,y0,x1,y1}}[], pageNumber, width, height): Page` (pura): o tamanho de cada palavra é estimado como `(y1-y0)×0.8` e o resultado usa `groupItemsIntoLines`;
  - `ocrPdf(data: Uint8Array, {pdfjs, Tesseract, onProgress, signal}): Promise<{pages: Page[], outline: [], title: string|null, imageCount: 0}>`, que renderiza cada página num `OffscreenCanvas` a 2× e roda `worker.recognize` com `langs 'por+eng'`, `workerPath`, `corePath` e `langPath` apontando para `vendor/` (os dados de idioma são baixados de `tessdata` uma vez e ficam em cache do navegador; esta é a única exceção à regra de não usar CDN, e só baixa modelo, nunca envia o livro).
- No worker, `scanned:true` passa a usar `ocrPdf` → `cleanPages`. "Cancelar" interrompe via `signal`.

- [ ] **Passo 1: Escrever teste que falha:** `ocrWordsToPage` com palavras de duas linhas → 2 `Line`s na ordem correta, com o texto unido por espaço.
- [ ] **Passo 2: Rodar `npm test`.** Esperado: FAIL.
- [ ] **Passo 3: Implementar e ligar no worker.**
- [ ] **Passo 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Passo 5: Verificar no navegador.** Gere `samples/escaneado.pdf` (renderize 3 páginas de `demo.pdf` para PNG e monte um PDF só de imagens com pdf-lib) e carregue com "PDF escaneado" marcado. Esperado: o texto aparece, com acentos majoritariamente corretos e cabeçalhos removidos. Carregar `escaneado.pdf` sem marcar a caixa → aparece a sugestão de marcar "PDF escaneado".
- [ ] **Passo 6: Commit.** `feat: modo escaneado com OCR`

### Tarefa 11: PWA, offline e instruções de publicação

**Arquivos:** criar `manifest.webmanifest`, `sw.js`, `icons/icon-192.png`, `icons/icon-512.png`, `README.md`; modificar `index.html`, `src/app.js`

- [ ] **Passo 1: Implementar o manifest e o service worker.**
  - Manifest: nome "Limpa Livros", `display: standalone`, `start_url: "./"` e os ícones. O ícone é um livro simples, gerado por script com canvas ou SVG convertido.
  - `sw.js`: faz cache de todo o site (lista explícita com versão `CACHE = 'limpa-livros-v1'`), com estratégia cache-first e limpeza de caches antigos.
  - Registrar em `app.js`.
  - Se o Edge Android suportar `share_target`, adicionar `"share_target"` com POST multipart (`accept: .pdf, .epub`), tratado no `sw.js`, que guarda o arquivo e abre `#/?compartilhado=1`. Esse item é opcional: se não funcionar no teste, remova e anote no README.
- [ ] **Passo 2: Verificar no navegador embutido.** O manifest é válido (sem erros no console); recarregar com a rede bloqueada continua funcionando, em `read_network_requests` todas as respostas vêm do service worker; ao processar `demo.pdf`, não há requisição de rede com o conteúdo do livro.
- [ ] **Passo 3: Escrever o `README.md` em português.**
  - O que o programa faz.
  - Como usar no PC e no Android, incluindo como instalar na tela inicial e onde fica o "Ler em voz alta" no Edge.
  - Como publicar no GitHub Pages, passo a passo para leigo: criar conta, criar repositório, enviar a pasta (o envio pelo navegador é aceitável) e ativar Pages.
  - Como rodar os testes.
- [ ] **Passo 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Passo 5: Commit.** `feat: PWA offline e instruções de publicação`
