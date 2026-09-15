// Deterministic background removal using the user-approved original-logo workflow.
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sharp = require('sharp');

async function run() {
  const source = await fs.readFile('.codex-tmp/menu-logo-sources/shahi-w-hail.webp');
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), '7511e2858862cf328baad386d2dc61c6e4bb0bfeb952816cd24d15ef5b887dc8');
  const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  let transparent = 0;
  let opaque = 0;
  for (let pixel = 0; pixel < info.width * info.height; pixel++) {
    const offset = pixel * info.channels;
    // Remove the black backdrop, including letter counters and the leaf cutouts.
    const brightness = Math.max(data[offset], data[offset + 1], data[offset + 2]);
    const alpha = Math.round(Math.max(0, Math.min(1, (brightness - 12) / 58)) * 255);
    for (let channel = 0; channel < 3; channel++) rgba[pixel * 4 + channel] = data[offset + channel];
    rgba[pixel * 4 + 3] = alpha;
    if (alpha === 0) transparent++;
    if (alpha === 255) opaque++;
  }
  assert.ok(transparent > info.width * info.height * 0.6);
  assert.ok(opaque > info.width * info.height * 0.05);
  await fs.mkdir('public/menu-logos', { recursive: true });
  const cutout = sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } });
  await cutout.clone().png().toFile('public/menu-logos/shahi-transparent-v1.png');
  await cutout.clone().webp({ lossless: true }).toFile('public/menu-logos/shahi-transparent-v1.webp');
  assert.equal((await sharp('public/menu-logos/shahi-transparent-v1.webp').stats()).isOpaque, false);
  await cutout.clone().flatten({ background: '#173123' }).png().toFile('.codex-tmp/shahi-logo-on-forest.png');
  console.log(JSON.stringify({ width: info.width, height: info.height, transparent, opaque, actualAlpha: true }));
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
