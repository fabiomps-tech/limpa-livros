// Gera os ícones PNG do app (um livro aberto) sem dependências: desenha pixel a pixel e
// codifica o PNG com o zlib do Node. Uso: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'icons');

const ACCENT = [0x2f, 0x5d, 0x8a];
const PAGE = [0xfa, 0xf8, 0xf4];
const INK = [0x9b, 0xb3, 0xcc];

// Página esquerda (coordenadas de 0 a 1); a direita é o espelho.
const LEFT_PAGE = [[0.20, 0.30], [0.49, 0.34], [0.49, 0.76], [0.20, 0.72]];
const topY = (x) => 0.30 + (x - 0.20) * (0.04 / 0.29);
const LINES = [0.09, 0.16, 0.23, 0.30];

function inConvex(poly, x, y) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
  }
  return true;
}

function inRoundedSquare(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Cor (RGBA) num ponto; x, y de 0 a 1. */
function colorAt(x, y, maskable) {
  if (!maskable && !inRoundedSquare(x, y, 0.18)) return null;
  if (maskable) { // conteúdo menor, dentro da zona segura do ícone adaptável
    x = 0.5 + (x - 0.5) / 0.9;
    y = 0.5 + (y - 0.5) / 0.9;
  }
  const lx = x < 0.5 ? x : 1 - x; // espelha a página direita
  if (inConvex(LEFT_PAGE, lx, y)) {
    if (lx >= 0.25 && lx <= 0.45) {
      for (const d of LINES) if (Math.abs(y - (topY(lx) + d)) <= 0.0125) return INK;
    }
    return PAGE;
  }
  return ACCENT;
}

function render(size, maskable) {
  const S = 4; // superamostragem para bordas suaves
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = colorAt((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size, maskable);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const i = (py * size + px) * 4;
      if (a) { rgba[i] = r / a; rgba[i + 1] = g / a; rgba[i + 2] = b / a; }
      rgba[i + 3] = Math.round((a / (S * S)) * 255);
    }
  }
  return rgba;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(out, { recursive: true });
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
]) {
  writeFileSync(join(out, name), png(size, render(size, maskable)));
  console.log('icons/' + name);
}
