const fs = require('node:fs');
const crypto = require('node:crypto');
const sharp = require('sharp');
async function main() {
  const source = process.argv[2];
  if (!source) throw Error('Pass original aldeem-catalog.jpeg path');
  const original = fs.readFileSync(source);
  // Exact rectangle used by the original project's Brand/CatalogWindow, without redraw.
  const rectangle = { left: 644, top: 16, width: 389, height: 72 };
  const metadata = await sharp(original).metadata();
  if (metadata.width !== 1431 || metadata.height !== 1600) throw Error('Unexpected original catalog dimensions');
  const raw = await sharp(original).extract(rectangle).removeAlpha().raw().toBuffer();
  const webp = await sharp(raw, { raw: { width: rectangle.width, height: rectangle.height, channels: 3 } }).webp({ lossless: true }).toBuffer();
  const decoded = await sharp(webp).removeAlpha().raw().toBuffer();
  if (!raw.equals(decoded)) throw Error('Logo extraction changed pixels');
  fs.mkdirSync('public/aldeem', { recursive: true }); fs.writeFileSync('public/aldeem/logo.webp', webp);
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const result = { finishedAt: new Date().toISOString(), command: 'node scripts/extract-aldeem-logo.cjs <original-catalog>', rectangle, sourceSha256: hash(original), outputSha256: hash(webp), exactPixelMatch: true, bytes: webp.length };
  fs.mkdirSync('output/aldeem-20261114', { recursive: true }); fs.writeFileSync('output/aldeem-20261114/logo-extraction.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
