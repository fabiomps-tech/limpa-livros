# Limpa Livros

Uma página que prepara livros em **PDF** ou **EPUB** para serem ouvidos com o **"Ler em voz alta"** do Microsoft Edge, no computador ou no celular Android.

Livros em PDF costumam ter cabeçalhos, números de página e notas de rodapé no meio do texto. Na leitura em voz alta isso vira interrupção: "Capítulo 3, página 47" a cada virada de página, a nota de rodapé lida no meio da frase. O Limpa Livros tira essas sobras, junta as linhas em parágrafos e mostra o livro como uma página só, que o Edge lê do começo ao fim sem tropeçar.

- Tira cabeçalhos e rodapés repetidos, números de página e marcas de nota no meio do texto.
- Leva as notas de rodapé para o fim de cada capítulo.
- Junta as palavras quebradas com hífen no fim da linha.
- Funciona com PDF de texto, com EPUB e, com a opção **PDF escaneado**, com PDF feito de fotos das páginas (veja abaixo).
- Guarda os livros já limpos na sua "biblioteca", no próprio aparelho, e lembra onde você parou.
- Depois da primeira visita, funciona **sem internet**.

## Privacidade

Os livros **nunca saem do seu aparelho**. Toda a limpeza é feita pelo próprio navegador; nada do livro é enviado para servidor nenhum. A biblioteca fica guardada no navegador do aparelho (se você limpar os dados do site, ela é apagada).

## Como usar no computador (Edge)

1. Abra o endereço do site no Microsoft Edge.
2. Toque em **Escolher livro (PDF ou EPUB)** e escolha o arquivo.
3. Espere a barra de progresso. Ao terminar, o livro limpo abre na tela.
4. Para ouvir, use o **Ler em voz alta** do Edge: menu **⋯** (canto superior direito) → **Ler em voz alta**, ou o atalho **Ctrl+Shift+U**. Na barra que aparece dá para escolher a voz e a velocidade.

Para voltar à lista, use **‹ Biblioteca** no alto da página. Para continuar um livro depois, abra-o pela lista: ele volta para onde você parou.

## Como usar no Android (Edge)

1. Instale o Microsoft Edge pela Play Store, se ainda não tiver.
2. Abra o endereço do site no Edge.
3. Toque em **Escolher livro (PDF ou EPUB)** e escolha o arquivo (ele pode estar em Downloads, no Drive etc.).
4. Quando o livro abrir, toque no menu **⋯** (na barra de baixo) e procure **Ouvir em voz alta** (em algumas versões aparece como **Ler em voz alta**). Os nomes exatos podem mudar conforme a versão do Edge.

### Pôr na tela inicial do celular

Assim o Limpa Livros vira um ícone, como um aplicativo:

1. Com o site aberto no Edge, toque no menu **⋯**.
2. Escolha **Adicionar ao telefone** / **Adicionar à tela inicial** / **Instalar aplicativo** (o nome muda conforme a versão).
3. Confirme. O ícone do livro azul aparece na tela inicial.

No computador também dá para instalar: no Edge, clique no ícone de instalar na barra de endereço, ou menu **⋯** → **Aplicativos** → **Instalar este site como um aplicativo**.

Dica: se na janela do aplicativo instalado você não encontrar o "Ler em voz alta", abra o mesmo endereço numa aba normal do Edge. A biblioteca é a mesma.

## PDF escaneado

Alguns PDFs são só fotos das páginas, sem texto por dentro. Para eles, marque **PDF escaneado** antes de escolher o arquivo: o programa "lê" as imagens (reconhecimento de texto) em português e inglês.

- **Na primeira vez é preciso internet**: o programa baixa o modelo de reconhecimento (alguns MB). Depois ele fica guardado no aparelho e funciona sem internet.
- É bem mais lento que um PDF comum (alguns segundos por página) e pode errar algumas palavras.
- Mesmo nesse modo o livro não é enviado a lugar nenhum: só o modelo é baixado.

