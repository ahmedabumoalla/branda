import { createBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import type { WalletMember } from "./types";
import { walletArtifactKey } from "./artifact-cache";
import { isMqas77Wallet, MQAS77_WALLET_COLORS, MQAS77_WALLET_VERSION, MQAS77_WALLET_NAME } from "./mqas77-design";
import { normalizeWalletLocations, walletLocationText } from "./branch-locations";
import { describePointsRewards, nextPointsReward } from "@/lib/loyalty/reward-path";

export function googleClassId(issuerId: string, cafeId: string, branchId?: string, english = false): string {
  if (english) return `${googleClassId(issuerId, cafeId, branchId)}_en`;
  if (branchId) return `${issuerId}.branda_${cafeId.replace(/-/g, "")}_branch_${branchId.replace(/-/g, "")}`;
  const override = process.env.GOOGLE_WALLET_RAST_CLASS_ID;
  if (override && cafeId === "3c697864-d371-4190-87ab-48f183cdf2d5") {
    if (!override.startsWith(`${issuerId}.`) || !/^[a-zA-Z0-9._-]{1,200}$/.test(override)) throw new Error("wallet_invalid_class_id");
    return override;
  }
  return `${issuerId}.branda_${cafeId.replace(/-/g, "")}`;
}

export function googleObjectId(issuerId: string, member: { card: Pick<WalletMember["card"], "id" | "cafeId"> }) {
  return `${issuerId}.branda_${member.card.cafeId.replace(/-/g, "")}_${member.card.id.replace(/-/g, "")}`;
}

export function walletColors(member: WalletMember) {
  if ((isMqas77Wallet(member.cafeSlug) && !member.program.autoLogo)) return MQAS77_WALLET_COLORS;
  if (member.cafeSlug === "rast" && !member.program.autoLogo) return { background: "#3b1420", foreground: "#f8f2e8", accent: "#d8b67a" };
  const hex = (value: string | undefined, fallback: string) => /^#[\da-f]{6}$/i.test(value ?? "") ? value! : fallback;
  return { background: hex(member.program.cardBackground, "#4a281d"), foreground: hex(member.program.cardForeground, "#fcf8f3"), accent: hex(member.program.cardAccent, "#d9a33f") };
}

export function walletLocations(member: WalletMember) {
  return walletAppleLocations(member).map(({ latitude, longitude }) => ({ latitude, longitude }));
}

export function walletAppleLocations(member: WalletMember) {
  const { latitude, longitude } = member.experience;
  const legacy = typeof latitude === "number" && typeof longitude === "number" ? [{ latitude, longitude }] : [];
  return normalizeWalletLocations(member.branchLocations ?? legacy).map(location => ({
    latitude: location.latitude, longitude: location.longitude,
    relevantText: location.nearbyMessage || (location.branchName
      ? walletLocationText(`${member.cafeName} — ${location.branchName}`)
      : walletLocationText(member.experience.nearbyMessage || member.cafeName)),
  }));
}

export function buildGoogleClass(member: WalletMember, issuerId: string, baseUrl: string) {
  const en = member.language === "en";
  const mqas77 = (isMqas77Wallet(member.cafeSlug) && !member.program.autoLogo);
  const points = member.program.pointsProgram;
  const logoVersion = mqas77 ? MQAS77_WALLET_VERSION : walletArtifactKey(JSON.stringify([member.cafeName, member.logoUrl, member.program.cardBackground]));
  return {
    id: googleClassId(issuerId, member.card.cafeId, member.branchId, member.language === "en"),
    issuerName: mqas77 ? MQAS77_WALLET_NAME : member.cafeName,
    localizedIssuerName: { defaultValue: { language: mqas77 ? "en" : member.language ?? "ar", value: mqas77 ? MQAS77_WALLET_NAME : member.cafeName } },
    programName: member.program.cardTitle,
    localizedProgramName: { defaultValue: { language: member.language ?? "ar", value: member.program.cardTitle } },
    programLogo: { sourceUri: { uri: `${baseUrl}/api/wallet/brand/${encodeURIComponent(member.cafeSlug)}/logo?v=${logoVersion}${member.branchId ? `&branch=${encodeURIComponent(member.branchId)}` : ""}${mqas77 ? "&wallet=mqas77" : ""}` }, contentDescription: { defaultValue: { language: member.language ?? "ar", value: member.cafeName } } },
    reviewStatus: "UNDER_REVIEW",
    multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
    hexBackgroundColor: walletColors(member).background,
    merchantLocations: walletLocations(member),
    textModulesData: [points?.mode === "points"
      ? { id: "reward", header: en ? "Earning points" : "احتساب النقاط", body: en ? `Earn ${points.rateQuantity} points for every SAR ${points.rateSar}` : `كل ${points.rateSar} ر.س تمنحك ${points.rateQuantity} نقطة` }
      : { id: "reward", header: member.program.rewardName, body: member.program.terms }, { id: "nearby", header: member.cafeName, body: member.experience.nearbyMessage }],
    // Explicitly clear previously published links when the class is updated.
    linksModuleData: { uris: [] },
  };
}

export function buildGoogleObject(member: WalletMember, issuerId: string, artworkUrl?: string) {
  const en = member.language === "en";
  const points = member.program.pointsProgram?.mode === "points" ? member.program.pointsProgram : null;
  const balance = member.card.availableLoyaltyPoints ?? 0;
  const next = points && nextPointsReward(points.milestones, balance);
  const affordable = points?.milestones.findLast(tier => tier.points <= balance);
  return {
    id: googleObjectId(issuerId, member), classId: googleClassId(issuerId, member.card.cafeId, member.branchId, member.language === "en"),
    state: member.program.enabled ? "ACTIVE" : "INACTIVE",
    barcode: { type: "QR_CODE", value: createBarndaksaQrPayload("loyalty-card", member.card.cardCode), alternateText: member.card.displayNumber || member.card.cardCode },
    loyaltyPoints: points ? { label: en ? "Points" : "رصيد النقاط", balance: { int: balance } } : (isMqas77Wallet(member.cafeSlug) && !member.program.autoLogo)
      ? { label: en ? "Rewards" : "مكافآت جاهزة", balance: { string: String(member.card.availableRewards) } }
      : { label: member.program.stampLabel, balance: { string: `${member.card.stampsInCycle} / ${member.program.purchasesRequired}` } },
    secondaryLoyaltyPoints: affordable ? { label: en ? "Ready to redeem" : "متاحة للاستبدال", balance: { string: `${affordable.reward} · ${affordable.points} ${en ? "points" : "نقطة"}` } }
      : next ? { label: next.reward, balance: { string: en ? `${next.points - balance} points to go` : `باقي ${next.points - balance} نقطة` } } : (isMqas77Wallet(member.cafeSlug) && !member.program.autoLogo)
      ? { label: en ? "Stamps to reward" : "أختام للمكافأة", balance: { int: Math.max(0, member.program.purchasesRequired - member.card.stampsInCycle) } }
      : { label: member.language === "en" ? "Rewards" : "المكافآت المتاحة", balance: { int: member.card.availableRewards } },
    // PATCH must clear this card's points-only module when the program returns to stamps.
    ...(member.program.pointsProgram ? { textModulesData: points
      ? [{ id: "pointsPath", header: en ? "Reward milestones" : "مسار المكافآت", body: describePointsRewards(points.milestones, balance, member.language) }]
      : [] } : {}),
    merchantLocations: walletLocations(member),
    hexBackgroundColor: walletColors(member).background,
    ...(artworkUrl ? { heroImage: { sourceUri: { uri: artworkUrl }, contentDescription: { defaultValue: { language: member.language ?? "ar", value: points ? (en ? "Points reward milestones" : "مسار مكافآت النقاط") : member.program.stampLabel } } } } : {}),
  };
}
