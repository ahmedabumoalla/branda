import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PKPass, PassType } from "passkit-generator";
import { createBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { appleConfig, walletBaseUrl } from "./config";
import { WALLET_ART_VERSION, walletStampArtwork } from "./art";
import { walletColors, walletLocations } from "./payload";
import type { WalletMember } from "./types";

export { walletStampArtwork } from "./art";

export function appleAuthToken(serial: string) {
  const { secret, passTypeIdentifier } = appleConfig();
  return createHmac("sha256", secret).update(`${passTypeIdentifier}:${serial}`).digest("hex");
}

export function verifyAppleAuth(request: Request, passType: string, serial: string) {
  try {
    if (passType !== appleConfig().passTypeIdentifier || !/^[A-Za-z0-9_-]{1,128}$/.test(serial)) return false;
    const header = request.headers.get("authorization");
    if (!header?.startsWith("ApplePass ")) return false;
    const supplied = header.slice(10);
    const expected = appleAuthToken(serial);
    return supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  } catch { return false; }
}

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
  return sharp(await brandAsset(member), { limitInputPixels: 16_000_000 }).resize(640, 200, { fit: "contain", background: "#f8f2e8" }).flatten({ background: "#f8f2e8" }).png().toBuffer();
}

function rgb(hex: string) {
  return `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
}

export async function issueApplePass(member: WalletMember) {
  if (member.cafeSlug !== "rast" || !member.program.enabled || !member.program.appleWalletEnabled) throw new Error("wallet_disabled");
  const config = appleConfig();
  const colors = walletColors(member);
  const asset = await brandAsset(member);
  const image = sharp(asset, { limitInputPixels: 16_000_000 });
  const assets: Record<string, Buffer> = {};
  await Promise.all(([1, 2, 3] as const).map(async scale => {
    const suffix = scale === 1 ? "" : `@${scale}x`;
    const [icon, logo, strip] = await Promise.all([
      image.clone().trim().resize(29 * scale, 29 * scale, { fit: "contain", background: colors.foreground }).flatten({ background: colors.foreground }).png().toBuffer(),
      image.clone().trim().resize(136 * scale, 40 * scale, { fit: "inside" }).png().toBuffer(),
      walletStampArtwork(member, scale),
    ]);
    assets[`icon${suffix}.png`] = icon;
    assets[`logo${suffix}.png`] = logo;
    assets[`strip${suffix}.png`] = strip;
  }));
  const pass = new PKPass(assets, { wwdr: config.wwdr, signerCert: config.signerCert, signerKey: config.signerKey, signerKeyPassphrase: config.signerKeyPassphrase }, {
    formatVersion: 1, passTypeIdentifier: config.passTypeIdentifier, teamIdentifier: config.teamIdentifier,
    serialNumber: member.card.cardCode, organizationName: member.cafeName, description: `${member.cafeName} - ${member.program.cardTitle}`,
    backgroundColor: rgb(colors.foreground), foregroundColor: rgb(colors.background), labelColor: rgb(colors.background), sharingProhibited: true, suppressStripShine: true,
    userInfo: { artworkVersion: WALLET_ART_VERSION },
    webServiceURL: `${config.baseUrl}/api/wallet/apple`, authenticationToken: appleAuthToken(member.card.cardCode),
  });
  const style = new PassType("storeCard");
  pass.types.push(style);
  style.headerFields.push({ key: "stamps", label: member.program.stampLabel, value: `${member.card.stampsInCycle} / ${member.program.purchasesRequired}`, changeMessage: "رصيد الأختام الآن %@" });
  style.secondaryFields.push({ key: "remaining", label: "أختام للمكافأة", value: Math.max(0, member.program.purchasesRequired - member.card.stampsInCycle) });
  style.auxiliaryFields.push({ key: "rewards", label: "مكافآت جاهزة", value: member.card.availableRewards, changeMessage: "مكافآتك المتاحة %@" });
  style.backFields.push({ key: "reward", label: "مكافأتك", value: member.program.rewardName }, { key: "terms", label: "الشروط", value: member.program.terms }, { key: "validity", label: "صلاحية المكافأة", value: `${member.experience.rewardValidityDays} يوماً من إصدار المكافأة` });
  style.backFields.push({ key: "offer", label: member.cafeName, value: [member.experience.offerTitle, member.experience.offerBody].filter(Boolean).join("\n"), changeMessage: "%@" });
  pass.setBarcodes({ format: "PKBarcodeFormatQR", message: createBarndaksaQrPayload("loyalty-card", member.card.cardCode), messageEncoding: "iso-8859-1", altText: member.card.cardCode });
  for (const location of walletLocations(member)) pass.setLocations({ ...location, relevantText: member.experience.nearbyMessage || member.cafeName });
  return pass.getAsBuffer();
}

export { pushAppleDevice } from "./apple-push";
