# Limpa Livros: design

Data: 2026-11-17 (revisado no mesmo dia: passou de programa Python para página web, para funcionar também no Android)

## Intenção

O usuário quer **ouvir livros inteiros com o "Ler em voz alta" do Microsoft Edge**, do começo ao fim, sem interrupção e sem a voz ler coisas que não são o texto do livro. Isso vale **no PC (Windows 11) e no celular (Android)**, e o livro deve poder ser limpo nos dois aparelhos.

Hoje isso não funciona por dois motivos:
- Em PDF, o "Ler em voz alta" para no fim de cada página e lê cabeçalhos, rodapés e números.
- EPUB o Edge nem abre mais.

A solução é uma **página web** que recebe um PDF ou EPUB e mostra o livro inteiro como texto corrido e limpo, na própria página. O Edge lê essa página continuamente.

## Objetivos

1. Abrir um endereço no Edge (PC ou Android), escolher um PDF com texto selecionável ou um EPUB e ver o livro limpo em uma página contínua.
2. Remover o que atrapalha a escuta:
   - cabeçalhos e rodapés repetidos (título do livro, do capítulo, nome do autor)
   - números de página, em qualquer formato: `12`, `xii`, `— 12 —`, `Página 12`, `12 | Título`
   - hifenização de fim de linha (`pro-` + `cesso` vira `processo`)
   - parágrafos partidos na virada de página ou de coluna, que devem virar um parágrafo só
   - números ou símbolos de chamada de nota no meio do texto (`Freud³`, `[12]`, `*`)
   - **sumário, índice remissivo e ficha catalográfica/página de direitos** (proposta do Claude; o usuário não se opôs)
3. **Manter:** dedicatória, prefácio, apresentação e bibliografia (a bibliografia fica no fim, então é fácil parar antes dela).
4. **Notas de rodapé:** tirar do meio do texto e juntar numa seção "Notas" no fim de cada capítulo. Se não houver capítulos, vão para o fim do livro.
5. **Títulos de capítulo** viram títulos HTML (`h1`/`h2`), para a voz fazer uma pausa natural e para dar para navegar.
6. **Imagens e tabelas** saem do texto.
7. **Modo escaneado:** uma opção que o usuário marca quando sabe que o PDF é escaneado. Ela reconhece o texto das imagens antes de limpar.
8. **Biblioteca no aparelho:** cada livro limpo fica salvo no navegador daquele aparelho, numa lista, para reabrir depois sem reprocessar. Também deve ser possível apagar um livro da lista.
9. **Nenhum livro sai do aparelho.** Todo o processamento acontece no navegador. O servidor só entrega a página.

## Não objetivos

- Detectar sozinho se o PDF é escaneado. O usuário marca a opção. (Se aparecer pouquíssimo texto, a página pode sugerir o modo escaneado.)
- Sincronizar a biblioteca entre PC e celular. Cada aparelho tem a sua.
- Preservar layout, fontes, imagens, tabelas ou fórmulas.
- Abrir arquivos com DRM. Nesses casos a página avisa.
- Ter conta, login ou servidor próprio.
- Exportar para outros formatos (EPUB, MP3). Baixar o HTML limpo pode existir como extra simples, mas não é exigido.
- Ter um leitor de voz próprio. Quem lê é o "Ler em voz alta" do Edge.

## Anti-objetivos (falhas mesmo que "funcione")

- **Apagar texto de verdade** achando que é cabeçalho, número, sumário ou índice. Isso é pior do que deixar sujeira. Na dúvida, manter.
- Embaralhar a ordem do texto, por exemplo em PDFs de duas colunas.
- Fazer a voz do Edge ler botões, menus ou outros textos da página junto com o livro. A tela de leitura deve conter só o livro.
- Usar a voz do idioma errado.
- Enviar os livros do usuário a qualquer servidor.
- Ficar pesada ou travar no celular com um livro comum de 300 páginas.

## Restrições

