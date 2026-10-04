import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { walletBaseUrl } from "./config";
import { walletColors } from "./payload";
import type { WalletMember } from "./types";

export const WALLET_ART_VERSION = "2026-10-04-stamp-icons-v2";

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
  return `${walletBaseUrl()}/api/wallet/art/${encodeURIComponent(member.card.id)}/${walletArtToken(member.card.id)}?v=${encodeURIComponent(`${WALLET_ART_VERSION}:${member.card.updatedAt}`)}`;
}

// The artwork supplements native, accessible balance fields. Never bake text or
// a barcode into it: Wallet can crop strip images on smaller devices and watches.
const coffeeIcon = '<path d="M6 8h11v7a4 4 0 0 1-4 4h-3a4 4 0 0 1-4-4V8Zm11 1h1.5a3 3 0 0 1 0 6H17M4 22h16M9 3v2m5-2v2"/>';
const giftIcon = '<path d="M5 11h14v10H5V11ZM3 7h18v4H3V7Zm9 0v14m0-14C6 7 5 5 6.5 3.5S12 3 12 7Zm0 0c6 0 7-2 5.5-3.5S12 3 12 7Z"/>';

export function walletStampSvg(member: WalletMember, scale: 1 | 2 | 3 = 2) {
  const colors = walletColors(member);
  const required = Math.max(1, Math.min(100, Math.trunc(member.program.purchasesRequired) || 1));
  const earned = Math.max(0, Math.min(required, Math.trunc(member.card.stampsInCycle) || 0));
  const paper = colors.foreground;
  const ink = colors.background;
  const icon = (content: string, x: number, y: number, size: number, color: string) => `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${color}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${content}</g>`;
  let stamps: string;

  if (required > 30) {
    // Large programs use an honest proportional progress ring rather than
    // silently truncating their stamp target or rendering unreadably tiny icons.
    const circumference = 2 * Math.PI * 43;
    stamps = `<circle cx="187.5" cy="72" r="43" fill="none" stroke="${ink}" stroke-opacity=".14" stroke-width="4"/><circle cx="187.5" cy="72" r="43" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${circumference * earned / required} ${circumference}" transform="rotate(-90 187.5 72)"/>${icon(giftIcon, 165.5, 50, 44, ink)}`;
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
      const last = index === required - 1;
      const glyph = Math.min(29, cell * .6);
      const frame = `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${Math.min(14, cell * .25)}" fill="${filled ? ink : paper}" stroke="${ink}" stroke-width="${last ? 1.5 : 1}"${filled ? "" : ' stroke-dasharray="2 3"'}/>`;
      const check = filled && cell >= 40 ? `<path d="m${x + cell - 13} ${y + 9} 2 2 4-4" fill="none" stroke="${paper}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` : "";
      return frame + icon(last ? giftIcon : coffeeIcon, x + (cell - glyph) / 2, y + (cell - glyph) / 2, glyph, filled ? paper : ink) + check;
    }).join("");
  }

  return `<svg width="${375 * scale}" height="${144 * scale}" viewBox="0 0 375 144" xmlns="http://www.w3.org/2000/svg"><rect width="375" height="144" fill="${paper}"/>${stamps}</svg>`;
}

export async function walletStampArtwork(member: WalletMember, scale: 1 | 2 | 3 = 2) {
  return sharp(Buffer.from(walletStampSvg(member, scale))).png().toBuffer();
}
