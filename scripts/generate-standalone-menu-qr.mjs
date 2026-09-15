import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import qrCode from "qrcode-generator";
import sharp from "sharp";

async function main() {
  const url = "https://barndaksa.com/menu/double-b-bistro";
  const qr = qrCode(0, "H");
  qr.addData(url, "Byte");
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 16, margin: 64, scalable: true });
  const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/menu-qr");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "double-b-bistro.svg"), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(output, "double-b-bistro.png"));
  console.log(`Generated direct menu QR: ${url}`);
}

main().catch(() => { console.error("QR generation failed"); process.exitCode = 1; });
