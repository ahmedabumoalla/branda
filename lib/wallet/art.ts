import "server-only";
import { stampPaths } from "@/lib/loyalty/stamp-style";
import { brandStampStyle } from "@/lib/loyalty/brand-stamp-artwork";
import { walletBrandLogo } from "./logo";
import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { walletBaseUrl } from "./config";
import { walletColors } from "./payload";
import type { WalletMember } from "./types";
import { createWalletArtifactCache, walletArtifactKey } from "./artifact-cache";
import { isMqas77Wallet, MQAS77_WALLET_VERSION, mqas77StampSvg } from "./mqas77-design";
import { mqas77Emblem } from "./mqas77-assets";

const cachedArtwork = createWalletArtifactCache(12 * 1024 * 1024, 256, 300_000);

export const WALLET_ART_VERSION = "2026-11-08-uniform-stamps-v3";

export function walletArtToken(cardId: string) {
  const secret = process.env.WALLET_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("wallet_not_configured");
  return createHmac("sha256", secret).update(`wallet-stamp-art:v1:${cardId}`).digest("hex");
}

export function verifyWalletArtToken(cardId: string, token: string) {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(cardId) || !/^[a-f0-9]{64}$/i.test(token)) return false;
    return timingSafeEqual(Buffer.from(token), Buffer.from(walletArtToken(cardId)));
  } catch { return false; }
}

export function walletArtUrl(member: WalletMember) {
  const appearance = walletArtifactKey(JSON.stringify([walletColors(member), member.program.purchasesRequired, member.logoUrl, member.cafeName, ...(isMqas77Wallet(member.cafeSlug) ? [MQAS77_WALLET_VERSION] : [])]));
  return `${walletBaseUrl()}/api/wallet/art/${encodeURIComponent(member.card.id)}/${walletArtToken(member.card.id)}?v=${encodeURIComponent(`${WALLET_ART_VERSION}:${brandStampStyle(member.cafeSlug, member.program.stampStyle)}:${member.card.updatedAt}:${appearance}`)}`;
}

// The artwork supplements native, accessible balance fields. Never bake text or
// a barcode into it: Wallet can crop strip images on smaller devices and watches.

export function walletStampSvg(member: WalletMember, scale: 1 | 2 | 3 = 2, dark = false, brandLogoDataUrl?: string) {
  const colors = walletColors(member);
  const required = Math.max(1, Math.min(100, Math.trunc(member.program.purchasesRequired) || 1));
  const earned = Math.max(0, Math.min(required, Math.trunc(member.card.stampsInCycle) || 0));
  const paper = dark ? colors.background : colors.foreground;
  const ink = dark ? colors.foreground : colors.background;
  const icon = (content: string, x: number, y: number, size: number, color: string) => `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${color}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${content}</g>`;
  const selected = brandStampStyle(member.cafeSlug, member.program.stampStyle);
  const stampIcon = `<path d="${stampPaths[selected === "brand" ? "ceramic" : selected]}"/>`;
  const stampAt = (x: number, y: number, size: number, color: string) => selected === "brand" && brandLogoDataUrl
    ? `<image x="${x}" y="${y}" width="${size}" height="${size}" href="${brandLogoDataUrl}"/>`
    : icon(stampIcon, x, y, size, color);
  let stamps: string;

  if (required > 30) {
    // Large programs use an honest proportional progress ring rather than
    // silently truncating their stamp target or rendering unreadably tiny icons.
    const circumference = 2 * Math.PI * 43;
    stamps = `<circle cx="187.5" cy="72" r="43" fill="none" stroke="${ink}" stroke-opacity=".14" stroke-width="4"/><circle cx="187.5" cy="72" r="43" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${circumference * earned / required} ${circumference}" transform="rotate(-90 187.5 72)"/>${stampAt(165.5, 50, 44, ink)}`;
  } else {
    const columns = required <= 5 ? required : required <= 10 ? Math.ceil(required / 2) : Math.min(10, Math.ceil(required / 3));
    const rows = Math.ceil(required / columns);
    const cell = Math.min(54, (331 - (columns - 1) * 10) / columns, (120 - (rows - 1) * 10) / rows);
    const top = (144 - (cell * rows + (rows - 1) * 10)) / 2;
    stamps = Array.from({ length: required }, (_, index) => {
      const row = Math.floor(index / columns);
      const rowCount = Math.min(columns, required - row * columns);
      const rowWidth = rowCount * cell + (rowCount - 1) * 10;
      const x = (375 + rowWidth) / 2 - cell - (index % columns) * (cell + 10);
      const y = top + row * (cell + 10);
      const filled = index < earned;
      const glyph = Math.min(29, cell * .6);
      const frame = `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${Math.min(14, cell * .25)}" fill="${filled ? ink : paper}" stroke="${ink}" stroke-width="1"${filled ? "" : ' stroke-dasharray="2 3"'}/>`;
      const check = filled && cell >= 40 ? `<path d="m${x + cell - 13} ${y + 9} 2 2 4-4" fill="none" stroke="${paper}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` : "";
      const stamp = stampAt(x + (cell - glyph) / 2, y + (cell - glyph) / 2, glyph, filled ? paper : ink);
      return frame + stamp + check;
    }).join("");
  }

  return `<svg width="${375 * scale}" height="${144 * scale}" viewBox="0 0 375 144" xmlns="http://www.w3.org/2000/svg"><rect width="375" height="144" fill="${paper}"/>${stamps}</svg>`;
}

export async function walletStampArtwork(member: WalletMember, scale: 1 | 2 | 3 = 2, dark = false) {
  if (isMqas77Wallet(member.cafeSlug) && member.program.purchasesRequired <= 10) {
    const emblem = `data:image/png;base64,${(await mqas77Emblem()).toString("base64")}`;
    const artwork = mqas77StampSvg(member, emblem, scale, dark);
    return cachedArtwork(walletArtifactKey(artwork), () => sharp(Buffer.from(artwork)).png().toBuffer());
  }
  const logo = member.program.stampStyle === "brand" && member.logoUrl
    ? `data:image/png;base64,${(await walletBrandLogo(member)).toString("base64")}` : undefined;
  const svg = walletStampSvg(member, scale, dark, logo);
  return cachedArtwork(walletArtifactKey(svg), () => sharp(Buffer.from(svg)).png().toBuffer());
}
