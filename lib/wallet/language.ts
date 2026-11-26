import { hasLoyaltyLanguageChoice, loyaltyLanguage, loyaltyText } from "@/lib/loyalty/customer-language";
import type { WalletMember } from "./types";

export function walletInLanguage(member: WalletMember, requested: unknown): WalletMember {
  if (!hasLoyaltyLanguageChoice(member.cafeSlug)) return member;
  const language = loyaltyLanguage(member.cafeSlug, requested);
  if (language === "ar") return { ...member, language };
  const translate = (value: string) => loyaltyText(value, language);
  return {
    ...member, language, cafeName: translate(member.cafeName),
    program: { ...member.program, cardTitle: translate(member.program.cardTitle), stampLabel: translate(member.program.stampLabel),
      terms: translate(member.program.terms), rewardName: translate(member.program.rewardName) },
    experience: { ...member.experience, nearbyMessage: translate(member.experience.nearbyMessage),
      offerTitle: member.experience.offerTitle && translate(member.experience.offerTitle),
      offerBody: member.experience.offerBody && translate(member.experience.offerBody) },
    branchLocations: member.branchLocations?.map(location => ({ ...location,
      nearbyMessage: location.nearbyMessage && translate(location.nearbyMessage),
      branchName: location.branchName && translate(location.branchName) })),
  };
}
