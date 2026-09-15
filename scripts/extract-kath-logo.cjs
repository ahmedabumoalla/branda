// User-authorized deterministic background removal, preserving the source artwork
const fs = require('node:fs/promises');
const sharp = require('sharp');
const assert = require('node:assert/strict');
async function run() {
  const source = '.codex-tmp/menu-logo-sources/kat-coffe.webp';
  const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const background = [data[0], data[1], data[2]];
  const rgba = Buffer.alloc(info.width * info.height * 4);
  let transparent = 0, opaque = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    const p = i * info.channels;
    const distance = Math.max(...background.map((v, channel) => Math.abs(data[p + channel] - v)));
    const alpha = Math.round(Math.max(0, Math.min(1, (distance - 22) / 40)) * 255);
    for (let channel = 0; channel < 3; channel++) rgba[i * 4 + channel] = data[p + channel];
    rgba[i * 4 + 3] = alpha;
    if (alpha === 0) transparent++;
    if (alpha === 255) opaque++;
  }
  assert.ok(transparent > info.width * info.height * .4);
  assert.ok(opaque > info.width * info.height * .1);
  await fs.mkdir('public/menu-logos', { recursive: true });
  const image = sharp(rgba, {raw:{width:info.width,height:info.height,channels:4}});
  // Keep source dimensions and all foreground pixel RGB values unchanged
  await image.clone().png().toFile('public/menu-logos/kath-transparent-v1.png');
  await image.clone().webp({lossless:true}).toFile('public/menu-logos/kath-transparent-v1.webp');
  const result = await sharp('public/menu-logos/kath-transparent-v1.webp').stats();
  assert.equal(result.isOpaque, false);
  console.log(JSON.stringify({background,width:info.width,height:info.height,transparent,opaque,alpha:true}));
}
run().catch(error=>{console.error(error.message);process.exitCode=1});
