# Problemas conhecidos

Registrados na revisão final em 2026-11-17. O usuário escolheu entregar assim e corrigir depois.

## Podem perder ou embaralhar texto

1. **EPUB com sumário ou ficha no mesmo arquivo que capítulos** (`src/epub/epub.js:146-148` e `:421`).
   - Quando o `<guide>` do EPUB aponta `type="toc"` ou `type="copyright-page"` para um endereço com `#fragmento`, o arquivo inteiro é descartado.
   - Isso pode apagar capítulos ou o livro todo; é comum em EPUBs convertidos por Calibre ou Word.
   - Correção: só descartar o arquivo quando o endereço não tiver fragmento, ou quando o fragmento apontar para o primeiro elemento do arquivo. Caso contrário, remover só o elemento apontado.
2. **Tabelas, peças de teatro, cronologias e poemas com espaço no meio do verso** (`src/pdf/lines.js:42` → `src/clean/columns.js`).
   - A divisão de linha em vãos maiores que 1,5× o tamanho da fonte faz `splitColumns` ler essas páginas coluna por coluna.
   - Correção: só aceitar duas colunas quando os dois lados parecerem colunas de texto (largura mediana ≥ 25–30% da largura útil em cada lado). Caso contrário, juntar de novo as partes da mesma linha.
3. **Citações e legendas no pé da página viram nota** (`src/clean/notes.js:60` e `:65`).
   - Quando a página anterior teve notas, linhas pequenas no pé da página são tratadas como continuação da última nota.
   - Correção: só continuar a nota se o texto anterior não terminar em pontuação final e se o x das linhas coincidir com a margem do texto da nota.
4. **Referência numérica que não é nota perde o número no EPUB** (`src/epub/epub.js:235`, com `:216`).
   - Exemplos: `<a href="#s2">2</a>` apontando para um item de lista, ou `[3]` de citação.
   - Correção: para links "soltos", usar só a semântica de nota ou o pertencimento a uma seção de notas, não o fato de o alvo ser referenciado.

## Menores

- Colunas com vão ≤ 1,5× o tamanho da fonte (Bíblias, dicionários, LaTeX padrão) ainda são lidas atravessando as colunas.
- Capitular (letra inicial grande) pode sair fora do lugar no começo dos capítulos.
- Entradas do sumário embutido do PDF que apontam para capa ou folha de rosto viram títulos vazios.
- `getOperatorList()` em toda página só para contar imagens deixa livros ilustrados mais lentos no celular.
- Não testado em celular real nem com livros reais do usuário.
