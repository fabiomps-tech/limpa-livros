// Service worker: deixa o Limpa Livros funcionar sem internet.
// Ao mudar qualquer arquivo do site, aumente o número da versão em CACHE (v1 → v2…):
// é isso que faz os aparelhos baixarem a versão nova. tests/sw.test.mjs confere a lista SHELL.
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
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('limpa-livros-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Só arquivos do próprio site; o resto (ex.: o modelo de idioma do OCR) segue direto para a rede.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  } catch (e) {
    // Sem internet: qualquer navegação abre a página principal guardada.
    if (request.mode === 'navigate') {
      const page = await cache.match('./');
      if (page) return page;
    }
    throw e;
  }
}
