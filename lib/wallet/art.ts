import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { walletBaseUrl } from "./config";
import type { WalletMember } from "./types";

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
  return `${walletBaseUrl()}/api/wallet/art/${encodeURIComponent(member.card.id)}/${walletArtToken(member.card.id)}?v=${encodeURIComponent(member.card.updatedAt)}`;
}
