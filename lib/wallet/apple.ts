import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { PKPass, PassType } from "passkit-generator";
import { createBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { describePointsRewards, nextPointsReward, POINTS_MAP_VERSION } from "@/lib/loyalty/reward-path";
import { appleConfig } from "./config";
import { WALLET_ART_VERSION, walletStampArtwork } from "./art";
import { walletColors, walletAppleLocations } from "./payload";
import type { WalletMember } from "./types";
import { walletBrandLogo } from "./logo";
import { createWalletArtifactCache, walletArtifactKey } from "./artifact-cache";
import { isMqas77Wallet, MQAS77_WALLET_VERSION, MQAS77_WALLET_NAME } from "./mqas77-design";
import { mqas77Emblem } from "./mqas77-assets";
import { APPLE_ICON_SIZE, APPLE_ICON_VERSION, appleIconBackground } from "./apple-icon";
export { walletBrandLogo, walletStampLogo } from "./logo";

export { walletStampArtwork } from "./art";

const cachedBrandImage = createWalletArtifactCache(8 * 1024 * 1024, 192, 300_000);

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

export async function issueApplePass(member: WalletMember, options: { standaloneSample?: boolean } = {}) {
  if (!member.program.enabled || !member.program.appleWalletEnabled) throw new Error("wallet_disabled");
  const config = appleConfig();
  const colors = walletColors(member);
  const mqas77 = (isMqas77Wallet(member.cafeSlug) && !member.program.autoLogo);
  const asset = mqas77 ? await mqas77Emblem() : await walletBrandLogo(member);
  const iconBackground = mqas77 ? colors.background : await appleIconBackground(asset, colors.background, colors.foreground);
  const assetKey = walletArtifactKey(asset);
  const image = sharp(asset, { limitInputPixels: 16_000_000 });
  const assets: Record<string, Buffer> = {};
  await Promise.all(([1, 2, 3] as const).map(async scale => {
    const suffix = scale === 1 ? "" : `@${scale}x`;
    const [icon, logo, strip] = await Promise.all([
      cachedBrandImage(`${assetKey}:${iconBackground}:${scale}:${APPLE_ICON_VERSION}`, () => image.clone().trim().resize(APPLE_ICON_SIZE * scale, APPLE_ICON_SIZE * scale, { fit: "contain", background: iconBackground }).flatten({ background: iconBackground }).png().toBuffer()),
      // Preserve the uploaded brand colors and transparent background.
      cachedBrandImage(`${assetKey}:${scale}:logo:original-colors-v1`, async () => {
        if (mqas77) return image.clone().resize(40 * scale, 40 * scale, { fit: "contain", background: "#00000000" }).png().toBuffer();
        return image.clone().trim().resize(136 * scale, 40 * scale, { fit: "inside" }).png().toBuffer();
      }),
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
    logoText: mqas77 ? MQAS77_WALLET_NAME : member.cafeName,
    ...(mqas77 ? { labelColor: rgb("#fff4df") } : {}),
    userInfo: { artworkVersion: member.program.pointsProgram?.mode === "points" ? POINTS_MAP_VERSION : mqas77 ? MQAS77_WALLET_VERSION : `${WALLET_ART_VERSION}:apple-burgundy-v1`, iconVersion: APPLE_ICON_VERSION },
    ...(options.standaloneSample ? {} : { webServiceURL: `${config.baseUrl}/api/wallet/apple`, authenticationToken: appleAuthToken(member.card.cardCode) }),
  });
  const style = new PassType("storeCard");
  pass.types.push(style);
  const en = member.language === "en";
  const points = member.program.pointsProgram;
  if (points?.mode === "points") {
    const balance = member.card.availableLoyaltyPoints ?? 0;
    const next = nextPointsReward(points.milestones, balance);
    const affordable = points.milestones.findLast(tier => tier.points <= balance);
    style.headerFields.push({ key: "points", label: en ? "Points balance" : "رصيد النقاط", value: balance, changeMessage: en ? "Your points balance is now %@" : "رصيد نقاطك الآن %@" });
    if (affordable) {
      style.secondaryFields.push({ key: "availableReward", label: en ? "Ready to redeem" : "متاحة للاستبدال", value: affordable.reward });
      style.auxiliaryFields.push({ key: "redemptionCost", label: en ? "Redemption cost" : "تكلفة الاستبدال", value: en ? `${affordable.points} points` : `${affordable.points} نقطة` });
    }
    if (next) style.secondaryFields.push({ key: "nextReward", label: en ? "Next reward" : "المكافأة القادمة", value: next.reward });
    if (next) style.auxiliaryFields.push({ key: "pointsRemaining", label: en ? "Points to go" : "نقاط متبقية", value: next.points - balance });
    style.backFields.push({ key: "rewardPath", label: en ? "Reward milestones" : "مسار المكافآت", value: describePointsRewards(points.milestones, balance, member.language) });
    if (member.card.availableRewards > 0) style.backFields.push({ key: "vouchers", label: en ? "Available reward vouchers" : "قسائم المكافآت المتاحة", value: member.card.availableRewards });
  } else {
    style.headerFields.push({ key: "stamps", label: member.program.stampLabel, value: `${member.card.stampsInCycle} / ${member.program.purchasesRequired}`, changeMessage: en ? "Your stamp balance is now %@" : "رصيد الأختام الآن %@" });
    const remaining = { key: "remaining", label: en ? "Stamps to reward" : "أختام للمكافأة", value: Math.max(0, member.program.purchasesRequired - member.card.stampsInCycle) };
    const rewards = { key: "rewards", label: en ? "Available rewards" : "مكافآت جاهزة", value: member.card.availableRewards, changeMessage: en ? "Available rewards: %@" : "مكافآتك المتاحة %@" };
    style.secondaryFields.push(mqas77 ? rewards : remaining);
    style.auxiliaryFields.push(mqas77 ? remaining : rewards);
    style.backFields.push({ key: "reward", label: en ? "Your reward" : "مكافأتك", value: member.program.rewardName });
  }
  style.backFields.push({ key: "terms", label: en ? "Terms" : "الشروط", value: member.program.terms });
  if (points?.mode !== "points") style.backFields.push({ key: "validity", label: en ? "Reward validity" : "صلاحية المكافأة", value: en ? `${member.experience.rewardValidityDays} days from issue` : `${member.experience.rewardValidityDays} يوماً من إصدار المكافأة` });
  style.backFields.push({ key: "offer", label: member.cafeName, value: [member.experience.offerTitle, member.experience.offerBody].filter(Boolean).join("\n"), changeMessage: "%@" });
  pass.setBarcodes({ format: "PKBarcodeFormatQR", message: createBarndaksaQrPayload("loyalty-card", member.card.cardCode), messageEncoding: "iso-8859-1", altText: member.card.displayNumber || member.card.cardCode });
  // setLocations replaces the array; pass all branch locations in one call
  pass.setLocations(...walletAppleLocations(member));
  return pass.getAsBuffer();
}

export { pushAppleDevice } from "./apple-push";
