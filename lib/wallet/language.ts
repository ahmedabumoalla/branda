import { loyaltyLanguage } from "@/lib/loyalty/customer-language";
import { englishLoyaltyCopy, localizePublicProgram, publicProgramCopy } from "@/lib/loyalty/localize-public-copy";
import type { WalletMember } from "./types";

export async function walletInLanguage(member: WalletMember, requested: unknown): Promise<WalletMember> {
  const language = loyaltyLanguage(requested);
  if (language === "ar") return { ...member, language };

  const name = member.cafeNameEn?.trim() || member.cafeName;
  const { nearbyMessage, offerTitle, offerBody } = member.experience;
  const translate = await englishLoyaltyCopy([
    name, ...publicProgramCopy(member.program), nearbyMessage, offerTitle ?? "", offerBody ?? "",
    ...(member.branchLocations ?? []).flatMap(location => [location.nearbyMessage ?? "", location.branchName ?? ""]),
  ]);
  return {
    ...member, language, cafeName: translate(name),
    program: localizePublicProgram(member.program, translate),
    experience: { ...member.experience, nearbyMessage: translate(nearbyMessage),
      offerTitle: offerTitle && translate(offerTitle), offerBody: offerBody && translate(offerBody) },
    branchLocations: member.branchLocations?.map(location => ({ ...location,
      nearbyMessage: location.nearbyMessage && translate(location.nearbyMessage),
      branchName: location.branchName && translate(location.branchName) })),
  };
}