- Edge no Windows 11 e no Android.
- O usuário é leigo em programação. Uso diário: abrir o endereço, escolher o arquivo e ouvir.
- A maioria dos livros é PDF com texto selecionável. Escaneados são exceção.
- Ainda não há livros de exemplo. Os testes começam com arquivos sintéticos, e os ajustes finos vêm quando o usuário usar livros reais.
- A página precisa estar num endereço HTTPS público para o celular acessar. Isso exige uma conta de hospedagem do usuário (veja "Pendente").

## Abordagens consideradas

| Abordagem | Como funciona | Troca |
|---|---|---|
| **A. Página web que faz tudo no navegador (escolhida)** | pdf.js para PDF, leitura direta do EPUB, tesseract.js para escaneados, IndexedDB para a biblioteca | Um só programa para PC e Android, leve e sem instalação, e os livros não saem do aparelho. O pdf.js dá posição e tamanho de fonte, mas o agrupamento em linhas e blocos fica com o código. |
| B. PyMuPDF no navegador (Pyodide) | O mesmo código Python rodando na página | Limpeza mais precisa, mas download inicial de cerca de 30 MB e lentidão no celular. |
| C. PC como servidor | O celular envia o livro ao PC, que limpa e devolve | O PC precisa estar ligado e acessível da internet, os arquivos trafegam pela rede e a configuração é complicada. |
| (Descartada antes) Programa Python só no PC | Ícone de arrastar e soltar | Não funciona no celular. |

O usuário escolheu a **A**.

## Como funciona (o que foi decidido)

### Telas
1. **Início / biblioteca:** um botão grande "Escolher livro (PDF ou EPUB)", uma caixa "PDF escaneado" e a lista dos livros já limpos, com título, data, botão de abrir e botão de apagar.
2. **Processando:** barra de progresso por página e, no fim, um resumo do que foi removido (por exemplo "214 cabeçalhos, 230 números de página e 57 notas movidas").
3. **Leitura:** só o livro, sem menus visíveis dentro da área de conteúdo, com coluna confortável e fonte grande. A volta para a biblioteca fica num link discreto fora do conteúdo principal ou no botão "voltar" do navegador. A página deve ter `<main>`/`<article>` bem marcados, para o "Ler em voz alta" começar no livro.

Esboço:

```
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ Limpa Livros                 │    │ ‹ Biblioteca                 │
│ [ Escolher livro (PDF/EPUB) ]│    │                              │
│ [ ] PDF escaneado            │    │ Capítulo 1                   │
│                              │    │ Era uma vez um texto que     │
│ Meus livros                  │    │ continua sem parar até o     │
│  • O Livro X    Abrir  Apagar│    │ fim do livro…                │
│  • Outro Livro  Abrir  Apagar│    │                              │
└──────────────────────────────┘    └──────────────────────────────┘
```

### PDF com texto (pdf.js)
Para cada página, pegar os itens de texto com posição, tamanho da fonte (pela matriz de transformação), nome da fonte e largura. Agrupar em linhas pela linha de base e em blocos pelo espaçamento. Depois:

1. **Tamanho do corpo:** o tamanho de fonte mais frequente, ponderado por caracteres.
2. **Cabeçalhos e rodapés:** linhas nas faixas de cima e de baixo da página que, depois de trocar os dígitos por um marcador, se repetem em muitas páginas. Considerar também páginas pares e ímpares separadamente.
3. **Números de página:** remover linhas soltas nessas faixas que sejam só um número, arábico ou romano, com ou sem decoração ou prefixo.
4. **Notas de rodapé:** blocos no fim da página, com fonte menor que o corpo, geralmente começando com número ou símbolo e às vezes depois de um traço. Eles vão para "Notas" no fim do capítulo, mantendo o número ou símbolo original, mesmo que reinicie a cada página. *(Decisão do Claude.)*
   - Se o PDF já tem uma seção "Notas" no fim do capítulo ou do livro, ela fica onde está, e só as chamadas saem do texto. *(Decisão do Claude.)*
