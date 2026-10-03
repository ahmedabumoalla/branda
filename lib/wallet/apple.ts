import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { connect } from "node:http2";
import sharp from "sharp";
import { PKPass, PassType } from "passkit-generator";
import { createBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { appleConfig, walletBaseUrl } from "./config";
import { walletColors, walletLocations } from "./payload";
import type { WalletMember } from "./types";

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
    const color = /^#[\da-f]{6}$/i.test(member.program.cardForeground) ? member.program.cardForeground : "#fff8eb";
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

export async function walletStampArtwork(member: WalletMember) {
  const colors = walletColors(member);
  const required = Math.min(30, Math.max(1, member.program.purchasesRequired));
  const columns = Math.min(10, required);
  const rows = Math.ceil(required / columns);
  const gap = 330 / columns;
  const radius = Math.min(13, gap * 0.32);
  const circles = Array.from({ length: required }, (_, index) => `<circle cx="${350 - (index % columns) * gap}" cy="${68 + Math.floor(index / columns) * Math.min(30, 65 / rows)}" r="${Math.min(radius, 27 / rows)}" fill="${index < member.card.stampsInCycle ? colors.background : "none"}" stroke="${colors.background}" stroke-width="1.5"/>`).join("");
  const background = Buffer.from(`<svg width="750" height="288" viewBox="0 0 375 144" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${colors.foreground}"/><path d="M25 48 H350" stroke="${colors.background}" stroke-opacity=".2"/>${circles}</svg>`);
  const logo = await sharp(await readFile(path.join(process.cwd(), "public/menu-logos/rast-wordmark-transparent-v2.png"))).resize(190, 72, { fit: "inside" }).png().toBuffer();
  return sharp(background).composite([{ input: logo, left: 510, top: 12 }]).png().toBuffer();
}

export async function issueApplePass(member: WalletMember) {
  if (member.cafeSlug !== "rast" || !member.program.enabled || !member.program.appleWalletEnabled) throw new Error("wallet_disabled");
  const config = appleConfig();
  const colors = walletColors(member);
  const asset = await brandAsset(member);
  const image = sharp(asset, { limitInputPixels: 16_000_000 });
  const [icon, icon2, logo, logo2] = await Promise.all([
    image.clone().resize(29, 29, { fit: "contain", background: colors.foreground }).flatten({ background: colors.foreground }).png().toBuffer(),
    image.clone().resize(58, 58, { fit: "contain", background: colors.foreground }).flatten({ background: colors.foreground }).png().toBuffer(),
    image.clone().resize(160, 50, { fit: "contain", background: colors.foreground }).flatten({ background: colors.foreground }).png().toBuffer(),
    image.clone().resize(320, 100, { fit: "contain", background: colors.foreground }).flatten({ background: colors.foreground }).png().toBuffer(),
  ]);
  const strip = await walletStampArtwork(member);
  const pass = new PKPass({ "icon.png": icon, "icon@2x.png": icon2, "logo.png": logo, "logo@2x.png": logo2, "strip@2x.png": strip }, { wwdr: config.wwdr, signerCert: config.signerCert, signerKey: config.signerKey, signerKeyPassphrase: config.signerKeyPassphrase }, {
    formatVersion: 1, passTypeIdentifier: config.passTypeIdentifier, teamIdentifier: config.teamIdentifier,
    serialNumber: member.card.cardCode, organizationName: member.cafeName, description: `${member.cafeName} - ${member.program.cardTitle}`,
    logoText: member.cafeName, backgroundColor: rgb(colors.background), foregroundColor: rgb(colors.foreground), labelColor: rgb(colors.foreground), sharingProhibited: true, suppressStripShine: true,
    webServiceURL: `${config.baseUrl}/api/wallet/apple`, authenticationToken: appleAuthToken(member.card.cardCode),
  });
  const style = new PassType("storeCard");
  pass.types.push(style);
  style.headerFields.push({ key: "stamps", label: member.program.stampLabel, value: `${member.card.stampsInCycle} / ${member.program.purchasesRequired}`, changeMessage: "رصيد الأختام الآن %@" });
  style.secondaryFields.push({ key: "reward", label: "مكافأتك", value: member.program.rewardName });
  style.auxiliaryFields.push({ key: "rewards", label: "المكافآت المتاحة", value: member.card.availableRewards, changeMessage: "مكافآتك المتاحة %@" });
  style.backFields.push({ key: "terms", label: "الشروط", value: member.program.terms }, { key: "validity", label: "صلاحية المكافأة", value: `${member.experience.rewardValidityDays} يوماً من إصدار المكافأة` });
  style.backFields.push({ key: "offer", label: member.cafeName, value: [member.experience.offerTitle, member.experience.offerBody].filter(Boolean).join("\n"), changeMessage: "%@" });
  pass.setBarcodes({ format: "PKBarcodeFormatQR", message: createBarndaksaQrPayload("loyalty-card", member.card.cardCode), messageEncoding: "iso-8859-1", altText: member.card.cardCode });
  for (const location of walletLocations(member)) pass.setLocations({ ...location, relevantText: member.experience.nearbyMessage || member.cafeName });
  return pass.getAsBuffer();
}

export async function pushAppleDevice(pushToken: string) {
  if (!/^[a-f0-9]{32,256}$/i.test(pushToken)) throw new Error("apple_invalid_push_token");
  const config = appleConfig();
  return new Promise<void>((resolve, reject) => {
    const client = connect("https://api.push.apple.com", { cert: config.signerCert, key: config.signerKey, passphrase: config.signerKeyPassphrase });
    let settled = false;
    const finish = (error?: Error) => { if (settled) return; settled = true; client.destroy(); if (error) reject(error); else resolve(); };
    client.on("error", () => finish(new Error("apple_push_connection_failed")));
    client.setTimeout(15000, () => finish(new Error("apple_push_timeout")));
    // Wallet expects an empty payload; this is a pass update, not an app background notification.
    const request = client.request({ ":method": "POST", ":path": `/3/device/${pushToken}`, "apns-topic": config.passTypeIdentifier, "apns-priority": "5", "content-type": "application/json" });
    request.on("response", headers => { if (headers[":status"] !== 200) finish(new Error(`apple_push_${headers[":status"]}`)); });
    request.on("error", () => finish(new Error("apple_push_request_failed")));
    request.on("end", () => finish());
    request.resume();
    request.end("{}");
  });
}
