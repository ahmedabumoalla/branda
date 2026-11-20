import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { walletBaseUrl } from "./config";
import type { WalletMember } from "./types";
import { clearUniformLogoBackground } from "@/lib/cafe/logo-transparency";
import { logoStencilMask } from "@/lib/cafe/logo-stencil";
import { STAMP_LOGO_VERSION } from "@/lib/loyalty/stamp-style";
import { createWalletArtifactCache, walletArtifactKey } from "./artifact-cache";

const cachedLogo = createWalletArtifactCache(8 * 1024 * 1024, 128, 30_000);

async function brandAsset(member: Pick<WalletMember, "logoUrl" | "cafeName" | "program">) {
  if (!member.logoUrl) {
    const background = /^#[\da-f]{6}$/i.test(member.program.cardBackground) ? member.program.cardBackground : "#3b1420";
    const [r, g, b] = background.slice(1).match(/../g)!.map(value => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    // A transparent fallback must contrast with the pass, never reuse its background.
    const color = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#000000" : "#ffffff";
    const title = member.cafeName.slice(0, 80).replace(/[&<>"']/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[value]!);
    return Buffer.from(`<svg width="640" height="200" xmlns="http://www.w3.org/2000/svg"><text x="320" y="125" text-anchor="middle" font-size="72" fill="${color}">${title}</text></svg>`);
  }
  const baseUrl = walletBaseUrl();
  const source = member.logoUrl;
  if (source.startsWith("data:")) {
    const match = /^data:image\/(?:png|jpe?g|webp|gif|avif|svg\+xml);base64,([a-zA-Z0-9+/=]+)$/.exec(source);
    if (!match || match[1].length > 7 * 1024 * 1024) throw new Error("wallet_invalid_asset");
    return Buffer.from(match[1], "base64");
  }
  const url = new URL(source, baseUrl);
  if (url.origin === baseUrl && !url.search && !url.hash) {
    const root = path.resolve(process.cwd(), "public");
    const target = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error("wallet_invalid_asset");
    try { return await readFile(target); } catch { /* A configured same-origin asset may be served remotely. */ }
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const allowed = new Set([new URL(baseUrl).host, ...(supabaseUrl ? [new URL(supabaseUrl).host] : [])]);
  if (url.protocol !== "https:" || url.username || url.password || !allowed.has(url.host)) throw new Error("wallet_invalid_asset");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/") || Number(response.headers.get("content-length") ?? 0) > 5 * 1024 * 1024) throw new Error("wallet_invalid_asset");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("wallet_invalid_asset");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 5 * 1024 * 1024) { await reader.cancel(); throw new Error("wallet_invalid_asset"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function walletBrandLogo(member: Pick<WalletMember, "logoUrl" | "cafeName" | "program">) {
  const key = walletArtifactKey(JSON.stringify([walletBaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_URL, member.logoUrl, member.cafeName, member.program.cardBackground]));
  return cachedLogo(key, () => renderBrandLogo(member));
}

async function renderBrandLogo(member: Pick<WalletMember, "logoUrl" | "cafeName" | "program">) {
  const { data, info } = await sharp(await brandAsset(member), { limitInputPixels: 16_000_000 })
    .resize(640, 400, { fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(data);
  clearUniformLogoBackground(pixels, info.width, info.height);
  data.set(pixels);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).trim()
    .resize(640, 200, { fit: "contain", background: "#00000000" }).png().toBuffer();
}

const STAMP_LOGO_SIZE = 256;
const STAMP_LOGO_MARGIN = 12;

/** Square single-colour stencil of the logo for stamp slots. Whatever was
 * uploaded keeps its inner details and takes the colour of the stamp it sits in. */
export async function walletStampLogo(member: Pick<WalletMember, "logoUrl" | "cafeName" | "program">) {
  const key = walletArtifactKey(JSON.stringify([STAMP_LOGO_VERSION, walletBaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_URL, member.logoUrl, member.cafeName, member.program.cardBackground]));
  return cachedLogo(key, () => renderStampLogo(member));
}

async function renderStampLogo(member: Pick<WalletMember, "logoUrl" | "cafeName" | "program">) {
  const { data, info } = await sharp(await brandAsset(member), { limitInputPixels: 16_000_000 })
    .resize(384, 384, { fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixels = new Uint8ClampedArray(data);
  clearUniformLogoBackground(pixels, width, height);
  const mask = logoStencilMask(pixels, width, height);
  let left = width, top = height, right = -1, bottom = -1;
  for (let index = 0; index < mask.length; index++) {
    if (mask[index] < 12) continue;
    const x = index % width, y = (index - x) / width;
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  if (right < left || bottom < top) throw new Error("wallet_invalid_asset");
  const stencil = Buffer.alloc(width * height * 4, 255);
  for (let index = 0; index < mask.length; index++) stencil[index * 4 + 3] = mask[index];
  const inner = STAMP_LOGO_SIZE - STAMP_LOGO_MARGIN * 2;
  const transparent = { r: 255, g: 255, b: 255, alpha: 0 };
  return sharp(stencil, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize(inner, inner, { fit: "contain", background: transparent })
    .extend({ top: STAMP_LOGO_MARGIN, bottom: STAMP_LOGO_MARGIN, left: STAMP_LOGO_MARGIN, right: STAMP_LOGO_MARGIN, background: transparent })
    .png().toBuffer();
}

/** The stencil filled with one stamp colour, for artwork that cannot tint it itself. */
export async function walletStampLogoTint(member: Pick<WalletMember, "logoUrl" | "cafeName" | "program">, color: string, size = 132) {
  if (!/^#[\da-f]{6}$/i.test(color)) throw new Error("wallet_invalid_asset");
  const stencil = await walletStampLogo(member);
  return cachedLogo(walletArtifactKey(JSON.stringify(["tint", walletArtifactKey(stencil), color.toLowerCase(), size])), async () => {
    const alpha = await sharp(stencil).resize(size, size).extractChannel("alpha").raw().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 3, background: color } })
      .joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } }).png().toBuffer();
  });
}
