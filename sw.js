// Service worker: deixa o Limpa Livros funcionar sem internet.
// Ao mudar qualquer arquivo do site, aumente o número da versão em CACHE (v1 → v2…):
// é isso que faz os aparelhos baixarem a versão nova, oferecida na biblioteca com o botão
// "Atualizar". tests/sw.test.mjs confere a lista SHELL.
const CACHE = 'limpa-livros-v1';

// Guardado na instalação. Os arquivos do OCR (vendor/tesseract-*, ~19 MB) ficam de fora:
// são guardados no primeiro uso do modo escaneado, para o celular não baixá-los à toa.
const SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './src/app.js',
  './src/assemble.js',
  './src/clean/columns.js',
  './src/clean/frontback.js',
  './src/clean/headings.js',
  './src/clean/margins.js',
  './src/clean/notes.js',
  './src/clean/pagenum.js',
  './src/clean/paragraphs.js',
  './src/empty-result.js',
  './src/epub/epub.js',
  './src/lang.js',
  './src/model.js',
  './src/ocr/ocr.js',
  './src/pdf/extract.js',
  './src/pdf/lines.js',
  './src/pdf/pipeline.js',
  './src/storage/library.js',
  './src/worker.js',
  './vendor/pdf.min.mjs',
  './vendor/pdf.worker.min.mjs',
  './vendor/jszip.min.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' pula o cache HTTP do navegador, para a versão nova não guardar arquivos velhos.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('limpa-livros-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// A versão nova fica esperando até a pessoa tocar em "Atualizar" (src/app.js manda SKIP_WAITING).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Só arquivos do próprio site; o resto (ex.: o modelo de idioma do OCR) segue direto para a rede.
  const url = new URL(request.url);
  if (request.method !== 'GET' || !/^https?:$/.test(url.protocol) || url.origin !== self.location.origin) return;
  event.respondWith(cacheFirst(event, request));
});

async function cacheFirst(event, request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  let response;
  try {
    response = await fetch(request);
  } catch (e) {
    // Sem internet: qualquer navegação abre a página principal guardada.
    if (request.mode === 'navigate') {
      const page = await cache.match('./');
      if (page) return page;
    }
    throw e;
  }
  // Guardar é à parte: se falhar (ex.: sem espaço no celular), a resposta da rede vale do mesmo jeito.
  if (response.ok && response.type === 'basic') {
    event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
  }
  return response;
}
