import "server-only";
import sharp from "sharp";
import { clearUniformLogoBackground } from "./logo-transparency";
import { readableBrandForeground } from "@/lib/loyalty/approved-design";

export type LogoPalette = { primary: string; secondary: string; text: string };

export async function prepareLoyaltyLogo(input: Uint8Array) {
  if (!input.byteLength || input.byteLength > 10 * 1024 * 1024) throw new Error("اختر صورة شعار لا تتجاوز 10 ميجابايت");
  // Decode locally and publish only raster pixels, never the uploaded SVG/document.
  const source = Buffer.from(input).toString("utf8");
  if (/<svg\b/i.test(source) && /<!DOCTYPE|<!ENTITY|href\s*=\s*["'](?!#)|url\s*\(\s*["']?\s*(?:https?:|file:|\/\/|data:)|<image\b|<script\b|<foreignObject\b/i.test(source)) {
    throw new Error("احفظ الشعار كصورة SVG مستقلة دون روابط خارجية أو ارفعه بصيغة PNG");
  }
  try {
    const { data, info } = await sharp(input, { limitInputPixels: 25_000_000, pages: 1 }).rotate()
      .resize(640, 640, { fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixels = new Uint8ClampedArray(data);
    const backdrop = [pixels[0], pixels[1], pixels[2]];
    const backgroundRemoved = clearUniformLogoBackground(pixels, info.width, info.height);
    const bins = new Map<string, { count: number; r: number; g: number; b: number }>();
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 32) continue;
      const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
      const key = [r, g, b].map(n => Math.round(n / 24)).join(":");
      const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bin.count++; bin.r += r; bin.g += g; bin.b += b; bins.set(key, bin);
    }
    const colors = [...bins.values()].sort((a, b) => b.count - a.count).map(bin => ({ count: bin.count, rgb: [bin.r, bin.g, bin.b].map(n => Math.round(n / bin.count)) }));
    if (!colors.length) throw new Error("empty_logo");
    const chromatic = colors.filter(c => Math.max(...c.rgb) - Math.min(...c.rgb) > 40 && c.count > info.width * info.height * .002);
    const main = chromatic[0] ?? colors[0];
    const hex = (rgb: number[]) => `#${rgb.map(n => n.toString(16).padStart(2, "0")).join("")}`;
    // A colored backdrop is part of the identity even after making the logo transparent.
    // Keep the actual hue; choose readable ink instead of washing dark brands to white.
    const coloredBackdrop = backgroundRemoved && Math.max(...backdrop) - Math.min(...backdrop) > 8;
    const primary = hex(coloredBackdrop ? backdrop : main.rgb);
    const secondary = hex(main.rgb);
    const palette: LogoPalette = { primary, secondary, text: readableBrandForeground(primary) };
    const bytes = await sharp(Buffer.from(pixels), { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ lossless: true }).toBuffer();
    if (bytes.length > 350_000) throw new Error("logo_too_complex");
    return { dataUrl: `data:image/webp;base64,${bytes.toString("base64")}`, palette, backgroundRemoved, width: info.width, height: info.height };
  } catch {
    throw new Error("تعذر تجهيز الشعار استخدم صورة PNG أو JPG أو WebP أو SVG أو GIF أو TIFF أو AVIF واضحة");
  }
}
