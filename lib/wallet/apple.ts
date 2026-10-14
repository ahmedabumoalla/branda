import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { PKPass, PassType } from "passkit-generator";
import { createBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { appleConfig } from "./config";
import { WALLET_ART_VERSION, walletStampArtwork } from "./art";
import { walletColors, walletLocations } from "./payload";
import type { WalletMember } from "./types";
import { walletBrandLogo } from "./logo";
export { walletBrandLogo } from "./logo";

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


function rgb(hex: string) {
  return `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
}

export async function issueApplePass(member: WalletMember) {
  if (!member.program.enabled || !member.program.appleWalletEnabled) throw new Error("wallet_disabled");
  const config = appleConfig();
  const colors = walletColors(member);
  const asset = await walletBrandLogo(member);
  const image = sharp(asset, { limitInputPixels: 16_000_000 });
  const assets: Record<string, Buffer> = {};
  await Promise.all(([1, 2, 3] as const).map(async scale => {
    const suffix = scale === 1 ? "" : `@${scale}x`;
    const logoMask = await image.clone().trim().resize(136 * scale, 40 * scale, { fit: "inside" }).ensureAlpha().png().toBuffer({ resolveWithObject: true });
    const [icon, logo, strip] = await Promise.all([
      image.clone().trim().resize(29 * scale, 29 * scale, { fit: "contain", background: colors.foreground }).flatten({ background: colors.foreground }).png().toBuffer(),
      // Preserve the mark's alpha silhouette with light ink on the dark pass.
      sharp({ create: { width: logoMask.info.width, height: logoMask.info.height, channels: 4, background: colors.foreground } })
        .composite([{ input: logoMask.data, blend: "dest-in" }]).png().toBuffer(),
      walletStampArtwork(member, scale, true),
    ]);
    assets[`icon${suffix}.png`] = icon;
    assets[`logo${suffix}.png`] = logo;
    assets[`strip${suffix}.png`] = strip;
  }));
  const pass = new PKPass(assets, { wwdr: config.wwdr, signerCert: config.signerCert, signerKey: config.signerKey, signerKeyPassphrase: config.signerKeyPassphrase }, {
    formatVersion: 1, passTypeIdentifier: config.passTypeIdentifier, teamIdentifier: config.teamIdentifier,
    serialNumber: member.card.cardCode, organizationName: member.cafeName, description: `${member.cafeName} - ${member.program.cardTitle}`,
    backgroundColor: rgb(colors.background), foregroundColor: rgb(colors.foreground), labelColor: rgb(colors.foreground), sharingProhibited: true, suppressStripShine: true,
    userInfo: { artworkVersion: `${WALLET_ART_VERSION}:apple-burgundy-v1` },
    webServiceURL: `${config.baseUrl}/api/wallet/apple`, authenticationToken: appleAuthToken(member.card.cardCode),
  });
  const style = new PassType("storeCard");
  pass.types.push(style);
  style.headerFields.push({ key: "stamps", label: member.program.stampLabel, value: `${member.card.stampsInCycle} / ${member.program.purchasesRequired}`, changeMessage: "رصيد الأختام الآن %@" });
  style.secondaryFields.push({ key: "remaining", label: "أختام للمكافأة", value: Math.max(0, member.program.purchasesRequired - member.card.stampsInCycle) });
  style.auxiliaryFields.push({ key: "rewards", label: "مكافآت جاهزة", value: member.card.availableRewards, changeMessage: "مكافآتك المتاحة %@" });
  style.backFields.push({ key: "reward", label: "مكافأتك", value: member.program.rewardName }, { key: "terms", label: "الشروط", value: member.program.terms }, { key: "validity", label: "صلاحية المكافأة", value: `${member.experience.rewardValidityDays} يوماً من إصدار المكافأة` });
  style.backFields.push({ key: "offer", label: member.cafeName, value: [member.experience.offerTitle, member.experience.offerBody].filter(Boolean).join("\n"), changeMessage: "%@" });
  pass.setBarcodes({ format: "PKBarcodeFormatQR", message: createBarndaksaQrPayload("loyalty-card", member.card.cardCode), messageEncoding: "iso-8859-1", altText: member.card.displayNumber || member.card.cardCode });
  for (const location of walletLocations(member)) pass.setLocations({ ...location, relevantText: member.experience.nearbyMessage || member.cafeName });
  return pass.getAsBuffer();
}

export { pushAppleDevice } from "./apple-push";