5. **Chamadas de nota:** remover itens menores e elevados em relação à linha de base, compostos só de dígitos ou símbolos e grudados ao texto.
6. **Ordem de leitura:** detectar colunas e ler coluna por coluna, de cima para baixo.
7. **Parágrafos:** juntar a hifenização de fim de linha quando a palavra continua em minúscula. Quebrar parágrafo por recuo ou por espaço vertical maior que o normal.
8. **Virada de página:** se o último parágrafo da página não termina com pontuação final, ele continua na próxima página.
9. **Títulos:** usar o sumário embutido do PDF (outline), quando existir, para achar capítulos. Se não existir, usar linhas curtas com fonte claramente maior que o corpo.
10. **Sumário e índice remissivo:**
    - Sumário: páginas no início do livro dominadas por linhas que terminam em número de página, muitas vezes com pontilhado.
    - Índice: páginas no fim dominadas por termos seguidos de listas de números.
    - Ficha catalográfica: blocos com marcas típicas, como "Dados Internacionais de Catalogação", "ISBN", "CDD", "©" e "Todos os direitos reservados".
    - Remover só quando a página inteira bate claramente com o padrão.
11. **Imagens e tabelas:** ignorar imagens. Descartar tabelas quando forem detectáveis.

### PDF escaneado
Renderizar cada página para imagem com pdf.js e reconhecer o texto com **tesseract.js** (português + inglês). O resultado traz posição e tamanho de cada palavra, e depois passa pelo mesmo pipeline acima. Processar em segundo plano (Web Worker) com progresso por página e opção de cancelar. Os dados de idioma são baixados na primeira vez que o modo é usado e ficam em cache.

### EPUB
- Abrir o ZIP (JSZip), ler a ordem do `spine` no `.opf` e concatenar os corpos XHTML.
- Remover imagens, SVG, tabelas, marcadores de página (`epub:type="pagebreak"`, `role="doc-pagebreak"`), sumário (`nav`, `epub:type="toc"`) e índice (`epub:type="index"`).
- Remover chamadas de nota (`noteref`, `doc-noteref`, `<sup><a>` para notas) e mover o conteúdo das notas para "Notas" no fim do capítulo. Se já existir um arquivo próprio de notas no fim, manter ali.
- Usar os títulos existentes.

### Saída e biblioteca
- O livro limpo é um HTML simples (`h1`/`h2`/`p` + seções de notas), salvo no IndexedDB com título, idioma e data.
- `lang` correto no documento, detectado pelo texto (pelo menos português e inglês; padrão `pt-BR`), para o Edge escolher a voz.
- Título do livro vindo dos metadados ou do nome do arquivo.
- Guardar a posição de rolagem de cada livro e voltar a ela ao reabrir. *(Decisão do Claude; é simples e ajuda em livros longos.)*

### Técnica
- Site estático (HTML, CSS e JS), sem servidor próprio. Bibliotecas carregadas de arquivos locais do próprio site, não de CDN, para funcionar sem depender de terceiros.
- PWA instalável na tela inicial do Android, funcionando offline depois da primeira visita.
- Processamento pesado em Web Worker, para a tela não travar.

## Pendente: decisão do usuário

- **Hospedagem:** a recomendação é o **GitHub Pages**, que é gratuito e só guarda o programa, nunca os livros. Para isso o usuário precisa criar uma conta no GitHub; o Claude não cria contas. Alternativas equivalentes: Cloudflare Pages ou Netlify, que também exigem uma conta. Até isso ser resolvido, a página pode ser desenvolvida e testada localmente no PC.

## O que fica a critério de quem construir

- Limiares das heurísticas (faixas, repetição, tamanhos).
- Algoritmo de colunas e de agrupamento em linhas e blocos.
- Ferramentas de build (ou nenhuma), organização do código e testes.
- Visual exato, desde que seja legível, simples e com boa aparência no celular.
- Como detectar o idioma.
- "Compartilhar com Limpa Livros" a partir de outros apps do Android (Web Share Target) é um extra desejável, se o Edge Android suportar. Não é obrigatório.

Testes: PDFs e EPUBs sintéticos com cabeçalhos, números, notas, hifenização, duas colunas, parágrafo cruzando a página, sumário e índice. Depois, livros reais do usuário.
