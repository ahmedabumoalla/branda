// User-authorized deterministic cutout of the reviewed original logo.
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const sharp = require('sharp');

async function run() {
  const source = '.codex-tmp/menu-logo-sources/meknes-loung.webp';
  const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 601);
  assert.equal(info.height, 544);
  const rgba = Buffer.alloc(info.width * info.height * 4);
  let transparent = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const pixel = y * info.width + x;
      const offset = pixel * info.channels;
      // Protect the emblem's dark blue text, white plate and internal shadows.
      const insideEmblem = Math.hypot(x - 295.5, y - 292.5) < 142;
      // The outer navy backdrop has negligible red; orange and cream are retained.
      const alpha = insideEmblem ? 255 : Math.round(Math.max(0, Math.min(1, (data[offset] - 20) / 70)) * 255);
      for (let channel = 0; channel < 3; channel++) rgba[pixel * 4 + channel] = data[offset + channel];
      rgba[pixel * 4 + 3] = alpha;
      if (!alpha) transparent++;
    }
  }
  assert.ok(transparent > info.width * info.height * 0.5);
  await fs.mkdir('public/menu-logos', { recursive: true });
  const cutout = sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } });
  await cutout.clone().png().toFile('public/menu-logos/meknes-transparent-v1.png');
  await cutout.clone().webp({ lossless: true }).toFile('public/menu-logos/meknes-transparent-v1.webp');
  const stats = await sharp('public/menu-logos/meknes-transparent-v1.webp').stats();
  assert.equal(stats.isOpaque, false);
  await cutout.clone().flatten({ background: '#173123' }).png().toFile('.codex-tmp/meknes-logo-on-forest.png');
  console.log(JSON.stringify({ width: info.width, height: info.height, transparent, actualAlpha: true }));
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
