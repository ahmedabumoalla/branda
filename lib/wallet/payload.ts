import { createBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import type { WalletMember } from "./types";

export function googleClassId(issuerId: string, cafeId: string) {
  const override = process.env.GOOGLE_WALLET_RAST_CLASS_ID;
  if (override && cafeId === "3c697864-d371-4190-87ab-48f183cdf2d5") {
    if (!override.startsWith(`${issuerId}.`) || !/^[a-zA-Z0-9._-]{1,200}$/.test(override)) throw new Error("wallet_invalid_class_id");
    return override;
  }
  return `${issuerId}.branda_${cafeId.replace(/-/g, "")}`;
}

export function googleObjectId(issuerId: string, member: WalletMember) {
  return `${issuerId}.branda_${member.card.cafeId.replace(/-/g, "")}_${member.card.id.replace(/-/g, "")}`;
}

export function walletColors(member: WalletMember) {
  if (member.cafeSlug === "rast") return { background: "#3b1420", foreground: "#f8f2e8", accent: "#d8b67a" };
  const design = member.program.cardDesign;
  const hex = (value: string | undefined, fallback: string) => /^#[\da-f]{6}$/i.test(value ?? "") ? value! : fallback;
  return { background: hex(design?.cardBackground ?? member.program.cardBackground, "#52212b"), foreground: hex(design?.cardForeground ?? member.program.cardForeground, "#fff8eb"), accent: hex(design?.cardAccent ?? member.program.cardAccent, "#d8b67a") };
}

export function walletLocations(member: WalletMember) {
  const { latitude, longitude } = member.experience;
  if (latitude === null || longitude === null || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
  return [{ latitude, longitude }];
}

export function buildGoogleClass(member: WalletMember, issuerId: string, baseUrl: string) {
  return {
    id: googleClassId(issuerId, member.card.cafeId),
    issuerName: member.cafeName,
    localizedIssuerName: { defaultValue: { language: "ar", value: member.cafeName } },
    programName: member.program.cardTitle,
    localizedProgramName: { defaultValue: { language: "ar", value: member.program.cardTitle } },
    programLogo: { sourceUri: { uri: `${baseUrl}/api/wallet/brand/${encodeURIComponent(member.cafeSlug)}/logo?v=${encodeURIComponent(member.cafeName)}` }, contentDescription: { defaultValue: { language: "ar", value: member.cafeName } } },
    reviewStatus: "UNDER_REVIEW",
    multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
    hexBackgroundColor: walletColors(member).background,
    merchantLocations: walletLocations(member),
    textModulesData: [{ id: "reward", header: member.program.rewardName, body: member.program.terms }, { id: "nearby", header: member.cafeName, body: member.experience.nearbyMessage }],
    linksModuleData: { uris: [{ id: "brand", uri: `${baseUrl}/menu/${encodeURIComponent(member.cafeSlug)}`, description: member.cafeName }] },
  };
}

export function buildGoogleObject(member: WalletMember, issuerId: string, artworkUrl?: string) {
  return {
    id: googleObjectId(issuerId, member), classId: googleClassId(issuerId, member.card.cafeId),
    state: member.program.enabled ? "ACTIVE" : "INACTIVE",
    barcode: { type: "QR_CODE", value: createBarndaksaQrPayload("loyalty-card", member.card.cardCode), alternateText: member.card.cardCode },
    loyaltyPoints: { label: member.program.stampLabel, balance: { string: `${member.card.stampsInCycle} / ${member.program.purchasesRequired}` } },
    secondaryLoyaltyPoints: { label: "المكافآت المتاحة", balance: { int: member.card.availableRewards } },
    merchantLocations: walletLocations(member),
    hexBackgroundColor: walletColors(member).background,
    ...(artworkUrl ? { heroImage: { sourceUri: { uri: artworkUrl }, contentDescription: { defaultValue: { language: "ar", value: member.program.stampLabel } } } } : {}),
  };
}
