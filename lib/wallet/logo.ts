import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { walletBaseUrl } from "./config";
import type { WalletMember } from "./types";
import { clearLogoBackdrop } from "@/lib/loyalty/logo-alpha";

async function brandAsset(member: Pick<WalletMember, "logoUrl" | "cafeName" | "program">) {
  if (!member.logoUrl) {
    const color = /^#[\da-f]{6}$/i.test(member.program.cardBackground) ? member.program.cardBackground : "#3b1420";
    const title = member.cafeName.slice(0, 80).replace(/[&<>"']/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[value]!);
    return Buffer.from(`<svg width="640" height="200" xmlns="http://www.w3.org/2000/svg"><text x="320" y="125" text-anchor="middle" font-size="72" fill="${color}">${title}</text></svg>`);
  }
  const baseUrl = walletBaseUrl();
  const source = member.logoUrl;
  if (source.startsWith("data:")) {
    const match = /^data:image\/(?:png|jpeg|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(source);
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
  const { data, info } = await sharp(await brandAsset(member), { limitInputPixels: 16_000_000 })
    .resize(640, 400, { fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  clearLogoBackdrop(data, info.width, info.height);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).trim()
    .resize(640, 200, { fit: "contain", background: "#00000000" }).png().toBuffer();
}
