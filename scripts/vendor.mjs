// Copia as bibliotecas de node_modules para vendor/ (versionado, para o site funcionar sem npm).
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => join(root, 'node_modules', ...p);
const out = join(root, 'vendor');
mkdirSync(out, { recursive: true });

const files = [
  [nm('pdfjs-dist', 'build', 'pdf.min.mjs'), 'pdf.min.mjs'],
  [nm('pdfjs-dist', 'build', 'pdf.worker.min.mjs'), 'pdf.worker.min.mjs'],
  [nm('jszip', 'dist', 'jszip.min.js'), 'jszip.min.js'],
  [nm('tesseract.js', 'dist', 'tesseract.min.js'), 'tesseract.min.js'],
  [nm('tesseract.js', 'dist', 'worker.min.js'), 'tesseract-worker.min.js'],
  [nm('tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [nm('tesseract.js-core', 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [nm('tesseract.js-core', 'tesseract-core-simd.wasm.js'), 'tesseract-core-simd.wasm.js'],
  [nm('tesseract.js-core', 'tesseract-core.wasm.js'), 'tesseract-core.wasm.js'],
];
for (const [src, name] of files) {
  copyFileSync(src, join(out, name));
  console.log('vendor/' + name);
}