## Publicar no GitHub Pages (de graça)

Para usar no celular, o site precisa estar na internet. O GitHub Pages hospeda de graça. Tudo pode ser feito pelo navegador:

1. **Crie uma conta** em <https://github.com> (botão **Sign up**). Guarde o nome de usuário: o endereço do site será `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.
2. **Crie um repositório**: no canto superior direito, **+** → **New repository**.
   - Em **Repository name**, ponha por exemplo `limpa-livros`.
   - Marque **Public**.
   - Clique em **Create repository**.
3. **Envie os arquivos**: na página do repositório novo, clique no link **uploading an existing file** (ou **Add file** → **Upload files**).
   - Abra a pasta do Limpa Livros no computador e **arraste** para a página do GitHub estes itens: `index.html`, `style.css`, `manifest.webmanifest`, `sw.js`, `README.md` e as pastas `icons`, `src` e `vendor`. Arrastar as pastas mantém a organização delas.
   - **Não** envie as pastas `node_modules` e `samples` (não são necessárias e são grandes).
   - O envio pelo navegador aceita **no máximo 100 arquivos por vez**. Se passar disso, envie em partes (por exemplo, primeiro os arquivos soltos e `icons`, depois `src`, depois `vendor`), clicando em **Commit changes** a cada parte. Outra opção é o programa **GitHub Desktop** (<https://desktop.github.com>), que envia a pasta inteira de uma vez.
   - No fim, clique em **Commit changes**.
4. **Ative o Pages**: no repositório, **Settings** → **Pages** (menu da esquerda).
   - Em **Source**, escolha **Deploy from a branch**.
   - Em **Branch**, escolha **main** e a pasta **/ (root)**. Clique em **Save**.
5. Espere um ou dois minutos e recarregue a página de **Settings → Pages**: aparece o endereço do site (`https://SEU-USUARIO.github.io/limpa-livros/`). Abra esse endereço no Edge do computador e do celular.

Para atualizar o site depois, envie os arquivos alterados do mesmo jeito (**Add file** → **Upload files**); os de mesmo nome são substituídos.

## Rodar os testes (para quem programa)

É preciso ter o [Node.js](https://nodejs.org) instalado. Na pasta do projeto:

```
npm install
npm test
```

Para abrir o site no próprio computador: `npm run serve` e depois <http://localhost:8080>.

## Para quem mantém

- **Ao mudar qualquer arquivo do site, aumente a versão do cache** em `sw.js` (`const CACHE = 'limpa-livros-v1'` → `v2`, `v3`…). É isso que faz os aparelhos baixarem a versão nova; sem isso, quem já visitou continua com a antiga. Quando o aparelho encontra a versão nova, a biblioteca mostra a barra **"Nova versão disponível."** com o botão **Atualizar**: ao tocar, a página recarrega já na versão nova. Enquanto ninguém tocar no botão, a versão antiga continua valendo (nunca troca no meio de uma leitura).
- A lista `SHELL` em `sw.js` diz o que é guardado para funcionar sem internet. Ao criar, renomear ou apagar um arquivo em `src/`, atualize a lista; `npm test` (`tests/sw.test.mjs`) avisa se ela estiver desatualizada. Os arquivos do reconhecimento de texto (`vendor/tesseract-*`, cerca de 19 MB) ficam de fora de propósito: são guardados no primeiro uso do modo escaneado.
- **Atualizar as bibliotecas** (pdf.js, JSZip, Tesseract): `npm install` com as versões novas e depois `npm run vendor`, que copia os arquivos para `vendor/`. Aumente a versão do cache em seguida.
- Os ícones são gerados por `node scripts/make-icons.mjs`.
- Não incluído: receber livros pelo menu **Compartilhar** do Android (`share_target`). Não foi possível testar no Edge Android, então ficou de fora; por enquanto o livro é escolhido pelo botão.
