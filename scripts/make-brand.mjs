// Builds square PNG logos from brand-src/*.jpg (files may be zlib-compressed). Run: node scripts/make-brand.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'apps/web/public/brand');
fs.mkdirSync(out, { recursive: true });

function load(name) {
  const b = fs.readFileSync(path.join(root, 'brand-src', name));
  return b[0] === 0xff && b[1] === 0xd8 ? b : zlib.inflateSync(b);
}
// badge bounds measured from the sources (cream margin excluded)
const SRC = {
  orange: { file: 'img1_1240x1240.jpg', box: { left: 36, top: 2, width: 1176, height: 1228 } },
  navy: { file: 'img2_1240x1312.jpg', box: { left: 92, top: 118, width: 1008, height: 1060 } },
};

async function build(key) {
  const { file, box } = SRC[key];
  const crop = await sharp(load(file)).extract(box).toBuffer();
  const r = Math.round(box.width * 0.18);
  const mask = Buffer.from(`<svg width="${box.width}" height="${box.height}"><rect width="${box.width}" height="${box.height}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
  const rounded = await sharp(crop).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const side = Math.max(box.width, box.height);
  const square = await sharp(rounded)
    .extend({
      top: Math.floor((side - box.height) / 2), bottom: Math.ceil((side - box.height) / 2),
      left: Math.floor((side - box.width) / 2), right: Math.ceil((side - box.width) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png().toBuffer();
  // solid colour from the badge edge for opaque icons (apple-touch)
  const px = await sharp(crop).extract({ left: 14, top: Math.floor(box.height / 2), width: 1, height: 1 }).raw().toBuffer();
  return { square, bg: { r: px[0], g: px[1], b: px[2], alpha: 1 } };
}

const orange = await build('orange');
const navy = await build('navy');
const resize = (buf, n) => sharp(buf).resize(n, n, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer();
const write = async (name, buf) => fs.writeFileSync(path.join(out, name), buf);

await write('logo-orange.png', await resize(orange.square, 512));
await write('logo-orange-192.png', await resize(orange.square, 192));
await write('logo-navy.png', await resize(navy.square, 512));
await write('favicon-32.png', await resize(orange.square, 32));
// apple-touch: opaque, badge on its own edge colour with ~6% padding
const inner = await resize(orange.square, 160);
await write('apple-touch-icon.png', await sharp({ create: { width: 180, height: 180, channels: 4, background: orange.bg } }).composite([{ input: inner, left: 10, top: 10 }]).png({ compressionLevel: 9 }).toBuffer());
console.log('brand assets written to', out);
